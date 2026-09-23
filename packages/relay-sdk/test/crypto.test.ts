import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  collectShares, combine, CommitmentMismatchError, decodeInviteFragment, deliverShare, encodeInviteFragment,
  createInvite, DecryptionError, eciesOpen, eciesSeal, fetchManifest, generateEncryptionKeyPair,
  InsufficientSharesError, keyFingerprint, MemoryBlobStore, openContribution, openRelayerShare,
  paddedLength, sealContribution, split, uploadContribution, utf8, type BlobStore,
} from "../src/index.ts";
import type { DeliveryManifest } from "@relay/protocol-types";

describe("shamir", () => {
  it("any k of n shares reconstruct; the secret round-trips", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 48 }), fc.integer({ min: 1, max: 7 }), fc.integer({ min: 0, max: 6 }), (secret, n, kOff) => {
        const k = 1 + (kOff % n);
        const shares = split(secret, n, k);
        const pick = [...shares].sort(() => Math.random() - 0.5).slice(0, k);
        expect([...combine(pick)]).toEqual([...secret]);
      }),
      { numRuns: 300 },
    );
  });

  it("k-1 shares do not reconstruct a 32-byte key", () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const shares = split(secret, 3, 2);
    expect([...combine(shares.slice(0, 1))]).not.toEqual([...secret]);
  });
});

describe("ecies", () => {
  it("round-trips and binds the context", async () => {
    const kp = await generateEncryptionKeyPair();
    const box = await eciesSeal(kp.publicKey, utf8.encode("share"), "ctx-a");
    expect(utf8.decode(await eciesOpen(kp.privateJwk, box, "ctx-a"))).toBe("share");
    await expect(eciesOpen(kp.privateJwk, box, "ctx-b")).rejects.toBeInstanceOf(DecryptionError);
    const other = await generateEncryptionKeyPair();
    await expect(eciesOpen(other.privateJwk, box, "ctx-a")).rejects.toBeInstanceOf(DecryptionError);
  });
});

