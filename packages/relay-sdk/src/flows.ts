/**
 * End-to-end member flows shared by the web client, the proof run and the adversarial campaign.
 * Each flow encrypts locally, verifies storage read-backs, and only then sends a transaction.
 */
import { decodeEventLog, type Hex } from "viem";
import { capsuleRegistryAbi, type CircleMetadata, type PayloadHeader, type Policy } from "@relay/protocol-types";
import { hashPolicy } from "@relay/reference";
import {
  collectShares,
  fetchDelivery,
  fetchManifest,
  openContribution,
  sealContribution,
  uploadContribution,
  type OpenedContribution,
  type QuorumMember,
} from "./capsule.ts";
import { prepare, type PreparedWrite, type RelayReader } from "./chain.ts";
import { keyFingerprint } from "./crypto.ts";
import { createInvite, encodeInviteFragment, signInvitation, type InviteSecret } from "./invite.ts";
import { newMetadataKey, uploadMetadata } from "./metadata.ts";
import { getVerified, putVerified, type BlobStore } from "./storage.ts";

export interface TxResult {
  hash: Hex;
  logs: readonly { data: Hex; topics: readonly Hex[] }[];
}

/** Sends a prepared write and resolves once it is confirmed; throws on revert. */
export type TxSender = (write: PreparedWrite) => Promise<TxResult>;

export interface FlowContext {
  chainId: number;
  registry: `0x${string}`;
  account: `0x${string}`;
  reader: RelayReader;
  store: BlobStore;
  send: TxSender;
}

