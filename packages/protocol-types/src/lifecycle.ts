/**
 * Lifecycle values in the exact numeric order of `CapsuleRegistry.Lifecycle`.
 * PRD §10.1: no default state may silently accept an unknown lifecycle value.
 */
export const LIFECYCLE = [
  "DRAFT",
  "AWAITING_CONSENT",
  "COLLECTING",
  "SEALED",
  "RELEASE_ELIGIBLE",
  "RELEASED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type Lifecycle = (typeof LIFECYCLE)[number];

export class UnknownLifecycleError extends Error {
  constructor(readonly value: unknown) {
    super(`Unknown lifecycle value: ${String(value)}`);
    this.name = "UnknownLifecycleError";
  }
}

/** Convert the contract's uint8 enum to a name. Throws on anything outside 0..7. */
export function lifecycleFromIndex(value: number | bigint): Lifecycle {
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isInteger(n) || n < 0 || n >= LIFECYCLE.length) throw new UnknownLifecycleError(value);
  return LIFECYCLE[n]!;
}

export function lifecycleIndex(value: Lifecycle): number {
  const i = LIFECYCLE.indexOf(value);
  if (i < 0) throw new UnknownLifecycleError(value);
  return i;
}

export function assertNever(value: never, context = "value"): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}

/**
 * Delivery status layered on top of RELEASE_ELIGIBLE (PRD §9.3 "Release unavailable").
 * The capsule is only "released" when receipts reach the quorum threshold.
 */
export type DeliveryStatus =
  | { kind: "NOT_ELIGIBLE" }
  | { kind: "RELEASE_UNAVAILABLE"; receipts: number; threshold: number; missing: number }
  | { kind: "RELEASED"; receipts: number; threshold: number };

/** Codes carried by `RuleNotSatisfied(uint8)` and returned by `releaseRuleStatus`. */
export const RULE_CODES = {
  0: "Rule satisfied",
  1: "Release date has not arrived",
  2: "Not enough contributions were committed",
  3: "Not every joined member has consented",
  255: "The capsule is not sealed",
} as const;

export type RuleCode = keyof typeof RULE_CODES;

/** Codes carried by `InvalidPolicy(uint8)`. */
export const POLICY_CODES = {
  1: "The contribution deadline must be in the future",
  2: "The release date must be on or after the contribution deadline",
  3: "The expiry must be after the release date",
  4: "Capacity must be 2–64 members and not below members already joined",
  5: "Required contributions must be between 1 and capacity",
  6: "The release quorum needs 1–7 relayers",
  7: "The receipt threshold must be between 1 and the number of relayers",
  8: "Relayers must be non-zero and distinct",
} as const;

export const PROTOCOL_VERSION = 1;
export const MAX_MEMBERS = 64;
export const MAX_RELAYERS = 7;
export const MAX_INVITES_PER_CALL = 32;
export const MAX_INVITES_PER_CIRCLE = 128;
