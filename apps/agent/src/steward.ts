/**
 * Memory Steward core. Authority it deliberately lacks (PRD §7, §11): it holds no chain key with
 * any registry permission, never receives encryption keys or contributions, cannot consent or sign
 * for a member, and acts only for members who opted in for a specific Circle. Every action produces
 * a signed receipt naming the action, policy version and capsule id — never the payload.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recoverMessageAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { StewardConsentSchema, StewardReceiptSchema, type StewardConsent, type StewardReceipt } from "@relay/protocol-types";
import { canonicalJson, sha256Bytes32, utf8, type RelayReader } from "@relay/sdk";

export const STEWARD_POLICY_VERSION = "steward-policy/v1: prompts-and-reminders, no content access, no keys, no chain writes";

export async function consentDigest(c: Omit<StewardConsent, "signature">): Promise<Hex> {
  return sha256Bytes32(utf8.encode(canonicalJson(c)));
}

export class Steward {
  readonly account: PrivateKeyAccount;
  private consents = new Map<string, StewardConsent>();

  constructor(
    readonly opts: { dir: string; chainId: number; registry: `0x${string}`; reader: RelayReader; key?: Hex },
  ) {
    mkdirSync(opts.dir, { recursive: true });
    const keyFile = join(opts.dir, "steward-key.json");
    let key = opts.key;
    if (!key) {
      if (!existsSync(keyFile)) writeFileSync(keyFile, JSON.stringify({ key: generatePrivateKey() }), { mode: 0o600 });
      key = (JSON.parse(readFileSync(keyFile, "utf8")) as { key: Hex }).key;
    }
    this.account = privateKeyToAccount(key);
    const consentFile = join(opts.dir, "consents.json");
    if (existsSync(consentFile)) {
      for (const c of JSON.parse(readFileSync(consentFile, "utf8")) as StewardConsent[]) this.consents.set(`${c.circleId}:${c.member.toLowerCase()}`, c);
    }
  }

  private persist() {
    writeFileSync(join(this.opts.dir, "consents.json"), JSON.stringify([...this.consents.values()], null, 2));
  }

  isOptedIn(circleId: string, member: string): boolean {
    return this.consents.get(`${circleId}:${member.toLowerCase()}`)?.decision === "OPT_IN";
  }

  async receipt(action: StewardReceipt["action"], capsuleId: string, subject: string | null, mode: "MODEL" | "TEMPLATE"): Promise<StewardReceipt> {
    const unsigned = {
      v: 1 as const,
      kind: "relay.steward-receipt" as const,
      action,
      policyVersion: STEWARD_POLICY_VERSION,
      capsuleId,
      chainId: this.opts.chainId,
      registry: this.opts.registry,
      subject: subject as `0x${string}` | null,
      issuedAt: new Date().toISOString(),
      agent: this.account.address,
      mode,
    };
    const digest = await sha256Bytes32(utf8.encode(canonicalJson(unsigned)));
    const signature = await this.account.signMessage({ message: { raw: digest } });
    const r = StewardReceiptSchema.parse({ ...unsigned, signature });
    appendFileSync(join(this.opts.dir, "receipts.jsonl"), `${JSON.stringify(r)}\n`);
    return r;
  }

  receipts(capsuleId: string): StewardReceipt[] {
    const f = join(this.opts.dir, "receipts.jsonl");
    if (!existsSync(f)) return [];
    return readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as StewardReceipt)
      .filter((r) => r.capsuleId === capsuleId);
  }

  /** Record a member's signed opt-in / opt-out. The member must be a joined member on-chain. */
  async recordConsent(raw: unknown): Promise<StewardReceipt> {
    const c = StewardConsentSchema.parse(raw);
    if (c.chainId !== this.opts.chainId || c.registry.toLowerCase() !== this.opts.registry.toLowerCase()) throw new Error("Consent is for a different registry");
    const { signature, ...unsigned } = c;
    const signer = await recoverMessageAddress({ message: { raw: await consentDigest(unsigned) }, signature: signature as Hex });
    if (signer.toLowerCase() !== c.member.toLowerCase()) throw new Error("Consent signature does not match the member");
    const m = await this.opts.reader.getMember(BigInt(c.circleId), c.member);
    if (!m.joined) throw new Error("Only joined members can opt in or out");
    this.consents.set(`${c.circleId}:${c.member.toLowerCase()}`, c);
    this.persist();
    return this.receipt(c.decision === "OPT_IN" ? "OPT_IN_RECORDED" : "OPT_OUT_RECORDED", c.circleId, c.member, "TEMPLATE");
  }

  /** Reminder derived only from chain state: what the member has not yet done, and the deadline. */
  async reminder(circleId: string, member: `0x${string}`): Promise<{ text: string | null; receipt: StewardReceipt | null }> {
    if (!this.isOptedIn(circleId, member)) throw new Error("Member has not opted in to the Memory Steward for this Circle");
    const circle = await this.opts.reader.getCircle(BigInt(circleId));
    if (circle.lifecycle !== "AWAITING_CONSENT" && circle.lifecycle !== "COLLECTING") return { text: null, receipt: null };
    const m = await this.opts.reader.getMember(BigInt(circleId), member);
    const hoursLeft = Math.max(0, Math.round((circle.policy.sealAt - Date.now() / 1000) / 3600));
    let text: string | null = null;
    if (m.joined && !m.consented) text = `You haven't consented to this Circle's rule yet. Contributions close in about ${hoursLeft}h.`;
    else if (m.consented && !m.contributed) text = `Your contribution isn't sealed yet. Contributions close in about ${hoursLeft}h.`;
    if (!text) return { text: null, receipt: null };
    return { text, receipt: await this.receipt("REMINDER_ISSUED", circleId, member, "TEMPLATE") };
  }
}
