/**
 * Relay protocol v1 reference model.
 *
 * A pure, deterministic re-statement of CapsuleRegistry's rules. Each action returns
 * either the new state (plus the events the contract would emit) or the exact custom
 * error the contract would revert with, checked in the same order. The parity suite runs
 * this model and the deployed contract side by side (PRD §13.4).
 */
import type { Hex } from "viem";
import { MAX_INVITES_PER_CALL, MAX_INVITES_PER_CIRCLE, type Lifecycle, type Policy } from "@relay/protocol-types";
import { hashPolicy, validatePolicy } from "./policy.ts";

export type Addr = string; // always stored lowercase

export interface MemberState {
  joined: boolean;
  consented: boolean;
  contributed: boolean;
  encryptionKeyFingerprint: Hex | null;
  commitment: Hex | null;
}

export interface CircleState {
  circleId: bigint;
  creator: Addr;
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
  members: Record<Addr, MemberState>;
  invites: Record<Addr, 1 | 2>;
  receipts: Record<Addr, Hex>;
}

export interface RegistryState {
  circleCount: bigint;
  relayerKeys: Record<Addr, Hex>;
  circles: Record<string, CircleState>;
}

export type RefError = { name: string; args: readonly (string | number | bigint)[] };

export type RefEvent =
  | { name: "RelayerKeyRegistered"; relayer: Addr; fingerprint: Hex }
  | { name: "CircleCreated"; circleId: bigint; creator: Addr; policyHash: Hex; metadataCommitment: Hex; policy: Policy }
  | { name: "PolicyUpdated"; circleId: bigint; policyHash: Hex; policy: Policy; creatorConsentCleared: boolean }
  | { name: "InvitationIssued"; circleId: bigint; inviteKey: Addr }
  | { name: "CircleOpened"; circleId: bigint; policyHash: Hex }
  | { name: "InvitationAccepted"; circleId: bigint; member: Addr; inviteKey: Addr; memberCount: number }
  | { name: "ConsentRecorded"; circleId: bigint; member: Addr; policyHash: Hex; fingerprint: Hex; consentCount: number }
  | { name: "ContributionCommitted"; circleId: bigint; member: Addr; commitment: Hex; contributionCount: number }
  | {
      name: "ReleaseEligibilityReached";
      circleId: bigint;
      eligibleAt: number;
      contributionCount: number;
      consentCount: number;
      memberCount: number;
    }
  | { name: "ReleaseReceiptRecorded"; circleId: bigint; relayer: Addr; deliveryDigest: Hex; receiptCount: number }
  | { name: "CapsuleCancelled"; circleId: bigint }
  | { name: "CapsuleExpired"; circleId: bigint };

export type Result = { ok: true; state: RegistryState; events: RefEvent[] } | { ok: false; error: RefError };

export type Action =
  | { type: "registerRelayerKey"; caller: Addr; fingerprint: Hex }
  | { type: "createCircle"; caller: Addr; policy: Policy; metadataCommitment: Hex }
  | { type: "updatePolicy"; caller: Addr; circleId: bigint; policy: Policy }
  | { type: "issueInvitations"; caller: Addr; circleId: bigint; inviteKeys: Addr[] }
  | { type: "openCircle"; caller: Addr; circleId: bigint }
  | { type: "cancel"; caller: Addr; circleId: bigint }
  /** `recoveredSigner` is what ecrecover returns for the supplied signature (zero address if malformed). */
  | { type: "acceptInvitation"; caller: Addr; circleId: bigint; inviteKey: Addr; recoveredSigner: Addr }
  | { type: "recordConsent"; caller: Addr; circleId: bigint; policyHash: Hex; fingerprint: Hex }
  | { type: "commitContribution"; caller: Addr; circleId: bigint; commitment: Hex }
  | { type: "requestRelease"; caller: Addr; circleId: bigint }
  | { type: "recordReleaseReceipt"; caller: Addr; circleId: bigint; deliveryDigest: Hex }
  | { type: "markExpired"; caller: Addr; circleId: bigint };

