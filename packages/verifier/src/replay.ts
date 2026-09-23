/**
 * Replays one capsule's on-chain event history through the reference model.
 *
 * Every event is re-applied as the action that must have produced it, at its block timestamp.
 * If the reference model would have rejected that action, or computes different counts, hashes
 * or timestamps than the event carries, the history violates the lifecycle invariants.
 * Pure and browser-safe: the /verify page and the CLI both call this.
 */
import type { Hex } from "viem";
import type { Lifecycle, Policy } from "@relay/protocol-types";
import {
  apply,
  deliveryStatus,
  emptyRegistry,
  hashPolicy,
  lifecycle,
  type Action,
  type CircleState,
  type RefEvent,
  type RegistryState,
} from "@relay/reference";

/** A decoded registry event with its block timestamp (chain or trace file). */
export interface TraceEvent {
  name: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  blockTimestamp: number;
}

export interface ReplayedEvent {
  index: number;
  name: string;
  blockNumber: string;
  logIndex: number;
  transactionHash: Hex;
  timestamp: number;
  actor: string | null;
  summary: string;
  accepted: boolean;
  violation: string | null;
}

export interface ReplayResult {
  circleId: string;
  state: CircleState | null;
  events: ReplayedEvent[];
  violations: string[];
  policyHashValid: boolean | null;
  eligibility: null | {
    at: number;
    releaseAt: number;
    contributions: number;
    minContributions: number;
    consents: number;
    members: number;
    unanimousConsent: boolean;
    ruleSatisfied: boolean;
  };
}

const lc = (v: unknown) => String(v).toLowerCase();
const num = (v: unknown) => Number(v as bigint | number);

function policyFromArgs(p: Record<string, unknown>): Policy {
  return {
    sealAt: num(p.sealAt),
    releaseAt: num(p.releaseAt),
    expiresAt: num(p.expiresAt),
    capacity: num(p.capacity),
    minContributions: num(p.minContributions),
    unanimousConsent: Boolean(p.unanimousConsent),
    receiptThreshold: num(p.receiptThreshold),
    relayers: (p.relayers as string[]).map((r) => r as `0x${string}`),
  };
}

const short = (a: unknown) => {
  const s = String(a);
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
};

function toAction(e: TraceEvent, creator: string | null): { action: Action; actor: string | null; summary: string } | null {
  const a = e.args;
  const circleId = a.circleId !== undefined ? BigInt(a.circleId as bigint) : 0n;
  const creatorOrUnknown = creator ?? "0x0000000000000000000000000000000000000000";
  switch (e.name) {
    case "RelayerKeyRegistered":
      return {
        action: { type: "registerRelayerKey", caller: lc(a.relayer), fingerprint: a.encryptionKeyFingerprint as Hex },
        actor: lc(a.relayer),
        summary: `Relayer ${short(a.relayer)} published key ${short(a.encryptionKeyFingerprint)}`,
      };
    case "CircleCreated": {
      const policy = policyFromArgs(a.policy as Record<string, unknown>);
      return {
        action: { type: "createCircle", caller: lc(a.creator), policy, metadataCommitment: a.metadataCommitment as Hex },
        actor: lc(a.creator),
        summary: `Circle created by ${short(a.creator)} with rule ${short(a.policyHash)}`,
      };
    }
    case "PolicyUpdated":
      return {
        action: { type: "updatePolicy", caller: creatorOrUnknown, circleId, policy: policyFromArgs(a.policy as Record<string, unknown>) },
        actor: creator,
        summary: `Rule replaced before lock → ${short(a.policyHash)}${a.creatorConsentCleared ? " (creator consent cleared)" : ""}`,
      };
    case "InvitationIssued":
      return {
        action: { type: "issueInvitations", caller: creatorOrUnknown, circleId, inviteKeys: [lc(a.inviteKey)] },
        actor: creator,
        summary: `Invitation key ${short(a.inviteKey)} issued`,
      };
    case "CircleOpened":
      return { action: { type: "openCircle", caller: creatorOrUnknown, circleId }, actor: creator, summary: "Rule published; consent open" };
    case "InvitationAccepted":
      return {
        action: { type: "acceptInvitation", caller: lc(a.member), circleId, inviteKey: lc(a.inviteKey), recoveredSigner: lc(a.inviteKey) },
        actor: lc(a.member),
        summary: `${short(a.member)} joined (member ${num(a.memberCount)})`,
      };
    case "ConsentRecorded":
      return {
        action: { type: "recordConsent", caller: lc(a.member), circleId, policyHash: a.policyHash as Hex, fingerprint: a.encryptionKeyFingerprint as Hex },
        actor: lc(a.member),
        summary: `${short(a.member)} consented to rule ${short(a.policyHash)}`,
      };
    case "ContributionCommitted":
      return {
        action: { type: "commitContribution", caller: lc(a.member), circleId, commitment: a.commitment as Hex },
        actor: lc(a.member),
        summary: `${short(a.member)} committed ${short(a.commitment)}`,
      };
    case "ReleaseEligibilityReached":
      return {
        action: { type: "requestRelease", caller: "0x0000000000000000000000000000000000000000", circleId },
        actor: null,
        summary: `Release eligibility recorded (${num(a.contributionCount)} contributions, ${num(a.consentCount)}/${num(a.memberCount)} consents)`,
      };
    case "ReleaseReceiptRecorded":
      return {
        action: { type: "recordReleaseReceipt", caller: lc(a.relayer), circleId, deliveryDigest: a.deliveryDigest as Hex },
        actor: lc(a.relayer),
        summary: `Relayer ${short(a.relayer)} recorded receipt ${num(a.receiptCount)} (${short(a.deliveryDigest)})`,
      };
    case "CapsuleCancelled":
      return { action: { type: "cancel", caller: creatorOrUnknown, circleId }, actor: creator, summary: "Cancelled by creator" };
    case "CapsuleExpired":
      return { action: { type: "markExpired", caller: "0x0000000000000000000000000000000000000000", circleId }, actor: null, summary: "Expiry recorded" };
    default:
      return null;
  }
}

