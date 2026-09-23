/**
 * Sealing and opening contributions, and building / opening relayer deliveries.
 *
 * seal:     payload --AES-GCM(contentKey)--> ciphertext            (stored by sha256)
 *           contentKey --Shamir k-of-n--> shares --ECIES--> relayers (inside the manifest)
 *           manifest (stored by sha256) --sha256--> on-chain commitment
 * release:  relayer opens its share, re-encrypts it to each entitled member (delivery manifest,
 *           stored by sha256 = on-chain receipt digest)
 * open:     member gathers >= k delivered shares, combines them, decrypts the ciphertext
 */
import {
  ContributionManifestSchema,
  DeliveryManifestSchema,
  type ContributionManifest,
  type DeliveredShare,
  type DeliveryManifest,
  type PayloadHeader,
} from "@relay/protocol-types";
import { aesDecrypt, aesEncrypt, eciesOpen, eciesSeal, keyFingerprint, sha256Bytes32, sha256Hex } from "./crypto.ts";
import { canonicalJson, fromBase64, randomBytes, toBase64, utf8 } from "./encoding.ts";
import { decodePayload, encodePayload } from "./payload.ts";
import { combine, split, type Share } from "./shamir.ts";
import { CommitmentMismatchError, getVerified, putVerified, type BlobStore } from "./storage.ts";

export interface CapsuleContext {
  chainId: number;
  registry: `0x${string}`;
  circleId: bigint;
}

export interface QuorumMember {
  address: `0x${string}`;
  /** Raw 65-byte public key, already verified against the on-chain fingerprint. */
  publicKey: Uint8Array;
}

const lc = (a: string) => a.toLowerCase();

export const contexts = {
  content: (c: CapsuleContext, contributor: string, policyHash: string) =>
    `relay/v1/content|${c.chainId}|${lc(c.registry)}|${c.circleId}|${lc(contributor)}|${lc(policyHash)}`,
  share: (c: CapsuleContext, contributor: string, x: number) =>
    `relay/v1/share|${c.chainId}|${lc(c.registry)}|${c.circleId}|${lc(contributor)}|${x}`,
  delivery: (c: CapsuleContext, member: string, contribution: string, x: number) =>
    `relay/v1/delivery|${c.chainId}|${lc(c.registry)}|${c.circleId}|${lc(member)}|${lc(contribution)}|${x}`,
};

export interface SealedContribution {
  manifest: ContributionManifest;
  manifestBytes: Uint8Array;
  ciphertext: Uint8Array;
  /** 0x-prefixed sha256(manifestBytes): the value committed on-chain. */
  commitment: `0x${string}`;
}

export async function sealContribution(args: {
  ctx: CapsuleContext;
  contributor: `0x${string}`;
  policyHash: `0x${string}`;
  quorum: QuorumMember[];
  threshold: number;
  header: Omit<PayloadHeader, "v" | "bytes">;
  body: Uint8Array;
}): Promise<SealedContribution> {
  const { ctx, contributor, policyHash, quorum, threshold } = args;
  const plaintext = encodePayload(args.header, args.body);
  const contentKey = randomBytes(32);
  const { iv, ct } = await aesEncrypt(contentKey, plaintext, utf8.encode(contexts.content(ctx, contributor, policyHash)));
  const shares = split(contentKey, quorum.length, threshold);
  contentKey.fill(0); // the contributor keeps no copy of the key

  const sealedShares = await Promise.all(
    quorum.map(async (r, i) => {
      const sh = shares[i]!;
      const box = await eciesSeal(r.publicKey, sh.y, contexts.share(ctx, contributor, sh.x));
      return {
        relayer: r.address,
        x: sh.x,
        recipientKeyFingerprint: await keyFingerprint(r.publicKey),
        ...box,
      };
    }),
  );

  const manifest = ContributionManifestSchema.parse({
    v: 1,
    kind: "relay.contribution",
    chainId: ctx.chainId,
    registry: ctx.registry,
    circleId: ctx.circleId.toString(),
    contributor,
    policyHash,
    ciphertext: { sha256: await sha256Hex(ct), bytes: ct.length, alg: "AES-256-GCM", iv: toBase64(iv) },
    threshold,
    shares: sealedShares,
  });
  const manifestBytes = utf8.encode(canonicalJson(manifest));
  return { manifest, manifestBytes, ciphertext: ct, commitment: await sha256Bytes32(manifestBytes) };
}

/**
 * Upload ciphertext then manifest, reading each back and checking its hash. Returns the
 * commitment only if storage now serves exactly what was sealed.
 */
export async function uploadContribution(store: BlobStore, sealed: SealedContribution): Promise<`0x${string}`> {
  await putVerified(store, sealed.ciphertext, "ciphertext");
  const ref = await putVerified(store, sealed.manifestBytes, "manifest");
  if (`0x${ref}` !== sealed.commitment) throw new CommitmentMismatchError(sealed.commitment, ref, "manifest");
  return sealed.commitment;
}

