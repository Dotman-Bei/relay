/**
 * PRD §13.2 property tests on the reference model: generated participant sequences must
 * never produce a release without valid consent, contribution threshold and date condition.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Policy } from "@relay/protocol-types";
import { apply, emptyRegistry, lifecycle, type Action, type RegistryState } from "../src/index.ts";

const CREATOR = "0x00000000000000000000000000000000000000c0";
const MEMBERS = [1, 2, 3, 4].map((i) => `0x${i.toString(16).padStart(40, "0")}`);
const RELAYERS = [7, 8, 9].map((i) => `0x${i.toString(16).padStart(40, "0")}` as `0x${string}`);
const T0 = 1_800_000_000;
const h = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;

function boot(): RegistryState {
  let s = emptyRegistry();
  RELAYERS.forEach((r, i) => {
    const res = apply(s, { type: "registerRelayerKey", caller: r, fingerprint: h(i + 1) }, T0);
    if (!res.ok) throw new Error("boot");
    s = res.state;
  });
  return s;
}

const policyArb = fc
  .record({
    seal: fc.integer({ min: 1, max: 5000 }),
    gap: fc.integer({ min: 0, max: 5000 }),
    expiry: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
    capacity: fc.integer({ min: 2, max: 5 }),
    min: fc.integer({ min: 1, max: 5 }),
    unanimous: fc.boolean(),
    nRelayers: fc.integer({ min: 1, max: 3 }),
    threshold: fc.integer({ min: 1, max: 3 }),
  })
  .map(
    (r): Policy => ({
      sealAt: T0 + r.seal,
      releaseAt: T0 + r.seal + r.gap,
      expiresAt: r.expiry === null ? 0 : T0 + r.seal + r.gap + r.expiry,
      capacity: r.capacity,
      minContributions: Math.min(r.min, r.capacity),
      unanimousConsent: r.unanimous,
      receiptThreshold: Math.min(r.threshold, r.nRelayers),
      relayers: RELAYERS.slice(0, r.nRelayers),
    }),
  );

const actor = fc.constantFrom(CREATOR, ...MEMBERS);
const stepArb = fc.oneof(
  fc.record({ k: fc.constant("open" as const) }),
  fc.record({ k: fc.constant("join" as const), who: fc.constantFrom(...MEMBERS), n: fc.nat() }),
  fc.record({ k: fc.constant("consent" as const), who: actor, stale: fc.boolean() }),
  fc.record({ k: fc.constant("commit" as const), who: actor }),
  fc.record({ k: fc.constant("release" as const) }),
  fc.record({ k: fc.constant("receipt" as const), r: fc.integer({ min: 0, max: 2 }) }),
  fc.record({ k: fc.constant("cancel" as const) }),
  fc.record({ k: fc.constant("update" as const), p: policyArb }),
  fc.record({ k: fc.constant("warp" as const), secs: fc.integer({ min: 0, max: 4000 }) }),
);

describe("reference model properties", () => {
  it("never records release unless date, contribution threshold and consent held at that moment", () => {
    fc.assert(
      fc.property(policyArb, fc.array(stepArb, { maxLength: 60 }), (policy, steps) => {
        let now = T0;
        let s = boot();
        const created = apply(s, { type: "createCircle", caller: CREATOR, policy, metadataCommitment: h(99) }, now);
        if (!created.ok) return; // generated an invalid policy; nothing to check
        s = created.state;
        const id = 1n;
        let lockedHash: string | null = null;
        let inviteNonce = 1000;

        for (const st of steps) {
          let action: Action | null = null;
          const c = s.circles["1"]!;
          switch (st.k) {
            case "open": action = { type: "openCircle", caller: CREATOR, circleId: id }; break;
            case "join": {
              const key = `0x${(inviteNonce++).toString(16).padStart(40, "0")}`;
              const issued = apply(s, { type: "issueInvitations", caller: CREATOR, circleId: id, inviteKeys: [key] }, now);
              if (issued.ok) s = issued.state;
              action = { type: "acceptInvitation", caller: st.who, circleId: id, inviteKey: key, recoveredSigner: key };
              break;
            }
            case "consent":
              action = { type: "recordConsent", caller: st.who, circleId: id, policyHash: st.stale ? h(5) : c.policyHash, fingerprint: h(3) };
              break;
            case "commit": action = { type: "commitContribution", caller: st.who, circleId: id, commitment: h(now) }; break;
            case "release": action = { type: "requestRelease", caller: MEMBERS[0]!, circleId: id }; break;
            case "receipt": action = { type: "recordReleaseReceipt", caller: RELAYERS[st.r]!, circleId: id, deliveryDigest: h(8) }; break;
            case "cancel": action = { type: "cancel", caller: CREATOR, circleId: id }; break;
            case "update": action = { type: "updatePolicy", caller: CREATOR, circleId: id, policy: st.p }; break;
            case "warp": now += st.secs; break;
          }
          if (!action) continue;
          const before = s.circles["1"]!;
          const r = apply(s, action, now);
          if (!r.ok) continue;
          s = r.state;
          const after = s.circles["1"]!;

          if (action.type === "requestRelease") {
            expect(now).toBeGreaterThanOrEqual(before.policy.releaseAt);
            expect(before.contributionCount).toBeGreaterThanOrEqual(before.policy.minContributions);
            if (before.policy.unanimousConsent) expect(before.consentCount).toBe(before.memberCount);
            expect(before.opened && !before.cancelled).toBe(true);
          }
          if (action.type === "cancel") expect(before.nonCreatorContributed).toBe(false);
          if (after.ruleLocked) {
            lockedHash ??= after.policyHash;
            expect(after.policyHash).toBe(lockedHash);
          }
          expect(after.contributionCount).toBeLessThanOrEqual(after.consentCount);
          expect(after.consentCount).toBeLessThanOrEqual(after.memberCount);
          expect(after.memberCount).toBeLessThanOrEqual(after.policy.capacity);
          if (after.receiptCount > 0) expect(after.eligibleAt).toBeGreaterThan(0);
          if (lifecycle(after, now) === "RELEASED") {
            expect(after.receiptCount).toBeGreaterThanOrEqual(after.policy.receiptThreshold);
            expect(after.eligibleAt).toBeGreaterThanOrEqual(after.policy.releaseAt);
          }
        }
      }),
      { numRuns: 2000, seed: 0x52454c41 },
    );
  });

  it("a member cannot contribute before consenting, nor twice", () => {
    let s = boot();
    const policy: Policy = {
      sealAt: T0 + 100, releaseAt: T0 + 200, expiresAt: 0, capacity: 3, minContributions: 1,
      unanimousConsent: false, receiptThreshold: 1, relayers: [RELAYERS[0]!],
    };
    const step = (a: Action) => {
      const r = apply(s, a, T0 + 1);
      if (r.ok) s = r.state;
      return r;
    };
    step({ type: "createCircle", caller: CREATOR, policy, metadataCommitment: h(1) });
    step({ type: "openCircle", caller: CREATOR, circleId: 1n });
    const before = step({ type: "commitContribution", caller: CREATOR, circleId: 1n, commitment: h(2) });
    expect(before).toEqual({ ok: false, error: { name: "ConsentRequired", args: [] } });
    step({ type: "recordConsent", caller: CREATOR, circleId: 1n, policyHash: s.circles["1"]!.policyHash, fingerprint: h(3) });
    expect(step({ type: "commitContribution", caller: CREATOR, circleId: 1n, commitment: h(2) }).ok).toBe(true);
    expect(step({ type: "commitContribution", caller: CREATOR, circleId: 1n, commitment: h(4) })).toEqual({
      ok: false,
      error: { name: "AlreadyContributed", args: [] },
    });
  });
});
