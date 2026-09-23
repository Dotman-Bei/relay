/**
 * Relay v1 cryptography, built only on WebCrypto:
 *  - content: AES-256-GCM with a context-bound AAD
 *  - key transport: ECIES over P-256 (ephemeral ECDH -> HKDF-SHA256 -> AES-256-GCM)
 *  - fingerprints: sha256 of the raw 65-byte uncompressed public key
 */
import { ab, concatBytes, fromBase64, randomBytes, toBase64, toHex, utf8 } from "./encoding.ts";

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto is unavailable; Relay needs a secure context (https or localhost).");
  return s;
};

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", ab(bytes)));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await sha256(bytes));
}

/** 0x-prefixed bytes32 form of a sha256, as stored on-chain. */
export async function sha256Bytes32(bytes: Uint8Array): Promise<`0x${string}`> {
  return `0x${await sha256Hex(bytes)}`;
}

// ------------------------------------------------------------------ AES-256-GCM

export async function aesEncrypt(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array, iv = randomBytes(12)) {
  if (key.length !== 32) throw new Error("AES-256 key must be 32 bytes");
  const k = await subtle().importKey("raw", ab(key), "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(aad) }, k, ab(plaintext)),
  );
  return { iv, ct };
}

export class DecryptionError extends Error {
  constructor(message = "Decryption failed: wrong key, wrong context, or tampered ciphertext") {
    super(message);
    this.name = "DecryptionError";
  }
}

export async function aesDecrypt(key: Uint8Array, iv: Uint8Array, ct: Uint8Array, aad: Uint8Array) {
  const k = await subtle().importKey("raw", ab(key), "AES-GCM", false, ["decrypt"]);
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: ab(iv), additionalData: ab(aad) }, k, ab(ct)));
  } catch {
    throw new DecryptionError();
  }
}

// ------------------------------------------------------------------ P-256 key pairs

export interface EncryptionKeyPair {
  /** Uncompressed SEC1 point, 65 bytes. Published off-chain; its sha256 goes on-chain. */
  publicKey: Uint8Array;
  /** JWK private key. Recovery material: never leaves the member's device except in their recovery kit. */
  privateJwk: JsonWebKey;
}

export async function generateEncryptionKeyPair(): Promise<EncryptionKeyPair> {
  const kp = (await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const privateJwk = await subtle().exportKey("jwk", kp.privateKey);
  return { publicKey, privateJwk };
}

export async function keyFingerprint(publicKey: Uint8Array): Promise<`0x${string}`> {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) throw new Error("expected a 65-byte uncompressed P-256 key");
  return sha256Bytes32(publicKey);
}

async function importPublic(raw: Uint8Array) {
  return subtle().importKey("raw", ab(raw), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function importPrivate(jwk: JsonWebKey) {
  return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

/** Recompute the public point from a private JWK (x, y are carried in the JWK). */
export function publicKeyFromJwk(jwk: JsonWebKey): Uint8Array {
  if (!jwk.x || !jwk.y) throw new Error("JWK is missing its public coordinates");
  return concatBytes(new Uint8Array([4]), fromBase64(jwk.x), fromBase64(jwk.y));
}

async function hkdfKey(shared: Uint8Array, salt: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const base = await subtle().importKey("raw", ab(shared), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt: ab(salt), info: ab(info) }, base, 256),
  );
}

export interface EciesBox {
  epk: string;
  iv: string;
  ct: string;
}

/**
 * Encrypt `plaintext` to `recipientPublicKey`. `context` is bound as both HKDF info and
 * AES-GCM AAD, so a box cannot be replayed under a different circle, member or share index.
 */
export async function eciesSeal(recipientPublicKey: Uint8Array, plaintext: Uint8Array, context: string): Promise<EciesBox> {
  const eph = (await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const epk = new Uint8Array(await subtle().exportKey("raw", eph.publicKey));
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: "ECDH", public: await importPublic(recipientPublicKey) }, eph.privateKey, 256),
  );
  const info = utf8.encode(context);
  const key = await hkdfKey(shared, concatBytes(epk, recipientPublicKey), info);
  const { iv, ct } = await aesEncrypt(key, plaintext, info);
  return { epk: toBase64(epk), iv: toBase64(iv), ct: toBase64(ct) };
}

export async function eciesOpen(recipientPrivateJwk: JsonWebKey, box: EciesBox, context: string): Promise<Uint8Array> {
  const epk = fromBase64(box.epk);
  const priv = await importPrivate(recipientPrivateJwk);
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: await importPublic(epk) }, priv, 256));
  const info = utf8.encode(context);
  const key = await hkdfKey(shared, concatBytes(epk, publicKeyFromJwk(recipientPrivateJwk)), info);
  return aesDecrypt(key, fromBase64(box.iv), fromBase64(box.ct), info);
}
