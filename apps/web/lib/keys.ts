"use client";
/**
 * Member key material, stored only in this browser. Relay cannot recover it: the recovery kit
 * (Settings) is the only other copy. Circle metadata keys arrive via invite links.
 */
import { fromBase64, generateEncryptionKeyPair, keyFingerprint, publicKeyFromJwk, toBase64 } from "@relay/sdk";

const ENC = (account: string) => `relay:enc-key:v1:${account.toLowerCase()}`;
const CIRCLES = (scope: string) => `relay:circle-keys:v1:${scope}`;
const ACK = (account: string) => `relay:recovery-ack:v1:${account.toLowerCase()}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the UI reports the key as missing */
  }
}

export function getEncryptionJwk(account: string): JsonWebKey | null {
  return read<JsonWebKey>(ENC(account));
}

export async function ensureEncryptionKey(account: string): Promise<{ jwk: JsonWebKey; publicKey: Uint8Array; fingerprint: `0x${string}`; created: boolean }> {
  const existing = getEncryptionJwk(account);
  if (existing) {
    const publicKey = publicKeyFromJwk(existing);
    return { jwk: existing, publicKey, fingerprint: await keyFingerprint(publicKey), created: false };
  }
  const kp = await generateEncryptionKeyPair();
  write(ENC(account), kp.privateJwk);
  return { jwk: kp.privateJwk, publicKey: kp.publicKey, fingerprint: await keyFingerprint(kp.publicKey), created: true };
}

export function setEncryptionJwk(account: string, jwk: JsonWebKey) {
  write(ENC(account), jwk);
}

export function recoveryAcknowledged(account: string): boolean {
  return read<boolean>(ACK(account)) === true;
}
export function acknowledgeRecovery(account: string) {
  write(ACK(account), true);
}

export function circleScope(chainId: number, registry: string) {
  return `${chainId}:${registry.toLowerCase()}`;
}

export function getCircleKeys(scope: string): Record<string, Uint8Array> {
  const raw = read<Record<string, string>>(CIRCLES(scope)) ?? {};
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, fromBase64(v)]));
}

export function getCircleKey(scope: string, circleId: string | bigint): Uint8Array | null {
  return getCircleKeys(scope)[circleId.toString()] ?? null;
}

export function setCircleKey(scope: string, circleId: string | bigint, key: Uint8Array) {
  const raw = read<Record<string, string>>(CIRCLES(scope)) ?? {};
  raw[circleId.toString()] = toBase64(key);
  write(CIRCLES(scope), raw);
}

export function setCircleKeys(scope: string, keys: Record<string, Uint8Array>) {
  for (const [id, k] of Object.entries(keys)) setCircleKey(scope, id, k);
}
