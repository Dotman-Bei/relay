/**
 * Builds a verifier report for one capsule from an RPC endpoint (or a recorded trace).
 * Trust inputs: the RPC's answers and the contract bytecode, whose sha256 is compared with the
 * runtime bytecode this verifier was built against. No Relay server is consulted, except the
 * optional content-addressed storage check, which verifies hashes and relayer signatures.
 */
import { createPublicClient, http, recoverMessageAddress, type Hex, type PublicClient } from "viem";
import type { Deployment, DeliveryStatus, Lifecycle } from "@relay/protocol-types";
import { CAPSULE_REGISTRY_RUNTIME_SHA256 } from "@relay/protocol-types/bytecode";
import { deliveryStatus, lifecycle, type CircleState } from "@relay/reference";
import {
  deliverySigningBytes,
  fetchDelivery,
  fromHex,
  HttpBlobStore,
  RelayReader,
  sha256Bytes32,
  sha256Hex,
  type BlobStore,
} from "@relay/sdk";
import { replayCircle, type ReplayedEvent, type TraceEvent } from "./replay.ts";

export const VERIFIER_VERSION = "0.1.0";

export const STANDING_LIMITATIONS = [
  "Relay records consent and release; it does not prove plaintext was never copied. A contributor can keep their own plaintext, and a creator can keep anything they contributed.",
  "A colluding threshold of release relayers could reconstruct content keys before the release date. The verifier shows who the relayers are and how independent they are; it cannot detect off-chain collusion.",
  "Events do not carry the transaction sender for creator-only actions; the verifier relies on the audited contract bytecode (checked by hash) to enforce that only the creator performed them.",
  "The verifier trusts the RPC endpoint it is pointed at. Run it against more than one endpoint, or your own node, for stronger assurance.",
];

export interface ClaimedState {
  lifecycle?: string;
  receiptCount?: number;
  contributionCount?: number;
  released?: boolean;
}

export interface VerifierReport {
  schema: "relay.verifier-report/v1";
  verifierVersion: string;
  generatedAt: string;
  label: string;
  source: {
    kind: "rpc" | "trace";
    rpcUrl: string | null;
    chainId: number | null;
    registry: string;
    observedAtBlock: string | null;
    observedAt: number;
    runtimeSha256: string | null;
    expectedRuntimeSha256: string;
    bytecodeMatches: boolean | null;
  };
  circleId: string;
  rule: null | {
    policyHash: string;
    policyHashValid: boolean | null;
    releaseAt: number;
    sealAt: number;
    expiresAt: number;
    capacity: number;
    minContributions: number;
    unanimousConsent: boolean;
    receiptThreshold: number;
    relayers: string[];
    lockedByNonCreatorConsent: boolean;
  };
  events: (ReplayedEvent & { explorerUrl: string | null })[];
  evaluation: {
    lifecycle: Lifecycle | null;
    delivery: DeliveryStatus | null;
    eligibility: ReturnType<typeof replayCircle>["eligibility"];
    members: { address: string; consented: boolean; contributed: boolean; commitment: string | null }[];
  };
  relayers: {
    address: string;
    label: string;
    independence: string;
    receiptDigest: string | null;
    delivery: null | { fetched: boolean; hashMatches: boolean; signatureValid: boolean; coverage: string; error?: string };
  }[];
  crossCheck: { performed: boolean; matches: boolean | null; differences: string[] };
  claimedStateCheck: null | { claimed: ClaimedState; matches: boolean; differences: string[] };
  adminAuthority: string;
  limitations: string[];
  verdict: "VALID" | "INVALID";
  violations: string[];
}

export interface VerifyOptions {
  circleId: bigint;
  rpcUrl?: string;
  client?: PublicClient;
  registry: `0x${string}`;
  deploymentBlock?: bigint;
  deployment?: Deployment | null;
  label?: string;
  claimed?: ClaimedState | null;
  storage?: BlobStore | string | null;
}

function toTrace(events: Awaited<ReturnType<RelayReader["circleEvents"]>>): TraceEvent[] {
  return events.map((e) => ({
    name: e.name,
    args: e.args,
    blockNumber: e.blockNumber,
    logIndex: e.logIndex,
    transactionHash: e.transactionHash,
    blockTimestamp: e.blockTimestamp ?? 0,
  }));
}

