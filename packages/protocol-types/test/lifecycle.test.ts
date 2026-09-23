import { describe, expect, it } from "vitest";
import { capsuleRegistryAbi } from "../src/abi.ts";
import { LIFECYCLE, lifecycleFromIndex, UnknownLifecycleError } from "../src/lifecycle.ts";
import { PolicySchema } from "../src/schemas.ts";

describe("lifecycle", () => {
  it("matches the contract enum order", () => {
    const fn = capsuleRegistryAbi.find((x) => x.type === "function" && x.name === "lifecycleOf");
    expect(fn).toBeDefined();
    expect(LIFECYCLE).toEqual([
      "DRAFT", "AWAITING_CONSENT", "COLLECTING", "SEALED",
      "RELEASE_ELIGIBLE", "RELEASED", "CANCELLED", "EXPIRED",
    ]);
  });

  it("rejects unknown values instead of defaulting", () => {
    expect(lifecycleFromIndex(5)).toBe("RELEASED");
    for (const bad of [-1, 8, 1.5, 255, Number.NaN]) {
      expect(() => lifecycleFromIndex(bad)).toThrow(UnknownLifecycleError);
    }
  });
});

describe("contract events carry no plaintext-shaped fields (C-04 ABI inspection)", () => {
  it("every event field is an id, address, count, bool, timestamp, bytes32 digest or the policy tuple", () => {
    const allowed = new Set(["uint256", "address", "bytes32", "uint16", "uint8", "uint64", "bool", "tuple", "address[]"]);
    for (const item of capsuleRegistryAbi) {
      if (item.type !== "event") continue;
      for (const input of item.inputs) {
        expect(allowed.has(input.type), `${item.name}.${input.name}: ${input.type}`).toBe(true);
        expect(input.type).not.toMatch(/^(string|bytes)$/);
      }
    }
  });
});

describe("PolicySchema", () => {
  it("rejects unknown fields", () => {
    const ok = {
      sealAt: 2, releaseAt: 3, expiresAt: 0, capacity: 2, minContributions: 1,
      unanimousConsent: false, receiptThreshold: 1, relayers: ["0x" + "1".repeat(40)],
    };
    expect(PolicySchema.parse(ok)).toBeTruthy();
    expect(() => PolicySchema.parse({ ...ok, extra: 1 })).toThrow();
  });
});
