/**
 * The plaintext container encrypted inside a contribution:
 *   [u32 big-endian header length][header JSON][media bytes][zero padding]
 * File names, captions and the media type live inside the encrypted header, never on-chain
 * or in a manifest. Padding hides exact sizes to within ~12.5%.
 */
import { PayloadHeaderSchema, type PayloadHeader } from "@relay/protocol-types";
import { canonicalJson, utf8 } from "./encoding.ts";

export const MAX_PAYLOAD_BYTES = 48 * 1024 * 1024;

export function paddedLength(n: number): number {
  const min = 4096;
  if (n <= min) return min;
  // step <= n/8, so padding never adds more than 12.5%.
  const step = 2 ** (Math.floor(Math.log2(n)) - 3);
  return Math.ceil(n / step) * step;
}

export function encodePayload(header: Omit<PayloadHeader, "v" | "bytes">, body: Uint8Array): Uint8Array {
  if (body.length > MAX_PAYLOAD_BYTES) throw new Error(`Contribution exceeds ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB`);
  const full = PayloadHeaderSchema.parse({ v: 1, ...header, bytes: body.length });
  const h = utf8.encode(canonicalJson(full));
  const raw = 4 + h.length + body.length;
  const out = new Uint8Array(paddedLength(raw));
  new DataView(out.buffer).setUint32(0, h.length, false);
  out.set(h, 4);
  out.set(body, 4 + h.length);
  return out;
}

export function decodePayload(bytes: Uint8Array): { header: PayloadHeader; body: Uint8Array } {
  if (bytes.length < 4) throw new Error("payload too short");
  const hl = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false);
  if (hl > 64 * 1024 || 4 + hl > bytes.length) throw new Error("payload header length out of range");
  const header = PayloadHeaderSchema.parse(JSON.parse(utf8.decode(bytes.subarray(4, 4 + hl))));
  const end = 4 + hl + header.bytes;
  if (end > bytes.length) throw new Error("payload body truncated");
  return { header, body: bytes.slice(4 + hl, end) };
}

export function kindForMime(mime: string): PayloadHeader["kind"] {
  if (mime === "text/plain") return "text";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  throw new Error(`Unsupported media type ${mime}`);
}
