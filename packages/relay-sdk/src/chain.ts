/**
 * Typed CapsuleRegistry reads, event decoding and write preparation over any EIP-1193 RPC.
 * Nothing here calls Relay's backend: a member, a relayer and the verifier can all read
 * a capsule from the chain alone.
 */
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeEventLog,
  pad,
  toHex,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { capsuleRegistryAbi, lifecycleFromIndex, POLICY_CODES, RULE_CODES, type Lifecycle, type Policy } from "@relay/protocol-types";

export type ChainPolicy = {
  sealAt: bigint;
  releaseAt: bigint;
  expiresAt: bigint;
  capacity: number;
  minContributions: number;
  unanimousConsent: boolean;
  receiptThreshold: number;
  relayers: readonly `0x${string}`[];
};

export function toChainPolicy(p: Policy): ChainPolicy {
  return {
    sealAt: BigInt(p.sealAt),
    releaseAt: BigInt(p.releaseAt),
    expiresAt: BigInt(p.expiresAt),
    capacity: p.capacity,
    minContributions: p.minContributions,
    unanimousConsent: p.unanimousConsent,
    receiptThreshold: p.receiptThreshold,
    relayers: p.relayers,
  };
}

export function fromChainPolicy(p: ChainPolicy): Policy {
  return {
    sealAt: Number(p.sealAt),
    releaseAt: Number(p.releaseAt),
    expiresAt: Number(p.expiresAt),
    capacity: Number(p.capacity),
    minContributions: Number(p.minContributions),
    unanimousConsent: p.unanimousConsent,
    receiptThreshold: Number(p.receiptThreshold),
    relayers: [...p.relayers],
  };
}

export interface CircleView {
  circleId: bigint;
  creator: `0x${string}`;
  createdAt: number;
  eligibleAt: number;
  opened: boolean;
  cancelled: boolean;
  expiredRecorded: boolean;
  ruleLocked: boolean;
  nonCreatorContributed: boolean;
  memberCount: number;
  consentCount: number;
  contributionCount: number;
  invitesIssued: number;
  receiptCount: number;
  policyHash: Hex;
  metadataCommitment: Hex;
  policy: Policy;
  lifecycle: Lifecycle;
  ruleStatus: number;
}

export interface MemberView {
  joined: boolean;
  consented: boolean;
  contributed: boolean;
  encryptionKeyFingerprint: Hex;
  commitment: Hex;
}

// ------------------------------------------------------------------ events

export type RegistryEventName =
  | "RelayerKeyRegistered"
  | "CircleCreated"
  | "PolicyUpdated"
  | "InvitationIssued"
  | "CircleOpened"
  | "InvitationAccepted"
  | "ConsentRecorded"
  | "ContributionCommitted"
  | "ReleaseEligibilityReached"
  | "ReleaseReceiptRecorded"
  | "CapsuleCancelled"
  | "CapsuleExpired";

export interface RegistryEvent {
  name: RegistryEventName;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  /** Filled by `withTimestamps`. */
  blockTimestamp?: number;
}

