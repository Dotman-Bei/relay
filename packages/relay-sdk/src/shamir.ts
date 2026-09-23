/**
 * Shamir secret sharing over GF(2^8) (AES polynomial x^8 + x^4 + x^3 + x + 1), byte-wise.
 * Any `threshold` shares reconstruct the secret; fewer reveal nothing about it.
 */
import { randomBytes } from "./encoding.ts";

const EXP = new Uint8Array(510);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // multiply by generator 3 = x * 2 ^ x
    let x2 = x << 1;
    if (x2 & 0x100) x2 ^= 0x11b;
    x = x2 ^ x;
  }
  for (let i = 255; i < 510; i++) EXP[i] = EXP[i - 255]!;
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);
const div = (a: number, b: number) => {
  if (b === 0) throw new Error("division by zero in GF(256)");
  return a === 0 ? 0 : EXP[LOG[a]! + 255 - LOG[b]!]!;
};

export interface Share {
  /** x-coordinate, 1..255. In Relay, share x belongs to policy.relayers[x - 1]. */
  x: number;
  y: Uint8Array;
}

export function split(secret: Uint8Array, shares: number, threshold: number, rng = randomBytes): Share[] {
  if (!Number.isInteger(threshold) || threshold < 1) throw new Error("threshold must be >= 1");
  if (!Number.isInteger(shares) || shares < threshold || shares > 255) throw new Error("need threshold <= shares <= 255");
  const out: Share[] = Array.from({ length: shares }, (_, i) => ({ x: i + 1, y: new Uint8Array(secret.length) }));
  const coeffs = new Uint8Array(threshold);
  for (let b = 0; b < secret.length; b++) {
    coeffs[0] = secret[b]!;
    coeffs.set(rng(threshold - 1), 1);
    for (const sh of out) {
      // Horner evaluation of the polynomial at x.
      let y = 0;
      for (let c = threshold - 1; c >= 0; c--) y = mul(y, sh.x) ^ coeffs[c]!;
      sh.y[b] = y;
    }
  }
  return out;
}

export function combine(shares: Share[]): Uint8Array {
  if (shares.length === 0) throw new Error("no shares");
  const xs = new Set(shares.map((s) => s.x));
  if (xs.size !== shares.length) throw new Error("duplicate share x-coordinates");
  const len = shares[0]!.y.length;
  if (shares.some((s) => s.y.length !== len || s.x < 1 || s.x > 255)) throw new Error("malformed share");
  const out = new Uint8Array(len);
  for (let b = 0; b < len; b++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) {
      let basis = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        basis = mul(basis, div(shares[j]!.x, shares[j]!.x ^ shares[i]!.x));
      }
      acc ^= mul(shares[i]!.y[b]!, basis);
    }
    out[b] = acc;
  }
  return out;
}