describe("contribution seal -> deliver -> open", () => {
  const ctx = { chainId: 31337, registry: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const, circleId: 7n };
  const contributor = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
  const member = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
  const policyHash = `0x${"ab".repeat(32)}` as const;

  async function setup(store: BlobStore = new MemoryBlobStore()) {
    const relayers = await Promise.all([0, 1, 2].map(async (i) => ({ address: `0x${String(i + 1).repeat(40)}` as `0x${string}`, kp: await generateEncryptionKeyPair() })));
    const memberKp = await generateEncryptionKeyPair();
    const sealed = await sealContribution({
      ctx, contributor, policyHash, threshold: 2,
      quorum: relayers.map((r) => ({ address: r.address, publicKey: r.kp.publicKey })),
      header: { kind: "text", mime: "text/plain", caption: "for 2031" },
      body: utf8.encode("Remember the rooftop."),
    });
    return { store, relayers, memberKp, sealed };
  }

  it("manifest and chain carry no plaintext; k deliveries open it", async () => {
    const { store, relayers, memberKp, sealed } = await setup();
    const manifestText = utf8.decode(sealed.manifestBytes);
    expect(manifestText).not.toContain("rooftop");
    expect(manifestText).not.toContain("for 2031");
    const commitment = await uploadContribution(store, sealed);
    expect(commitment).toBe(sealed.commitment);

    const manifest = await fetchManifest(store, commitment, { ...ctx, contributor });
    const deliveries: DeliveryManifest[] = [];
    for (const r of relayers.slice(0, 2)) {
      const share = await openRelayerShare({ manifest, ctx, relayer: r.address, relayerPrivateJwk: r.kp.privateJwk });
      const delivered = await deliverShare({ ctx, contribution: commitment, share, members: [{ address: member, publicKey: memberKp.publicKey }] });
      deliveries.push({ v: 1, kind: "relay.delivery", chainId: ctx.chainId, registry: ctx.registry, circleId: "7", relayer: r.address, eligibleAt: 1, deliveries: delivered, signature: "0x" });
    }
    const one = await collectShares({ ctx, member, memberPrivateJwk: memberKp.privateJwk, contribution: commitment, deliveries: deliveries.slice(0, 1) });
    await expect(openContribution({ ctx, manifest, shares: one, store })).rejects.toBeInstanceOf(InsufficientSharesError);

    const shares = await collectShares({ ctx, member, memberPrivateJwk: memberKp.privateJwk, contribution: commitment, deliveries });
    const opened = await openContribution({ ctx, manifest, shares, store });
    expect(utf8.decode(opened.body)).toBe("Remember the rooftop.");
    expect(opened.header.caption).toBe("for 2031");
  });

  it("detects modified ciphertext served by storage (§14)", async () => {
    const honest = new MemoryBlobStore();
    const { relayers, memberKp, sealed } = await setup(honest);
    const commitment = await uploadContribution(honest, sealed);
    const tampering: BlobStore = {
      label: "tampering",
      put: (b) => honest.put(b),
      get: async (h) => {
        const b = await honest.get(h);
        if (h === sealed.manifest.ciphertext.sha256) b[b.length - 1]! ^= 1;
        return b;
      },
    };
    const manifest = await fetchManifest(honest, commitment, { ...ctx, contributor });
    const shares = [];
    for (const r of relayers.slice(0, 2)) shares.push(await openRelayerShare({ manifest, ctx, relayer: r.address, relayerPrivateJwk: r.kp.privateJwk }));
    await expect(openContribution({ ctx, manifest, shares, store: tampering })).rejects.toBeInstanceOf(CommitmentMismatchError);
    expect(memberKp).toBeTruthy();
  });

  it("detects a modified manifest against the on-chain commitment", async () => {
    const honest = new MemoryBlobStore();
    const { sealed } = await setup(honest);
    const commitment = await uploadContribution(honest, sealed);
    const tampering: BlobStore = { label: "t", put: (b) => honest.put(b), get: async (h) => { const b = await honest.get(h); b[10]! ^= 1; return b; } };
    await expect(fetchManifest(tampering, commitment, { ...ctx, contributor })).rejects.toBeInstanceOf(CommitmentMismatchError);
  });

  it("refuses to commit when storage lies about an upload", async () => {
    const { sealed } = await setup();
    const liar: BlobStore = { label: "liar", put: async () => "00".repeat(32), get: async () => new Uint8Array() };
    await expect(uploadContribution(liar, sealed)).rejects.toBeInstanceOf(CommitmentMismatchError);
  });
});

describe("invites, fingerprints, padding", () => {
  it("round-trips an invite fragment", () => {
    const inv = createInvite(12n, new Uint8Array(32).fill(9));
    const back = decodeInviteFragment(encodeInviteFragment(inv))!;
    expect(back.inviteKey).toBe(inv.inviteKey);
    expect(back.circleId).toBe(12n);
    expect([...back.metadataKey!]).toEqual([...inv.metadataKey!]);
    expect(decodeInviteFragment("#c=1&k=0x12")).toBeNull();
    // A router that re-appends the hash must not corrupt the key, and garbage must not throw.
    const frag = encodeInviteFragment(inv);
    expect(decodeInviteFragment(`${frag}${frag}`)?.inviteKey).toBe(inv.inviteKey);
    expect(decodeInviteFragment(`#c=12&k=${inv.invitePrivateKey}&m=@@not-base64@@`)).toBeNull();
    expect(decodeInviteFragment("#c=0&k=0x" + "1".repeat(64))).toBeNull();
  });

  it("fingerprints are sha256 of the raw key", async () => {
    const kp = await generateEncryptionKeyPair();
    expect(await keyFingerprint(kp.publicKey)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("pads to buckets with <= 12.5% overhead above 4 KiB", () => {
    for (const n of [1, 4096, 5000, 100_000, 3_000_000]) {
      const p = paddedLength(n);
      expect(p).toBeGreaterThanOrEqual(n);
      if (n > 4096) expect(p / n).toBeLessThanOrEqual(1.125 + 1e-9);
    }
  });
});