const ZERO32 = `0x${"0".repeat(64)}` as Hex;
const ZERO_ADDR = `0x${"0".repeat(40)}`;
const lc = (a: string) => a.toLowerCase();
const err = (name: string, ...args: (string | number | bigint)[]): Result => ({ ok: false, error: { name, args } });
const wrong = (l: Lifecycle): Result => err("WrongLifecycle", l);

export function emptyRegistry(): RegistryState {
  return { circleCount: 0n, relayerKeys: {}, circles: {} };
}

// ------------------------------------------------------------------ pure views

export function lifecycle(c: CircleState, now: number): Lifecycle {
  if (c.cancelled) return "CANCELLED";
  if (c.eligibleAt !== 0) return c.receiptCount >= c.policy.receiptThreshold ? "RELEASED" : "RELEASE_ELIGIBLE";
  if (!c.opened) return "DRAFT";
  if (now >= c.policy.sealAt) {
    if (c.policy.expiresAt !== 0 && now >= c.policy.expiresAt) return "EXPIRED";
    return "SEALED";
  }
  return c.ruleLocked ? "COLLECTING" : "AWAITING_CONSENT";
}

/** 0 when the rule is true; otherwise the RuleNotSatisfied code. */
export function unmetCondition(c: CircleState, now: number): 0 | 1 | 2 | 3 {
  if (now < c.policy.releaseAt) return 1;
  if (c.contributionCount < c.policy.minContributions) return 2;
  if (c.policy.unanimousConsent && c.consentCount !== c.memberCount) return 3;
  return 0;
}

export function releaseRuleStatus(c: CircleState, now: number): number {
  return lifecycle(c, now) === "SEALED" ? unmetCondition(c, now) : 255;
}

/**
 * Whether the rule can still become true. Once sealed, contributions and consents are
 * frozen, so a short count means the capsule can never release (display-only).
 */
export function ruleReachable(c: CircleState, now: number): boolean {
  const l = lifecycle(c, now);
  if (l === "CANCELLED" || l === "EXPIRED") return false;
  if (l === "RELEASE_ELIGIBLE" || l === "RELEASED") return true;
  if (l !== "SEALED") return true;
  if (c.contributionCount < c.policy.minContributions) return false;
  if (c.policy.unanimousConsent && c.consentCount !== c.memberCount) return false;
  return true;
}

// ------------------------------------------------------------------ transitions

function clone(s: RegistryState): RegistryState {
  return structuredClone(s);
}

function member(c: CircleState, a: Addr): MemberState {
  return (
    c.members[lc(a)] ?? { joined: false, consented: false, contributed: false, encryptionKeyFingerprint: null, commitment: null }
  );
}

function existing(s: RegistryState, id: bigint): CircleState | null {
  return s.circles[id.toString()] ?? null;
}

function invalidPolicy(s: RegistryState, policy: Policy, now: number): Result | null {
  const v = validatePolicy(policy, now, (r) => Boolean(s.relayerKeys[lc(r)]));
  if (!v) return null;
  if ("code" in v) return err("InvalidPolicy", v.code);
  return err("RelayerKeyMissing", lc(v.missingRelayer));
}