export async function verifyFromChain(opts: VerifyOptions): Promise<VerifierReport> {
  const client = opts.client ?? createPublicClient({ transport: http(opts.rpcUrl) });
  const reader = new RelayReader(client, opts.registry, opts.deploymentBlock ?? 0n);
  const [chainId, block, code] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockTag: "latest" }),
    client.getCode({ address: opts.registry }),
  ]);
  const runtimeSha256 = code && code !== "0x" ? await sha256Hex(fromHex(code)) : null;

  const circleEvents = toTrace(await reader.circleEvents(opts.circleId, block.number));
  const created = circleEvents.find((e) => e.name === "CircleCreated");
  const relayers = created ? ((created.args.policy as { relayers: `0x${string}`[] }).relayers ?? []) : [];
  const relayerKeyEvents = toTrace(await reader.relayerKeyEvents(relayers));

  let onChain: Awaited<ReturnType<RelayReader["getCircle"]>> | null = null;
  try {
    onChain = await reader.getCircle(opts.circleId);
  } catch {
    onChain = null;
  }

  return buildReport({
    circleId: opts.circleId,
    circleEvents,
    relayerKeyEvents,
    observedAt: Number(block.timestamp),
    source: {
      kind: "rpc",
      rpcUrl: opts.rpcUrl ?? null,
      chainId,
      registry: opts.registry,
      observedAtBlock: block.number.toString(),
      observedAt: Number(block.timestamp),
      runtimeSha256,
      expectedRuntimeSha256: CAPSULE_REGISTRY_RUNTIME_SHA256,
      bytecodeMatches: runtimeSha256 === null ? false : runtimeSha256 === CAPSULE_REGISTRY_RUNTIME_SHA256,
    },
    onChain,
    deployment: opts.deployment ?? null,
    label: opts.label ?? opts.deployment?.label ?? "UNLABELLED",
    claimed: opts.claimed ?? null,
    storage: typeof opts.storage === "string" ? new HttpBlobStore(opts.storage) : (opts.storage ?? null),
  });
}

