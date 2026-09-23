/**
 * PRD §13.7 verifier tests: mutate event order, contributor identity, rule data and receipt
 * timing in a valid history; the verifier must reject every mutation.
 */
import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import type { Policy } from "@relay/protocol-types";
import { apply, emptyRegistry, type Action, type RefEvent, type RegistryState } from "@relay/reference";
import { buildReport, replayCircle, type TraceEvent } from "../src/index.ts";

const CREATOR = "0x00000000000000000000000000000000000000c0";
const ALICE = "0x00000000000000000000000000000000000000a1";
const OUTSIDER = "0x00000000000000000000000000000000000000ee";
const R = ["0x0000000000000000000000000000000000000071", "0x0000000000000000000000000000000000000072"] as `0x${string}`[];
const T0 = 1_800_000_000;
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const INVITE = "0x00000000000000000000000000000000000001a1";

const policy: Policy = {
  sealAt: T0 + 100, releaseAt: T0 + 200, expiresAt: 0, capacity: 3, minContributions: 2,
  unanimousConsent: true, receiptThreshold: 2, relayers: R,
};

/** Convert a reference event into the shape viem's decodeEventLog produces. */
function asChainArgs(e: RefEvent): Record<string, unknown> {
  const p = (x: Policy) => ({ ...x, sealAt: BigInt(x.sealAt), releaseAt: BigInt(x.releaseAt), expiresAt: BigInt(x.expiresAt) });
  switch (e.name) {
    case "RelayerKeyRegistered": return { relayer: e.relayer, encryptionKeyFingerprint: e.fingerprint };
    case "CircleCreated": return { circleId: e.circleId, creator: e.creator, policyHash: e.policyHash, metadataCommitment: e.metadataCommitment, policy: p(e.policy) };
    case "PolicyUpdated": return { circleId: e.circleId, policyHash: e.policyHash, policy: p(e.policy), creatorConsentCleared: e.creatorConsentCleared };
    case "InvitationIssued": return { circleId: e.circleId, inviteKey: e.inviteKey };
    case "CircleOpened": return { circleId: e.circleId, policyHash: e.policyHash };
    case "InvitationAccepted": return { circleId: e.circleId, member: e.member, inviteKey: e.inviteKey, memberCount: e.memberCount };
    case "ConsentRecorded": return { circleId: e.circleId, member: e.member, policyHash: e.policyHash, encryptionKeyFingerprint: e.fingerprint, consentCount: e.consentCount };
    case "ContributionCommitted": return { circleId: e.circleId, member: e.member, commitment: e.commitment, contributionCount: e.contributionCount };
    case "ReleaseEligibilityReached": return { circleId: e.circleId, eligibleAt: BigInt(e.eligibleAt), contributionCount: e.contributionCount, consentCount: e.consentCount, memberCount: e.memberCount };
    case "ReleaseReceiptRecorded": return { circleId: e.circleId, relayer: e.relayer, deliveryDigest: e.deliveryDigest, receiptCount: e.receiptCount };
    case "CapsuleCancelled": case "CapsuleExpired": return { circleId: e.circleId };
  }
}

function validHistory(): { circle: TraceEvent[]; keys: TraceEvent[] } {
  let s: RegistryState = emptyRegistry();
  let block = 100n;
  const circle: TraceEvent[] = [];
  const keys: TraceEvent[] = [];
  const run = (a: Action, t: number) => {
    const r = apply(s, a, t);
    if (!r.ok) throw new Error(`${a.type}: ${r.error.name}`);
    s = r.state;
    block += 1n;
    r.events.forEach((e, i) => {
      const te: TraceEvent = { name: e.name, args: asChainArgs(e), blockNumber: block, logIndex: i, transactionHash: h(Number(block)), blockTimestamp: t };
      (e.name === "RelayerKeyRegistered" ? keys : circle).push(te);
    });
  };
  run({ type: "registerRelayerKey", caller: R[0]!, fingerprint: h(1) }, T0);
  run({ type: "registerRelayerKey", caller: R[1]!, fingerprint: h(2) }, T0);
  run({ type: "createCircle", caller: CREATOR, policy, metadataCommitment: h(9) }, T0 + 1);
  run({ type: "issueInvitations", caller: CREATOR, circleId: 1n, inviteKeys: [INVITE] }, T0 + 2);
  run({ type: "openCircle", caller: CREATOR, circleId: 1n }, T0 + 3);
  run({ type: "acceptInvitation", caller: ALICE, circleId: 1n, inviteKey: INVITE, recoveredSigner: INVITE }, T0 + 4);
  const ph = s.circles["1"]!.policyHash;
  run({ type: "recordConsent", caller: CREATOR, circleId: 1n, policyHash: ph, fingerprint: h(3) }, T0 + 5);
  run({ type: "recordConsent", caller: ALICE, circleId: 1n, policyHash: ph, fingerprint: h(4) }, T0 + 6);
  run({ type: "commitContribution", caller: CREATOR, circleId: 1n, commitment: h(5) }, T0 + 7);
  run({ type: "commitContribution", caller: ALICE, circleId: 1n, commitment: h(6) }, T0 + 8);
  run({ type: "requestRelease", caller: OUTSIDER, circleId: 1n }, T0 + 200);
  run({ type: "recordReleaseReceipt", caller: R[0]!, circleId: 1n, deliveryDigest: h(7) }, T0 + 201);
  run({ type: "recordReleaseReceipt", caller: R[1]!, circleId: 1n, deliveryDigest: h(8) }, T0 + 202);
  return { circle, keys };
}

const find = (c: TraceEvent[], name: string, nth = 0) => c.filter((e) => e.name === name)[nth]!;

