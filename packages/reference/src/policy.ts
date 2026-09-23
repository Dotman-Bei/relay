import { encodeAbiParameters, encodePacked, keccak256, toBytes, type Hex } from "viem";
import { MAX_MEMBERS, MAX_RELAYERS, PROTOCOL_VERSION, type Policy } from "@relay/protocol-types";

export const POLICY_TYPEHASH = keccak256(
  toBytes(
    "RelayPolicy(uint8 version,uint64 sealAt,uint64 releaseAt,uint64 expiresAt,uint16 capacity,uint16 minContributions,bool unanimousConsent,uint8 receiptThreshold,address[] relayers)",
  ),
);

export const INVITE_TYPEHASH = keccak256(
  toBytes("RelayInvite(uint256 chainId,address registry,uint256 circleId,address member)"),
);

/** Byte-for-byte equivalent of `CapsuleRegistry.hashPolicy`. */
export function hashPolicy(p: Policy): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint8" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "bool" },
        { type: "uint8" },
        { type: "bytes32" },
      ],
      [
        POLICY_TYPEHASH,
        PROTOCOL_VERSION,
        BigInt(p.sealAt),
        BigInt(p.releaseAt),
        BigInt(p.expiresAt),
        p.capacity,
        p.minContributions,
        p.unanimousConsent,
        p.receiptThreshold,
        keccak256(encodePacked(["address[]"], [p.relayers])),
      ],
    ),
  );
}

/** Byte-for-byte equivalent of `CapsuleRegistry.inviteDigest`. */
export function inviteDigest(chainId: number, registry: Hex, circleId: bigint, member: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "address" }],
      [INVITE_TYPEHASH, BigInt(chainId), registry, circleId, member],
    ),
  );
}

/**
 * Mirrors `_validatePolicy` including check order. Returns the InvalidPolicy code, a
 * RelayerKeyMissing address, or null when valid.
 */
export function validatePolicy(
  p: Policy,
  now: number,
  hasRelayerKey: (relayer: string) => boolean,
): { code: number } | { missingRelayer: Hex } | null {
  if (p.sealAt <= now) return { code: 1 };
  if (p.releaseAt < p.sealAt) return { code: 2 };
  if (p.expiresAt !== 0 && p.expiresAt <= p.releaseAt) return { code: 3 };
  if (p.capacity < 2 || p.capacity > MAX_MEMBERS) return { code: 4 };
  if (p.minContributions === 0 || p.minContributions > p.capacity) return { code: 5 };
  const n = p.relayers.length;
  if (n === 0 || n > MAX_RELAYERS) return { code: 6 };
  if (p.receiptThreshold === 0 || p.receiptThreshold > n) return { code: 7 };
  const seen = new Set<string>();
  for (const r of p.relayers) {
    const k = r.toLowerCase();
    if (/^0x0{40}$/.test(k) || seen.has(k)) return { code: 8 };
    seen.add(k);
    if (!hasRelayerKey(k)) return { missingRelayer: r };
  }
  return null;
}
