import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { recoverMessageAddress } from "viem";
import { canonicalJson, sha256Bytes32, utf8, type RelayReader } from "@relay/sdk";
import { PromptRequestSchema, suggestPrompts, templatePrompts } from "../src/prompts.ts";
import { consentDigest, Steward } from "../src/steward.ts";

const REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as const;
const fakeReader = (joined: boolean) =>
  ({ getMember: async () => ({ joined, consented: false, contributed: false }) }) as unknown as RelayReader;

async function signedConsent(pk: `0x${string}`, decision: "OPT_IN" | "OPT_OUT") {
  const acct = privateKeyToAccount(pk);
  const unsigned = {
    v: 1 as const, kind: "relay.steward-consent" as const, decision, circleId: "4", chainId: 31337, registry: REGISTRY,
    member: acct.address, scope: "prompts-and-reminders" as const, contentAccess: "none" as const, issuedAt: new Date().toISOString(),
  };
  return { ...unsigned, signature: await acct.signMessage({ message: { raw: await consentDigest(unsigned) } }) };
}

describe("Memory Steward", () => {
  it("is off by default and requires a member-signed opt-in", async () => {
    const s = new Steward({ dir: mkdtempSync(join(tmpdir(), "steward-")), chainId: 31337, registry: REGISTRY, reader: fakeReader(true) });
    const pk = generatePrivateKey();
    const who = privateKeyToAccount(pk).address;
    expect(s.isOptedIn("4", who)).toBe(false);
    const forged = { ...(await signedConsent(pk, "OPT_IN")), member: privateKeyToAccount(generatePrivateKey()).address };
    await expect(s.recordConsent(forged)).rejects.toThrow(/signature/);
    const receipt = await s.recordConsent(await signedConsent(pk, "OPT_IN"));
    expect(s.isOptedIn("4", who)).toBe(true);
    expect(receipt.action).toBe("OPT_IN_RECORDED");
    await s.recordConsent(await signedConsent(pk, "OPT_OUT"));
    expect(s.isOptedIn("4", who)).toBe(false);
  });

  it("refuses non-members", async () => {
    const s = new Steward({ dir: mkdtempSync(join(tmpdir(), "steward-")), chainId: 31337, registry: REGISTRY, reader: fakeReader(false) });
    await expect(s.recordConsent(await signedConsent(generatePrivateKey(), "OPT_IN"))).rejects.toThrow(/joined members/);
  });

  it("signs receipts that name the action and capsule but carry no payload", async () => {
    const s = new Steward({ dir: mkdtempSync(join(tmpdir(), "steward-")), chainId: 31337, registry: REGISTRY, reader: fakeReader(true) });
    const r = await s.receipt("PROMPTS_SUGGESTED", "4", null, "TEMPLATE");
    const { signature, ...unsigned } = r;
    const signer = await recoverMessageAddress({ message: { raw: await sha256Bytes32(utf8.encode(canonicalJson(unsigned))) }, signature: signature as `0x${string}` });
    expect(signer).toBe(s.account.address);
    expect(Object.keys(r).sort()).toEqual(["action", "agent", "capsuleId", "chainId", "issuedAt", "kind", "mode", "policyVersion", "registry", "signature", "subject", "v"]);
  });

  it("falls back to labelled TEMPLATE prompts without model credentials", async () => {
    const req = PromptRequestSchema.parse({ theme: "Graduation", groupSize: 6, yearsUntilOpen: 5 });
    const out = await suggestPrompts(req, null);
    expect(out.mode).toBe("TEMPLATE");
    expect(out.set.prompts.length).toBeGreaterThanOrEqual(3);
    expect(templatePrompts(req).prompts.map((p) => p.format)).toContain("audio");
  });
});