export async function buildReport(input: {
  circleId: bigint;
  circleEvents: TraceEvent[];
  relayerKeyEvents: TraceEvent[];
  observedAt: number;
  source: VerifierReport["source"];
  onChain: null | {
    lifecycle: Lifecycle;
    memberCount: number;
    consentCount: number;
    contributionCount: number;
    receiptCount: number;
    eligibleAt: number;
    policyHash: string;
  };
  deployment: Deployment | null;
  label: string;
  claimed: ClaimedState | null;
  storage: BlobStore | null;
}): Promise<VerifierReport> {
  const replay = replayCircle(input.circleId, input.circleEvents, input.relayerKeyEvents);
  const state: CircleState | null = replay.state;
  const violations = [...replay.violations];
  if (input.source.bytecodeMatches === false) {
    violations.push(
      `Registry bytecode sha256 ${input.source.runtimeSha256 ?? "(none)"} does not match the audited build ${input.source.expectedRuntimeSha256}; replay semantics cannot be assumed.`,
    );
  }

  const life = state ? lifecycle(state, input.observedAt) : null;
  const delivery = state ? deliveryStatus(state) : null;

  // Cross-check the replayed state with the contract's own view functions.
  const crossCheck: VerifierReport["crossCheck"] = { performed: false, matches: null, differences: [] };
  if (input.onChain && state) {
    crossCheck.performed = true;
    const d = crossCheck.differences;
    const cmp = (k: string, a: unknown, b: unknown) => {
      if (String(a).toLowerCase() !== String(b).toLowerCase()) d.push(`${k}: contract ${String(a)} ≠ replay ${String(b)}`);
    };
    cmp("lifecycle", input.onChain.lifecycle, life);
    cmp("memberCount", input.onChain.memberCount, state.memberCount);
    cmp("consentCount", input.onChain.consentCount, state.consentCount);
    cmp("contributionCount", input.onChain.contributionCount, state.contributionCount);
    cmp("receiptCount", input.onChain.receiptCount, state.receiptCount);
    cmp("eligibleAt", input.onChain.eligibleAt, state.eligibleAt);
    cmp("policyHash", input.onChain.policyHash, state.policyHash);
    crossCheck.matches = d.length === 0;
    for (const x of d) violations.push(`Cross-check: ${x}`);
  }

  // PRD §14: a server's claim is compared against state derived from the chain.
  let claimedStateCheck: VerifierReport["claimedStateCheck"] = null;
  if (input.claimed && state) {
    const differences: string[] = [];
    const c = input.claimed;
    if (c.lifecycle !== undefined && c.lifecycle !== life) differences.push(`claimed lifecycle ${c.lifecycle}, chain says ${life}`);
    if (c.receiptCount !== undefined && c.receiptCount !== state.receiptCount)
      differences.push(`claimed ${c.receiptCount} receipts, chain has ${state.receiptCount}`);
    if (c.contributionCount !== undefined && c.contributionCount !== state.contributionCount)
      differences.push(`claimed ${c.contributionCount} contributions, chain has ${state.contributionCount}`);
    if (c.released !== undefined && c.released !== (life === "RELEASED"))
      differences.push(`claimed released=${c.released}, chain says ${life}`);
    claimedStateCheck = { claimed: c, matches: differences.length === 0, differences };
  }

  const records = new Map((input.deployment?.quorum.relayers ?? []).map((r) => [r.address.toLowerCase(), r]));
  const relayerRows: VerifierReport["relayers"] = [];
  for (const r of state?.policy.relayers ?? []) {
    const rec = records.get(r.toLowerCase());
    const digest = state?.receipts[r.toLowerCase()] ?? null;
    const row: VerifierReport["relayers"][number] = {
      address: r,
      label: rec?.label ?? "UNKNOWN — not in the deployment record",
      independence: rec?.independence ?? "UNDISCLOSED",
      receiptDigest: digest,
      delivery: null,
    };
    if (digest && input.storage && state) {
      row.delivery = await checkDelivery(input.storage, digest as Hex, r, state);
    }
    relayerRows.push(row);
  }

  const explorer = input.deployment?.explorerUrl?.replace(/\/$/, "") ?? null;
  return {
    schema: "relay.verifier-report/v1",
    verifierVersion: VERIFIER_VERSION,
    generatedAt: new Date().toISOString(),
    label: input.label,
    source: input.source,
    circleId: input.circleId.toString(),
    rule: state
      ? {
          policyHash: state.policyHash,
          policyHashValid: replay.policyHashValid,
          releaseAt: state.policy.releaseAt,
          sealAt: state.policy.sealAt,
          expiresAt: state.policy.expiresAt,
          capacity: state.policy.capacity,
          minContributions: state.policy.minContributions,
          unanimousConsent: state.policy.unanimousConsent,
          receiptThreshold: state.policy.receiptThreshold,
          relayers: state.policy.relayers,
          lockedByNonCreatorConsent: state.ruleLocked,
        }
      : null,
    events: replay.events.map((e) => ({ ...e, explorerUrl: explorer ? `${explorer}/tx/${e.transactionHash}` : null })),
    evaluation: {
      lifecycle: life,
      delivery,
      eligibility: replay.eligibility,
      members: state
        ? Object.entries(state.members).map(([address, m]) => ({
            address,
            consented: m.consented,
            contributed: m.contributed,
            commitment: m.commitment,
          }))
        : [],
    },
    relayers: relayerRows,
    crossCheck,
    claimedStateCheck,
    adminAuthority: "None. CapsuleRegistry has no owner, pause, upgrade or admin function; the bytecode hash above pins that build.",
    limitations: [
      ...STANDING_LIMITATIONS,
      ...(input.label === "LOCAL FIXTURE" ? ["LOCAL FIXTURE: this run used a local development chain, not BOT Chain."] : []),
    ],
    verdict: violations.length === 0 ? "VALID" : "INVALID",
    violations,
  };
}

async function checkDelivery(store: BlobStore, digest: Hex, relayer: string, state: CircleState) {
  try {
    const d = await fetchDelivery(store, digest);
    const { signature, ...unsigned } = d;
    const signingHash = await sha256Bytes32(deliverySigningBytes(unsigned));
    const signer = await recoverMessageAddress({ message: { raw: signingHash }, signature: signature as Hex });
    const entitled = Object.entries(state.members).filter(([, m]) => m.consented).map(([a]) => a);
    const commitments = Object.values(state.members).flatMap((m) => (m.commitment ? [m.commitment.toLowerCase()] : []));
    const have = new Set(d.deliveries.map((x) => `${x.member.toLowerCase()}|${x.contribution.toLowerCase()}`));
    let covered = 0;
    for (const m of entitled) for (const c of commitments) if (have.has(`${m}|${c}`)) covered++;
    return {
      fetched: true,
      hashMatches: true,
      signatureValid: signer.toLowerCase() === relayer.toLowerCase() && d.relayer.toLowerCase() === relayer.toLowerCase(),
      coverage: `${covered}/${entitled.length * commitments.length} member×contribution shares`,
    };
  } catch (e) {
    return {
      fetched: false,
      hashMatches: false,
      signatureValid: false,
      coverage: "unknown",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
