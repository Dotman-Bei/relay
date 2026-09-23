/**
 * Circle metadata (title, description, emoji) is encrypted with a random Circle metadata key.
 * Only its sha256 goes on-chain; the key travels in invite links and recovery kits.
 */
import { CircleMetadataSchema, EncryptedBlobSchema, type CircleMetadata } from "@relay/protocol-types";
import { aesDecrypt, aesEncrypt, sha256Bytes32, sha256Hex } from "./crypto.ts";
import { canonicalJson, fromBase64, randomBytes, toBase64, utf8 } from "./encoding.ts";
import { getVerified, putVerified, type BlobStore } from "./storage.ts";

const AAD = utf8.encode("relay/v1/circle-metadata");

export function newMetadataKey(): Uint8Array {
  return randomBytes(32);
}

export async function encryptMetadata(key: Uint8Array, meta: CircleMetadata): Promise<Uint8Array> {
  const body = utf8.encode(canonicalJson(CircleMetadataSchema.parse(meta)));
  const { iv, ct } = await aesEncrypt(key, body, AAD);
  return utf8.encode(canonicalJson({ v: 1, alg: "AES-256-GCM", iv: toBase64(iv), ct: toBase64(ct) }));
}

export async function uploadMetadata(store: BlobStore, key: Uint8Array, meta: CircleMetadata): Promise<`0x${string}`> {
  const blob = await encryptMetadata(key, meta);
  const ref = await putVerified(store, blob, "circle metadata");
  return `0x${ref}`;
}

export async function readMetadata(store: BlobStore, commitment: `0x${string}`, key: Uint8Array): Promise<CircleMetadata> {
  const bytes = await getVerified(store, commitment, "circle metadata");
  const blob = EncryptedBlobSchema.parse(JSON.parse(utf8.decode(bytes)));
  const plain = await aesDecrypt(key, fromBase64(blob.iv), fromBase64(blob.ct), AAD);
  return CircleMetadataSchema.parse(JSON.parse(utf8.decode(plain)));
}

/** Unguessable tag for a Circle's encrypted reflection feed: sha256(metadataKey). */
export async function reflectionTag(metadataKey: Uint8Array): Promise<string> {
  return sha256Hex(metadataKey);
}

export async function encryptReflection(metadataKey: Uint8Array, author: string, text: string) {
  const body = utf8.encode(canonicalJson({ v: 1, author: author.toLowerCase(), text, at: new Date().toISOString() }));
  const { iv, ct } = await aesEncrypt(metadataKey, body, utf8.encode("relay/v1/reflection"));
  return { v: 1 as const, alg: "AES-256-GCM" as const, iv: toBase64(iv), ct: toBase64(ct) };
}

export async function decryptReflection(metadataKey: Uint8Array, blob: { iv: string; ct: string }) {
  const plain = await aesDecrypt(metadataKey, fromBase64(blob.iv), fromBase64(blob.ct), utf8.encode("relay/v1/reflection"));
  return JSON.parse(utf8.decode(plain)) as { v: 1; author: string; text: string; at: string };
}

export { sha256Bytes32 };