describe("verifier accepts a valid history", () => {
  it("replays to RELEASED with the rule satisfied at eligibility", async () => {
    const { circle, keys } = validHistory();
    const r = replayCircle(1n, circle, keys);
    expect(r.violations).toEqual([]);
    expect(r.eligibility?.ruleSatisfied).toBe(true);
    const report = await buildReport({
      circleId: 1n, circleEvents: circle, relayerKeyEvents: keys, observedAt: T0 + 300, onChain: null,
      source: { kind: "trace", rpcUrl: null, chainId: null, registry: "0x", observedAtBlock: null, observedAt: T0 + 300, runtimeSha256: null, expectedRuntimeSha256: "x", bytecodeMatches: null },
      deployment: null, label: "LOCAL FIXTURE", claimed: null, storage: null,
    });
    expect(report.verdict).toBe("VALID");
    expect(report.evaluation.lifecycle).toBe("RELEASED");
  });
});

describe("verifier rejects mutated histories", () => {
  const expectInvalid = (circle: TraceEvent[], keys: TraceEvent[], pattern: RegExp) => {
    const r = replayCircle(1n, circle, keys);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations.join("\n")).toMatch(pattern);
  };

  it("event order: contribution before consent", () => {
    const { circle, keys } = validHistory();
    const consent = find(circle, "ConsentRecorded", 1);
    const contrib = find(circle, "ContributionCommitted", 1);
    [consent.blockNumber, contrib.blockNumber] = [contrib.blockNumber, consent.blockNumber];
    expectInvalid(circle, keys, /ConsentRequired|consentCount|contributionCount/);
  });

  it("event order: eligibility before the last required contribution", () => {
    const { circle, keys } = validHistory();
    const el = find(circle, "ReleaseEligibilityReached");
    el.blockNumber = find(circle, "ContributionCommitted", 1).blockNumber - 1n;
    el.blockTimestamp = policy.releaseAt;
    expectInvalid(circle, keys, /WrongLifecycle|RuleNotSatisfied|contributionCount/);
  });

  it("contributor identity: a non-member commits", () => {
    const { circle, keys } = validHistory();
    find(circle, "ContributionCommitted", 1).args.member = OUTSIDER;
    expectInvalid(circle, keys, /NotMember/);
  });

  it("contributor identity: one member commits twice", () => {
    const { circle, keys } = validHistory();
    find(circle, "ContributionCommitted", 1).args.member = CREATOR;
    expectInvalid(circle, keys, /AlreadyContributed/);
  });

  it("rule data: the emitted policy was edited (release date moved)", () => {
    const { circle, keys } = validHistory();
    const created = find(circle, "CircleCreated");
    (created.args.policy as { releaseAt: bigint }).releaseAt = BigInt(policy.releaseAt + 10_000);
    expectInvalid(circle, keys, /policyHash|PolicyHashMismatch|RuleNotSatisfied/);
  });

  it("rule data: consent to a different rule hash", () => {
    const { circle, keys } = validHistory();
    find(circle, "ConsentRecorded", 1).args.policyHash = h(123);
    expectInvalid(circle, keys, /PolicyHashMismatch/);
  });

  it("receipt timing: a receipt before eligibility", () => {
    const { circle, keys } = validHistory();
    const receipt = find(circle, "ReleaseReceiptRecorded");
    receipt.blockNumber = find(circle, "ReleaseEligibilityReached").blockNumber - 1n;
    expectInvalid(circle, keys, /EligibilityNotRecorded/);
  });

  it("date condition: eligibility recorded before releaseAt", () => {
    const { circle, keys } = validHistory();
    const el = find(circle, "ReleaseEligibilityReached");
    el.blockTimestamp = policy.releaseAt - 1;
    el.args.eligibleAt = BigInt(policy.releaseAt - 1);
    expectInvalid(circle, keys, /RuleNotSatisfied\(1\)/);
  });

  it("receipt from an address outside the quorum", () => {
    const { circle, keys } = validHistory();
    find(circle, "ReleaseReceiptRecorded", 1).args.relayer = OUTSIDER;
    expectInvalid(circle, keys, /NotRelayer/);
  });

  it("forged receipt count", () => {
    const { circle, keys } = validHistory();
    find(circle, "ReleaseReceiptRecorded", 0).args.receiptCount = 2;
    expectInvalid(circle, keys, /receiptCount/);
  });

  it("missing consent event (unanimous rule)", () => {
    const { circle, keys } = validHistory();
    const idx = circle.indexOf(find(circle, "ConsentRecorded", 1));
    circle.splice(idx, 1);
    expectInvalid(circle, keys, /ConsentRequired|RuleNotSatisfied|consentCount/);
  });
});

describe("false server response (§14)", () => {
  it("reports the chain-derived state and flags the claim", async () => {
    const { circle, keys } = validHistory();
    circle.splice(circle.indexOf(find(circle, "ReleaseReceiptRecorded", 1)), 1); // one receipt withheld
    const report = await buildReport({
      circleId: 1n, circleEvents: circle, relayerKeyEvents: keys, observedAt: T0 + 300, onChain: null,
      source: { kind: "trace", rpcUrl: null, chainId: null, registry: "0x", observedAtBlock: null, observedAt: T0 + 300, runtimeSha256: null, expectedRuntimeSha256: "x", bytecodeMatches: null },
      deployment: null, label: "LOCAL FIXTURE", claimed: { lifecycle: "RELEASED", released: true }, storage: null,
    });
    expect(report.evaluation.lifecycle).toBe("RELEASE_ELIGIBLE");
    expect(report.evaluation.delivery).toEqual({ kind: "RELEASE_UNAVAILABLE", receipts: 1, threshold: 2, missing: 1 });
    expect(report.claimedStateCheck?.matches).toBe(false);
    expect(report.verdict).toBe("VALID"); // the chain history itself is valid; the claim is false
  });
});
