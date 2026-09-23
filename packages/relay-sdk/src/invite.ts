/**
 * Invitations. The creator registers a fresh invite *address* on-chain; the matching private
 * key travels only in the link fragment (#...), which browsers never send to a server.
 * Redeeming signs inviteDigest(circleId, redeemer), so a copied signature cannot seat anyone else.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { inviteDigest } from "@relay/reference";
import { fromBase64, toBase64 } from "./encoding.ts";

export interface InviteSecret {
  circleId: bigint;
  inviteKey: `0x${string}`;
  invitePrivateKey: Hex;
  /** Circle metadata key, so the invitee can read the Circle's name and description. */
  metadataKey: Uint8Array | null;
}

export function createInvite(circleId: bigint, metadataKey: Uint8Array | null): InviteSecret {
  const invitePrivateKey = generatePrivateKey();
  return { circleId, inviteKey: privateKeyToAccount(invitePrivateKey).address, invitePrivateKey, metadataKey };
}

/** `#c=<id>&k=<invite private key>&m=<metadata key, base64url>` */
export function encodeInviteFragment(s: InviteSecret): string {
  const p = new URLSearchParams({ c: s.circleId.toString(), k: s.invitePrivateKey });
  if (s.metadataKey) p.set("m", toBase64(s.metadataKey).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  return `#${p.toString()}`;
}

/** Parse an invite fragment. Never throws: anything malformed returns null. */
export function decodeInviteFragment(fragment: string): InviteSecret | null {
  // Only the first fragment segment counts; some routers re-append a hash.
  const first = fragment.replace(/^#/, "").split("#")[0] ?? "";
  const p = new URLSearchParams(first);
  const c = p.get("c");
  const k = p.get("k");
  const m = p.get("m");
  if (!c || !/^\d{1,30}$/.test(c) || c === "0" || !k || !/^0x[0-9a-fA-F]{64}$/.test(k)) return null;
  if (m !== null && !/^[A-Za-z0-9_-]{43}$/.test(m)) return null; // 32 bytes, base64url, unpadded
  try {
    const metadataKey = m ? fromBase64(m) : null;
    if (metadataKey && metadataKey.length !== 32) return null;
    return { circleId: BigInt(c), invitePrivateKey: k as Hex, inviteKey: privateKeyToAccount(k as Hex).address, metadataKey };
  } catch {
    return null;
  }
}

/** Signature the redeemer submits with acceptInvitation. */
export async function signInvitation(args: {
  invitePrivateKey: Hex;
  chainId: number;
  registry: `0x${string}`;
  circleId: bigint;
  member: `0x${string}`;
}): Promise<Hex> {
  const digest = inviteDigest(args.chainId, args.registry, args.circleId, args.member);
  return privateKeyToAccount(args.invitePrivateKey).signMessage({ message: { raw: digest } });
}