export function decodeRegistryLog(log: Pick<Log, "data" | "topics" | "blockNumber" | "logIndex" | "transactionHash">): RegistryEvent {
  const decoded = decodeEventLog({ abi: capsuleRegistryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
  return {
    name: decoded.eventName as RegistryEventName,
    args: decoded.args as unknown as Record<string, unknown>,
    blockNumber: log.blockNumber ?? 0n,
    logIndex: log.logIndex ?? 0,
    transactionHash: (log.transactionHash ?? "0x") as Hex,
  };
}

export const topicForUint = (n: bigint) => pad(toHex(n), { size: 32 });
export const topicForAddress = (a: string) => pad(a.toLowerCase() as Hex, { size: 32 });

/** eth_getLogs in bounded ranges (the public BOT Chain testnet RPC served 100k-block ranges when probed). */
export async function fetchLogs(
  client: PublicClient,
  args: { address: `0x${string}`; topics: (Hex | null)[]; fromBlock: bigint; toBlock?: bigint; chunk?: bigint },
): Promise<RegistryEvent[]> {
  // cacheTime 0: viem otherwise reuses a block number for up to pollingInterval, which silently
  // truncates the range to a stale head (found by the proof run: a relayer missed fresh commits).
  const to = args.toBlock ?? (await client.getBlockNumber({ cacheTime: 0 }));
  const chunk = args.chunk ?? 50_000n;
  const out: RegistryEvent[] = [];
  for (let from = args.fromBlock; from <= to; from += chunk) {
    const end = from + chunk - 1n < to ? from + chunk - 1n : to;
    const logs = (await client.request({
      method: "eth_getLogs",
      params: [{ address: args.address, topics: args.topics, fromBlock: toHex(from), toBlock: toHex(end) }],
    })) as { data: Hex; topics: Hex[]; blockNumber: Hex; logIndex: Hex; transactionHash: Hex }[];
    for (const l of logs) {
      out.push(
        decodeRegistryLog({
          data: l.data,
          topics: l.topics as [Hex, ...Hex[]],
          blockNumber: BigInt(l.blockNumber),
          logIndex: Number(l.logIndex),
          transactionHash: l.transactionHash,
        }),
      );
    }
  }
  return out.sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}

export async function withTimestamps(client: PublicClient, events: RegistryEvent[]): Promise<RegistryEvent[]> {
  const cache = new Map<bigint, number>();
  for (const e of events) {
    if (!cache.has(e.blockNumber)) {
      const b = await client.getBlock({ blockNumber: e.blockNumber });
      cache.set(e.blockNumber, Number(b.timestamp));
    }
    e.blockTimestamp = cache.get(e.blockNumber)!;
  }
  return events;
}

// ------------------------------------------------------------------ reader

export class RelayReader {
  constructor(
    readonly client: PublicClient,
    readonly registry: `0x${string}`,
    readonly deploymentBlock: bigint = 0n,
  ) {}

  private read<T>(functionName: string, args: readonly unknown[] = []): Promise<T> {
    return this.client.readContract({
      address: this.registry,
      abi: capsuleRegistryAbi,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;
  }

  async circleCount(): Promise<bigint> {
    return this.read<bigint>("circleCount");
  }

  async getCircle(circleId: bigint): Promise<CircleView> {
    const [c, p, l, rs] = await Promise.all([
      this.read<Record<string, unknown>>("getCircle", [circleId]),
      this.read<ChainPolicy>("getPolicy", [circleId]),
      this.read<number>("lifecycleOf", [circleId]),
      this.read<number>("releaseRuleStatus", [circleId]),
    ]);
    return {
      circleId,
      creator: c.creator as `0x${string}`,
      createdAt: Number(c.createdAt),
      eligibleAt: Number(c.eligibleAt),
      opened: Boolean(c.opened),
      cancelled: Boolean(c.cancelled),
      expiredRecorded: Boolean(c.expiredRecorded),
      ruleLocked: Boolean(c.ruleLocked),
      nonCreatorContributed: Boolean(c.nonCreatorContributed),
      memberCount: Number(c.memberCount),
      consentCount: Number(c.consentCount),
      contributionCount: Number(c.contributionCount),
      invitesIssued: Number(c.invitesIssued),
      receiptCount: Number(c.receiptCount),
      policyHash: c.policyHash as Hex,
      metadataCommitment: c.metadataCommitment as Hex,
      policy: fromChainPolicy(p),
      lifecycle: lifecycleFromIndex(l),
      ruleStatus: Number(rs),
    };
  }

  async getMember(circleId: bigint, member: `0x${string}`): Promise<MemberView> {
    const m = await this.read<MemberView>("getMember", [circleId, member]);
    return { ...m };
  }

  async circlesOf(account: `0x${string}`): Promise<bigint[]> {
    return [...(await this.read<readonly bigint[]>("circlesOf", [account]))];
  }

  async relayerKeyOf(relayer: `0x${string}`): Promise<Hex> {
    return this.read<Hex>("relayerKeyOf", [relayer]);
  }

  async receiptOf(circleId: bigint, relayer: `0x${string}`): Promise<Hex> {
    return this.read<Hex>("receiptOf", [circleId, relayer]);
  }

  async inviteStateOf(circleId: bigint, inviteKey: `0x${string}`): Promise<number> {
    return Number(await this.read<number>("inviteStateOf", [circleId, inviteKey]));
  }

  async inviteDigest(circleId: bigint, member: `0x${string}`): Promise<Hex> {
    return this.read<Hex>("inviteDigest", [circleId, member]);
  }

  /** Every event for one circle, ordered, with block timestamps. */
  async circleEvents(circleId: bigint, toBlock?: bigint): Promise<RegistryEvent[]> {
    const events = await fetchLogs(this.client, {
      address: this.registry,
      topics: [null, topicForUint(circleId)],
      fromBlock: this.deploymentBlock,
      ...(toBlock !== undefined ? { toBlock } : {}),
    });
    return withTimestamps(this.client, events.filter((e) => e.name !== "RelayerKeyRegistered"));
  }

  /** Lifecycle events where `account` is the indexed member, creator or relayer. */
  async accountEvents(account: `0x${string}`): Promise<RegistryEvent[]> {
    const events = await fetchLogs(this.client, {
      address: this.registry,
      topics: [null, null, topicForAddress(account)],
      fromBlock: this.deploymentBlock,
    });
    const relayerKeys = await fetchLogs(this.client, {
      address: this.registry,
      topics: [null, topicForAddress(account)],
      fromBlock: this.deploymentBlock,
    });
    return withTimestamps(
      this.client,
      [...events, ...relayerKeys.filter((e) => e.name === "RelayerKeyRegistered")].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
      ),
    );
  }

  async relayerKeyEvents(relayers: readonly `0x${string}`[]): Promise<RegistryEvent[]> {
    const out: RegistryEvent[] = [];
    for (const r of relayers) {
      out.push(
        ...(await fetchLogs(this.client, { address: this.registry, topics: [null, topicForAddress(r)], fromBlock: this.deploymentBlock })).filter(
          (e) => e.name === "RelayerKeyRegistered",
        ),
      );
    }
    return withTimestamps(this.client, out);
  }
}

// ------------------------------------------------------------------ write preparation

export interface PreparedWrite {
  address: `0x${string}`;
  abi: typeof capsuleRegistryAbi;
  functionName:
    | "registerRelayerKey"
    | "createCircle"
    | "updatePolicy"
    | "issueInvitations"
    | "openCircle"
    | "cancel"
    | "acceptInvitation"
    | "recordConsent"
    | "commitContribution"
    | "requestRelease"
    | "recordReleaseReceipt"
    | "markExpired";
  args: readonly unknown[];
  /** Human label for pending / success / failure states. */
  label: string;
}

export function prepare(registry: `0x${string}`) {
  const w = (functionName: PreparedWrite["functionName"], args: readonly unknown[], label: string): PreparedWrite => ({
    address: registry,
    abi: capsuleRegistryAbi,
    functionName,
    args,
    label,
  });
  return {
    registerRelayerKey: (fp: Hex) => w("registerRelayerKey", [fp], "Register relayer key"),
    createCircle: (p: Policy, metadataCommitment: Hex) => w("createCircle", [toChainPolicy(p), metadataCommitment], "Create Circle"),
    updatePolicy: (id: bigint, p: Policy) => w("updatePolicy", [id, toChainPolicy(p)], "Update rule"),
    issueInvitations: (id: bigint, keys: `0x${string}`[]) => w("issueInvitations", [id, keys], "Issue invitations"),
    openCircle: (id: bigint) => w("openCircle", [id], "Open Circle for consent"),
    cancel: (id: bigint) => w("cancel", [id], "Cancel Circle"),
    acceptInvitation: (id: bigint, key: `0x${string}`, sig: Hex) => w("acceptInvitation", [id, key, sig], "Accept invitation"),
    recordConsent: (id: bigint, policyHash: Hex, fp: Hex) => w("recordConsent", [id, policyHash, fp], "Record consent"),
    commitContribution: (id: bigint, commitment: Hex) => w("commitContribution", [id, commitment], "Commit contribution"),
    requestRelease: (id: bigint) => w("requestRelease", [id], "Record release eligibility"),
    recordReleaseReceipt: (id: bigint, digest: Hex) => w("recordReleaseReceipt", [id, digest], "Record release receipt"),
    markExpired: (id: bigint) => w("markExpired", [id], "Record expiry"),
  };
}

// ------------------------------------------------------------------ errors

export interface RelayRevert {
  name: string;
  args: readonly unknown[];
  reason: string;
}

const LIFECYCLE_WORDS: Record<Lifecycle, string> = {
  DRAFT: "still a draft",
  AWAITING_CONSENT: "awaiting consent",
  COLLECTING: "collecting contributions",
  SEALED: "sealed",
  RELEASE_ELIGIBLE: "already release-eligible",
  RELEASED: "already released",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

export function explainRevert(name: string, args: readonly unknown[]): string {
  switch (name) {
    case "WrongLifecycle": {
      const l = lifecycleFromIndex(Number(args[0]));
      return `Not allowed while the Circle is ${LIFECYCLE_WORDS[l]}.`;
    }
    case "RuleNotSatisfied":
      return `The release rule is not true yet: ${RULE_CODES[Number(args[0]) as keyof typeof RULE_CODES] ?? "unknown condition"}.`;
    case "InvalidPolicy":
      return POLICY_CODES[Number(args[0]) as keyof typeof POLICY_CODES] ?? "The rule is invalid.";
    case "RelayerKeyMissing":
      return `Relayer ${String(args[0])} has not published an encryption key.`;
    case "RuleLocked":
      return "The rule is locked: another member has already consented to it.";
    case "ContributionsExist":
      return "Contributions have already been committed under this rule.";
    case "PolicyHashMismatch":
      return "The rule changed since you read it. Review the current rule and consent again.";
    case "NotCreator":
      return "Only the Circle's creator can do this.";
    case "NotMember":
      return "You are not a member of this Circle.";
    case "AlreadyMember":
      return "You have already joined this Circle.";
    case "AlreadyConsented":
      return "You have already consented.";
    case "ConsentRequired":
      return "Consent to the rule before contributing.";
    case "AlreadyContributed":
      return "You have already committed your contribution. One per member.";
    case "ZeroValue":
      return "A required value was empty.";
    case "InvitationInvalid":
      return "This invitation is invalid, already used, or signed for someone else.";
    case "TooManyInvites":
      return "Too many invitations for this Circle.";
    case "CircleFull":
      return "This Circle is full.";
    case "EligibilityNotRecorded":
      return "Release eligibility has not been recorded on-chain yet.";
    case "NotRelayer":
      return "This address is not in the capsule's release quorum.";
    case "ReceiptAlreadyRecorded":
      return "This relayer already recorded its receipt.";
    case "RelayerKeyAlreadyRegistered":
      return "This relayer key is already registered.";
    case "UnknownCircle":
      return "No Circle with this id exists on this registry.";
    default:
      return name;
  }
}

/** Extract the registry's custom error from a viem error chain, if there is one. */
export function decodeRevert(error: unknown): RelayRevert | null {
  if (!(error instanceof BaseError)) return null;
  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
    const args = (revert.data.args ?? []) as readonly unknown[];
    return { name: revert.data.errorName, args, reason: explainRevert(revert.data.errorName, args) };
  }
  return null;
}

/** A one-line, user-facing reason for any failure (revert, rejection, network). */
export function describeError(error: unknown): string {
  const r = decodeRevert(error);
  if (r) return r.reason;
  if (error instanceof BaseError) {
    if (/user rejected|denied/i.test(error.shortMessage)) return "You rejected the request in your wallet.";
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : String(error);
}