/** Fetch a manifest by its on-chain commitment and validate it belongs to this circle and contributor. */
export async function fetchManifest(
  store: BlobStore,
  commitment: `0x${string}`,
  expect: CapsuleContext & { contributor: string },
): Promise<ContributionManifest> {
  const bytes = await getVerified(store, commitment, "contribution manifest");
  const m = ContributionManifestSchema.parse(JSON.parse(utf8.decode(bytes)));
  if (
    m.chainId !== expect.chainId ||
    lc(m.registry) !== lc(expect.registry) ||
    m.circleId !== expect.circleId.toString() ||
    lc(m.contributor) !== lc(expect.contributor)
  ) {
    throw new Error("Manifest context does not match the on-chain contribution");
  }
  return m;
}

// ------------------------------------------------------------------ relayer side

export async function openRelayerShare(args: {
  manifest: ContributionManifest;
  ctx: CapsuleContext;
  relayer: `0x${string}`;
  relayerPrivateJwk: JsonWebKey;
}): Promise<Share> {
  const entry = args.manifest.shares.find((s) => lc(s.relayer) === lc(args.relayer));
  if (!entry) throw new Error("This relayer holds no share in the manifest");
  const y = await eciesOpen(args.relayerPrivateJwk, entry, contexts.share(args.ctx, args.manifest.contributor, entry.x));
  return { x: entry.x, y };
}

export interface EntitledMember {
  address: `0x${string}`;
  publicKey: Uint8Array;
}

/** Re-encrypt one relayer share of one contribution to every entitled member. */
export async function deliverShare(args: {
  ctx: CapsuleContext;
  contribution: `0x${string}`;
  share: Share;
  members: EntitledMember[];
}): Promise<DeliveredShare[]> {
  return Promise.all(
    args.members.map(async (m) => ({
      member: m.address,
      contribution: args.contribution.toLowerCase() as `0x${string}`,
      x: args.share.x,
      recipientKeyFingerprint: await keyFingerprint(m.publicKey),
      ...(await eciesSeal(m.publicKey, args.share.y, contexts.delivery(args.ctx, m.address, args.contribution, args.share.x))),
    })),
  );
}

/** Canonical bytes a relayer signs (everything except the signature). */
export function deliverySigningBytes(d: Omit<DeliveryManifest, "signature">): Uint8Array {
  return utf8.encode(canonicalJson(d));
}

export function encodeDelivery(d: DeliveryManifest): Uint8Array {
  return utf8.encode(canonicalJson(DeliveryManifestSchema.parse(d)));
}

export async function fetchDelivery(store: BlobStore, digest: `0x${string}`): Promise<DeliveryManifest> {
  const bytes = await getVerified(store, digest, "delivery manifest");
  return DeliveryManifestSchema.parse(JSON.parse(utf8.decode(bytes)));
}

// ------------------------------------------------------------------ member side

export class InsufficientSharesError extends Error {
  constructor(
    readonly have: number,
    readonly need: number,
  ) {
    super(`Release unavailable: ${have} of ${need} key shares delivered`);
    this.name = "InsufficientSharesError";
  }
}

/** Decrypt the member's shares for one contribution from the delivery manifests they hold. */
export async function collectShares(args: {
  ctx: CapsuleContext;
  member: `0x${string}`;
  memberPrivateJwk: JsonWebKey;
  contribution: `0x${string}`;
  deliveries: DeliveryManifest[];
}): Promise<Share[]> {
  const byX = new Map<number, Share>();
  for (const d of args.deliveries) {
    for (const s of d.deliveries) {
      if (lc(s.member) !== lc(args.member) || lc(s.contribution) !== lc(args.contribution) || byX.has(s.x)) continue;
      const y = await eciesOpen(args.memberPrivateJwk, s, contexts.delivery(args.ctx, args.member, args.contribution, s.x));
      byX.set(s.x, { x: s.x, y });
    }
  }
  return [...byX.values()];
}

export interface OpenedContribution {
  header: PayloadHeader;
  body: Uint8Array;
}

/** Combine shares, fetch + verify ciphertext against the manifest, decrypt and decode. */
export async function openContribution(args: {
  ctx: CapsuleContext;
  manifest: ContributionManifest;
  shares: Share[];
  store: BlobStore;
}): Promise<OpenedContribution> {
  const { manifest } = args;
  if (args.shares.length < manifest.threshold) throw new InsufficientSharesError(args.shares.length, manifest.threshold);
  const key = combine(args.shares.slice(0, manifest.threshold));
  const ct = await getVerified(args.store, manifest.ciphertext.sha256, "ciphertext");
  const plaintext = await aesDecrypt(
    key,
    fromBase64(manifest.ciphertext.iv),
    ct,
    utf8.encode(contexts.content(args.ctx, manifest.contributor, manifest.policyHash)),
  );
  key.fill(0);
  return decodePayload(plaintext);
}