/** Apply one action at block timestamp `now`. Never mutates `prev`. */
export function apply(prev: RegistryState, action: Action, now: number): Result {
  const s = clone(prev);
  const caller = lc(action.caller);

  if (action.type === "registerRelayerKey") {
    if (action.fingerprint === ZERO32 || /^0x0+$/.test(action.fingerprint)) return err("ZeroValue");
    if (s.relayerKeys[caller]) return err("RelayerKeyAlreadyRegistered");
    s.relayerKeys[caller] = action.fingerprint;
    return { ok: true, state: s, events: [{ name: "RelayerKeyRegistered", relayer: caller, fingerprint: action.fingerprint }] };
  }

  if (action.type === "createCircle") {
    const bad = invalidPolicy(s, action.policy, now);
    if (bad) return bad;
    const circleId = s.circleCount + 1n;
    s.circleCount = circleId;
    const policy = { ...action.policy, relayers: [...action.policy.relayers] };
    const c: CircleState = {
      circleId,
      creator: caller,
      createdAt: now,
      eligibleAt: 0,
      opened: false,
      cancelled: false,
      expiredRecorded: false,
      ruleLocked: false,
      nonCreatorContributed: false,
      memberCount: 1,
      consentCount: 0,
      contributionCount: 0,
      invitesIssued: 0,
      receiptCount: 0,
      policyHash: hashPolicy(policy),
      metadataCommitment: action.metadataCommitment,
      policy,
      members: { [caller]: { joined: true, consented: false, contributed: false, encryptionKeyFingerprint: null, commitment: null } },
      invites: {},
      receipts: {},
    };
    s.circles[circleId.toString()] = c;
    return {
      ok: true,
      state: s,
      events: [
        { name: "CircleCreated", circleId, creator: caller, policyHash: c.policyHash, metadataCommitment: c.metadataCommitment, policy },
      ],
    };
  }

  const c = existing(s, action.circleId);
  if (!c) return err("UnknownCircle");
  const id = action.circleId;
  const state = lifecycle(c, now);
  const needCreator = () => (c.creator !== caller ? err("NotCreator") : null);

  switch (action.type) {
    case "updatePolicy": {
      const nc = needCreator();
      if (nc) return nc;
      if (c.ruleLocked) return err("RuleLocked");
      if (state !== "DRAFT" && state !== "AWAITING_CONSENT") return wrong(state);
      if (c.contributionCount !== 0) return err("ContributionsExist");
      const bad = invalidPolicy(s, action.policy, now);
      if (bad) return bad;
      if (action.policy.capacity < c.memberCount) return err("InvalidPolicy", 4);
      let cleared = false;
      const cm = member(c, c.creator);
      if (cm.consented) {
        cm.consented = false;
        c.consentCount -= 1;
        cleared = true;
        c.members[c.creator] = cm;
      }
      c.policy = { ...action.policy, relayers: [...action.policy.relayers] };
      c.policyHash = hashPolicy(c.policy);
      return {
        ok: true,
        state: s,
        events: [{ name: "PolicyUpdated", circleId: id, policyHash: c.policyHash, policy: c.policy, creatorConsentCleared: cleared }],
      };
    }

    case "issueInvitations": {
      const nc = needCreator();
      if (nc) return nc;
      if (state !== "DRAFT" && state !== "AWAITING_CONSENT" && state !== "COLLECTING") return wrong(state);
      const n = action.inviteKeys.length;
      if (n === 0 || n > MAX_INVITES_PER_CALL || c.invitesIssued + n > MAX_INVITES_PER_CIRCLE) return err("TooManyInvites");
      const events: RefEvent[] = [];
      for (const raw of action.inviteKeys) {
        const key = lc(raw);
        if (key === ZERO_ADDR || c.invites[key] !== undefined) return err("InvitationInvalid");
        c.invites[key] = 1;
        events.push({ name: "InvitationIssued", circleId: id, inviteKey: key });
      }
      c.invitesIssued += n;
      return { ok: true, state: s, events };
    }

    case "openCircle": {
      const nc = needCreator();
      if (nc) return nc;
      if (state !== "DRAFT") return wrong(state);
      if (now >= c.policy.sealAt) return err("InvalidPolicy", 1);
      c.opened = true;
      return { ok: true, state: s, events: [{ name: "CircleOpened", circleId: id, policyHash: c.policyHash }] };
    }

    case "cancel": {
      const nc = needCreator();
      if (nc) return nc;
      if (state !== "DRAFT" && state !== "AWAITING_CONSENT") return wrong(state);
      if (c.nonCreatorContributed) return err("ContributionsExist");
      c.cancelled = true;
      return { ok: true, state: s, events: [{ name: "CapsuleCancelled", circleId: id }] };
    }

    case "acceptInvitation": {
      if (state !== "AWAITING_CONSENT" && state !== "COLLECTING") return wrong(state);
      const key = lc(action.inviteKey);
      if (c.invites[key] !== 1) return err("InvitationInvalid");
      const m = member(c, caller);
      if (m.joined) return err("AlreadyMember");
      if (c.memberCount >= c.policy.capacity) return err("CircleFull");
      if (lc(action.recoveredSigner) !== key) return err("InvitationInvalid");
      c.invites[key] = 2;
      m.joined = true;
      c.members[caller] = m;
      c.memberCount += 1;
      return {
        ok: true,
        state: s,
        events: [{ name: "InvitationAccepted", circleId: id, member: caller, inviteKey: key, memberCount: c.memberCount }],
      };
    }

    case "recordConsent": {
      if (state !== "AWAITING_CONSENT" && state !== "COLLECTING") return wrong(state);
      const m = member(c, caller);
      if (!m.joined) return err("NotMember");
      if (m.consented) return err("AlreadyConsented");
      if (lc(action.policyHash) !== lc(c.policyHash)) return err("PolicyHashMismatch");
      if (/^0x0+$/.test(action.fingerprint)) return err("ZeroValue");
      m.consented = true;
      m.encryptionKeyFingerprint = action.fingerprint;
      c.members[caller] = m;
      c.consentCount += 1;
      if (caller !== c.creator) c.ruleLocked = true;
      return {
        ok: true,
        state: s,
        events: [
          { name: "ConsentRecorded", circleId: id, member: caller, policyHash: c.policyHash, fingerprint: action.fingerprint, consentCount: c.consentCount },
        ],
      };
    }

    case "commitContribution": {
      if (state !== "AWAITING_CONSENT" && state !== "COLLECTING") return wrong(state);
      const m = member(c, caller);
      if (!m.joined) return err("NotMember");
      if (!m.consented) return err("ConsentRequired");
      if (m.contributed) return err("AlreadyContributed");
      if (/^0x0+$/.test(action.commitment)) return err("ZeroValue");
      m.contributed = true;
      m.commitment = action.commitment;
      c.members[caller] = m;
      c.contributionCount += 1;
      if (caller !== c.creator) c.nonCreatorContributed = true;
      return {
        ok: true,
        state: s,
        events: [
          { name: "ContributionCommitted", circleId: id, member: caller, commitment: action.commitment, contributionCount: c.contributionCount },
        ],
      };
    }

    case "requestRelease": {
      if (state !== "SEALED") return wrong(state);
      const code = unmetCondition(c, now);
      if (code !== 0) return err("RuleNotSatisfied", code);
      c.eligibleAt = now;
      return {
        ok: true,
        state: s,
        events: [
          {
            name: "ReleaseEligibilityReached",
            circleId: id,
            eligibleAt: now,
            contributionCount: c.contributionCount,
            consentCount: c.consentCount,
            memberCount: c.memberCount,
          },
        ],
      };
    }

    case "recordReleaseReceipt": {
      if (c.eligibleAt === 0) return err("EligibilityNotRecorded");
      if (!c.policy.relayers.some((r) => lc(r) === caller)) return err("NotRelayer");
      if (c.receipts[caller]) return err("ReceiptAlreadyRecorded");
      if (/^0x0+$/.test(action.deliveryDigest)) return err("ZeroValue");
      c.receipts[caller] = action.deliveryDigest;
      c.receiptCount += 1;
      return {
        ok: true,
        state: s,
        events: [
          { name: "ReleaseReceiptRecorded", circleId: id, relayer: caller, deliveryDigest: action.deliveryDigest, receiptCount: c.receiptCount },
        ],
      };
    }

    case "markExpired": {
      if (state !== "EXPIRED" || c.expiredRecorded) return wrong(state);
      c.expiredRecorded = true;
      return { ok: true, state: s, events: [{ name: "CapsuleExpired", circleId: id }] };
    }
  }
}

/** Delivery status for a circle (PRD §9.3 "Release unavailable"). */
export function deliveryStatus(c: CircleState) {
  const threshold = c.policy.receiptThreshold;
  if (c.eligibleAt === 0) return { kind: "NOT_ELIGIBLE" as const };
  if (c.receiptCount >= threshold) return { kind: "RELEASED" as const, receipts: c.receiptCount, threshold };
  return {
    kind: "RELEASE_UNAVAILABLE" as const,
    receipts: c.receiptCount,
    threshold,
    missing: threshold - c.receiptCount,
  };
}