/** Fields the chain event carries that the reference model must reproduce exactly. */
function compare(chain: TraceEvent, ref: RefEvent | undefined): string | null {
  if (!ref) return "reference model emitted no matching event";
  if (ref.name !== chain.name) return `reference emitted ${ref.name}, chain has ${chain.name}`;
  const a = chain.args;
  const diffs: string[] = [];
  const eq = (field: string, chainV: unknown, refV: unknown) => {
    if (lc(chainV) !== lc(refV)) diffs.push(`${field}: chain ${String(chainV)} ≠ reference ${String(refV)}`);
  };
  switch (ref.name) {
    case "CircleCreated":
      eq("policyHash", a.policyHash, ref.policyHash);
      break;
    case "PolicyUpdated":
      eq("policyHash", a.policyHash, ref.policyHash);
      eq("creatorConsentCleared", a.creatorConsentCleared, ref.creatorConsentCleared);
      break;
    case "CircleOpened":
      eq("policyHash", a.policyHash, ref.policyHash);
      break;
    case "InvitationAccepted":
      eq("memberCount", num(a.memberCount), ref.memberCount);
      break;
    case "ConsentRecorded":
      eq("consentCount", num(a.consentCount), ref.consentCount);
      eq("policyHash", a.policyHash, ref.policyHash);
      break;
    case "ContributionCommitted":
      eq("contributionCount", num(a.contributionCount), ref.contributionCount);
      break;
    case "ReleaseEligibilityReached":
      eq("eligibleAt", num(a.eligibleAt), ref.eligibleAt);
      eq("contributionCount", num(a.contributionCount), ref.contributionCount);
      eq("consentCount", num(a.consentCount), ref.consentCount);
      eq("memberCount", num(a.memberCount), ref.memberCount);
      break;
    case "ReleaseReceiptRecorded":
      eq("receiptCount", num(a.receiptCount), ref.receiptCount);
      break;
    default:
      break;
  }
  return diffs.length ? diffs.join("; ") : null;
}

export function sortTrace(events: TraceEvent[]): TraceEvent[] {
  return [...events].sort((x, y) =>
    x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1,
  );
}

/**
 * Replay `circleEvents` (all events whose first topic is `circleId`) together with the
 * RelayerKeyRegistered events of the policy's relayers. Events are applied in chain order.
 */