export function circleIdFromLogs(result: TxResult): bigint {
  for (const log of result.logs) {
    try {
      const d = decodeEventLog({ abi: capsuleRegistryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (d.eventName === "CircleCreated") return (d.args as { circleId: bigint }).circleId;
    } catch {
      /* not a registry log */
    }
  }
  throw new Error("CircleCreated event not found in receipt");
}

export async function createCircleFlow(ctx: FlowContext, args: { policy: Policy; metadata: CircleMetadata; open?: boolean }) {
  const metadataKey = newMetadataKey();
  const metadataCommitment = await uploadMetadata(ctx.store, metadataKey, args.metadata);
  const p = prepare(ctx.registry);
  const created = await ctx.send(p.createCircle(args.policy, metadataCommitment));
  const circleId = circleIdFromLogs(created);
  const txs: TxResult[] = [created];
  if (args.open) txs.push(await ctx.send(p.openCircle(circleId)));
  return { circleId, metadataKey, metadataCommitment, policyHash: hashPolicy(args.policy), txs };
}

export async function issueInvitesFlow(ctx: FlowContext, args: { circleId: bigint; count: number; metadataKey: Uint8Array | null; baseUrl?: string }) {
  const invites: InviteSecret[] = Array.from({ length: args.count }, () => createInvite(args.circleId, args.metadataKey));
  const tx = await ctx.send(prepare(ctx.registry).issueInvitations(args.circleId, invites.map((i) => i.inviteKey)));
  const base = args.baseUrl ?? "";
  return {
    tx,
    invites: invites.map((i) => ({ secret: i, link: `${base}/circles/${args.circleId}/invite${encodeInviteFragment(i)}` })),
  };
}

export async function acceptInviteFlow(ctx: FlowContext, secret: InviteSecret) {
  const signature = await signInvitation({
    invitePrivateKey: secret.invitePrivateKey,
    chainId: ctx.chainId,
    registry: ctx.registry,
    circleId: secret.circleId,
    member: ctx.account,
  });
  return ctx.send(prepare(ctx.registry).acceptInvitation(secret.circleId, secret.inviteKey, signature));
}

/** Publish the member's public key (content-addressed) and consent to the exact rule hash they reviewed. */
export async function consentFlow(ctx: FlowContext, args: { circleId: bigint; reviewedPolicyHash: Hex; publicKey: Uint8Array }) {
  const fp = await keyFingerprint(args.publicKey);
  const ref = await putVerified(ctx.store, args.publicKey, "member public key");
  if (`0x${ref}` !== fp) throw new Error("Public key upload did not round-trip");
  return ctx.send(prepare(ctx.registry).recordConsent(args.circleId, args.reviewedPolicyHash, fp));
}

/** Resolve the quorum's encryption keys: on-chain fingerprint -> storage -> sha256 check. */
export async function loadQuorum(reader: RelayReader, store: BlobStore, relayers: readonly `0x${string}`[]): Promise<QuorumMember[]> {
  return Promise.all(
    relayers.map(async (address) => {
      const fp = await reader.relayerKeyOf(address);
      if (/^0x0+$/.test(fp)) throw new Error(`Relayer ${address} has no registered key`);
      const publicKey = await getVerified(store, fp, `relayer ${address} public key`);
      return { address, publicKey };
    }),
  );
}

export async function contributeFlow(
  ctx: FlowContext,
  args: { circleId: bigint; header: Omit<PayloadHeader, "v" | "bytes">; body: Uint8Array; onStage?: (s: string) => void },
) {
  const stage = args.onStage ?? (() => {});
  stage("Reading the rule and release quorum from the chain");
  const circle = await ctx.reader.getCircle(args.circleId);
  const quorum = await loadQuorum(ctx.reader, ctx.store, circle.policy.relayers);
  stage("Encrypting on this device");
  const sealed = await sealContribution({
    ctx: { chainId: ctx.chainId, registry: ctx.registry, circleId: args.circleId },
    contributor: ctx.account,
    policyHash: circle.policyHash,
    quorum,
    threshold: circle.policy.receiptThreshold,
    header: args.header,
    body: args.body,
  });
  stage("Uploading ciphertext and verifying the stored copy");
  const commitment = await uploadContribution(ctx.store, sealed);
  stage("Committing the hash on-chain");
  const tx = await ctx.send(prepare(ctx.registry).commitContribution(args.circleId, commitment));
  return { commitment, tx, ciphertextBytes: sealed.ciphertext.length };
}

export interface OpenedCapsuleItem {
  contributor: `0x${string}`;
  commitment: Hex;
  opened: OpenedContribution | null;
  error: string | null;
}

/** Gather delivered shares from recorded receipts and open every contribution the member is entitled to. */
export async function openCapsuleFlow(ctx: Omit<FlowContext, "send">, args: { circleId: bigint; privateJwk: JsonWebKey }) {
  const events = await ctx.reader.circleEvents(args.circleId);
  const receipts = events.filter((e) => e.name === "ReleaseReceiptRecorded");
  // A delivery that fails its hash check is skipped, not fatal: honest relayers can still meet the threshold.
  const deliveries = [];
  const deliveryErrors: { relayer: string; error: string }[] = [];
  for (const r of receipts) {
    try {
      deliveries.push(await fetchDelivery(ctx.store, r.args.deliveryDigest as Hex));
    } catch (e) {
      deliveryErrors.push({ relayer: String(r.args.relayer), error: e instanceof Error ? e.message : String(e) });
    }
  }
  const capsuleCtx = { chainId: ctx.chainId, registry: ctx.registry, circleId: args.circleId };
  const items: OpenedCapsuleItem[] = [];
  for (const c of events.filter((e) => e.name === "ContributionCommitted")) {
    const contributor = c.args.member as `0x${string}`;
    const commitment = c.args.commitment as Hex;
    try {
      const manifest = await fetchManifest(ctx.store, commitment, { ...capsuleCtx, contributor });
      const shares = await collectShares({ ctx: capsuleCtx, member: ctx.account, memberPrivateJwk: args.privateJwk, contribution: commitment, deliveries });
      const opened = await openContribution({ ctx: capsuleCtx, manifest, shares, store: ctx.store });
      items.push({ contributor, commitment, opened, error: null });
    } catch (e) {
      items.push({ contributor, commitment, opened: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { items, receiptCount: receipts.length, deliveryErrors };
}