export function replayCircle(circleId: bigint, circleEvents: TraceEvent[], relayerKeyEvents: TraceEvent[]): ReplayResult {
  const violations: string[] = [];
  const out: ReplayedEvent[] = [];
  let reg: RegistryState = emptyRegistry();
  reg.circleCount = circleId - 1n; // the verifier replays one circle in isolation
  let creator: string | null = null;
  let policyHashValid: boolean | null = null;
  let eligibility: ReplayResult["eligibility"] = null;

  const all = sortTrace([...relayerKeyEvents, ...circleEvents]);
  const circleKey = circleId.toString();
  let seenCreate = false;

  all.forEach((e, index) => {
    const mapped = toAction(e, creator);
    const base: ReplayedEvent = {
      index,
      name: e.name,
      blockNumber: e.blockNumber.toString(),
      logIndex: e.logIndex,
      transactionHash: e.transactionHash,
      timestamp: e.blockTimestamp,
      actor: mapped?.actor ?? null,
      summary: mapped?.summary ?? e.name,
      accepted: false,
      violation: null,
    };
    if (!mapped) {
      base.violation = `Unknown event ${e.name}`;
      violations.push(`#${index} ${base.violation}`);
      out.push(base);
      return;
    }
    if (e.name !== "RelayerKeyRegistered" && e.name !== "CircleCreated" && !seenCreate) {
      base.violation = `${e.name} precedes CircleCreated`;
      violations.push(`#${index} ${base.violation}`);
      out.push(base);
      return;
    }
    if (e.name === "CircleCreated") {
      if (seenCreate) {
        base.violation = "Second CircleCreated for the same id";
        violations.push(`#${index} ${base.violation}`);
        out.push(base);
        return;
      }
      if (BigInt(e.args.circleId as bigint) !== circleId) {
        base.violation = `CircleCreated for id ${String(e.args.circleId)}, expected ${circleId}`;
        violations.push(`#${index} ${base.violation}`);
        out.push(base);
        return;
      }
      const recomputed = hashPolicy(policyFromArgs(e.args.policy as Record<string, unknown>));
      policyHashValid = lc(recomputed) === lc(e.args.policyHash);
      creator = lc(e.args.creator);
      seenCreate = true;
    }
    if (e.name === "RelayerKeyRegistered" && reg.relayerKeys[lc(e.args.relayer)]) {
      out.push({ ...base, accepted: true }); // duplicate key events for other circles' queries are harmless
      return;
    }

    const before = reg.circles[circleKey];
    const action = e.name === "CircleCreated" || e.name === "RelayerKeyRegistered" ? mapped.action : { ...mapped.action };
    if (action.type !== "registerRelayerKey" && action.type !== "createCircle" && creator && "caller" in action) {
      if (["updatePolicy", "issueInvitations", "openCircle", "cancel"].includes(action.type)) action.caller = creator;
    }
    const res = apply(reg, action, e.blockTimestamp);
    if (!res.ok) {
      base.violation = `Reference model rejects this: ${res.error.name}(${res.error.args.join(", ")}) at t=${e.blockTimestamp}`;
      violations.push(`#${index} ${e.name}: ${base.violation}`);
      out.push(base);
      return;
    }
    const mismatch = compare(e, res.events.find((x) => x.name === e.name));
    if (mismatch) {
      base.violation = `Event fields disagree with the reference model: ${mismatch}`;
      violations.push(`#${index} ${e.name}: ${mismatch}`);
    }
    if (e.name === "ReleaseEligibilityReached" && before) {
      const p = before.policy;
      eligibility = {
        at: e.blockTimestamp,
        releaseAt: p.releaseAt,
        contributions: before.contributionCount,
        minContributions: p.minContributions,
        consents: before.consentCount,
        members: before.memberCount,
        unanimousConsent: p.unanimousConsent,
        ruleSatisfied:
          e.blockTimestamp >= p.releaseAt &&
          before.contributionCount >= p.minContributions &&
          (!p.unanimousConsent || before.consentCount === before.memberCount),
      };
    }
    reg = res.state;
    out.push({ ...base, accepted: base.violation === null });
  });

  if (!seenCreate) violations.push(`No CircleCreated event found for circle ${circleId}`);
  if (policyHashValid === false) violations.push("CircleCreated.policyHash is not the hash of the emitted policy");

  return { circleId: circleKey, state: reg.circles[circleKey] ?? null, events: out, violations, policyHashValid, eligibility };
}

export function observedLifecycle(state: CircleState | null, now: number): Lifecycle | null {
  return state ? lifecycle(state, now) : null;
}

export { deliveryStatus };
