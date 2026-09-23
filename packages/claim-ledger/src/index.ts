import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import { ClaimStatus } from "@relay/protocol-types";

export const ClaimSchema = z
  .object({
    id: z.string().regex(/^C-\d{2}$/),
    claim: z.string(),
    earliestWording: z.string(),
    requiredEvidence: z.string(),
    status: ClaimStatus,
    publicWording: z.string(),
    evidence: z.array(z.string()),
    notes: z.string(),
    neverClaim: z.boolean().optional(),
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;

export const LedgerSchema = z
  .object({ schema: z.literal("relay.claims/v1"), updatedAt: z.string(), network: z.string(), claims: z.array(ClaimSchema) })
  .strict();
export type Ledger = z.infer<typeof LedgerSchema>;

export function loadLedger(root: string): Ledger {
  return LedgerSchema.parse(JSON.parse(readFileSync(resolve(root, "packages/claim-ledger/data/claims.json"), "utf8")));
}

const OBSERVED_TESTNET = new Set(["OBSERVED_TESTNET", "OBSERVED_MAINNET"]);

/**
 * Public-copy rules (PRD §0.4, §21). Each pattern is forbidden in product and doc copy unless the
 * named claim has reached one of the listed statuses. C-07-type claims are forbidden outright.
 */
export const COPY_RULES: { pattern: RegExp; claim: string | null; allowedStatuses: string[]; why: string }[] = [
  { pattern: /impossible to open early|can(?:not|'t) be opened early|never be opened early/i, claim: null, allowedStatuses: [], why: "C-07: never claim that early disclosure is impossible" },
  { pattern: /prevents? (?:all )?early disclosure/i, claim: null, allowedStatuses: [], why: "C-07: never claim" },
  { pattern: /\b(?:is|are|fully|completely|totally|100%)\s+(?:private|decentrali[sz]ed|trustless)\b/i, claim: null, allowedStatuses: [], why: "§0.4: no 'private' / 'decentralized' claim without ledger evidence" },
  { pattern: /mainnet[- ]live|live on (?:BOT Chain )?mainnet|deployed on BOT Chain mainnet/i, claim: "C-06", allowedStatuses: ["OBSERVED_MAINNET"], why: "C-06" },
  { pattern: /(?<!not (?:yet )?)deployed on BOT Chain testnet/i, claim: "C-05", allowedStatuses: ["OBSERVED_TESTNET", "OBSERVED_MAINNET"], why: "C-05" },
  { pattern: /(?<!not (?:yet )?)observed on BOT Chain testnet/i, claim: "C-02", allowedStatuses: ["OBSERVED_TESTNET", "OBSERVED_MAINNET"], why: "C-02" },
  { pattern: /(?<!not (?:yet )?)verified on BOT Chain testnet/i, claim: "C-03", allowedStatuses: ["OBSERVED_TESTNET", "OBSERVED_MAINNET"], why: "C-03" },
];

export interface CheckIssue {
  level: "error" | "warning";
  message: string;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "dist", "out", "cache", "lib"].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|md|mdx|json|html)$/.test(name)) out.push(p);
  }
  return out;
}

export function checkLedger(root: string, ledger: Ledger = loadLedger(root)): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const byId = new Map(ledger.claims.map((c) => [c.id, c]));
  for (const id of ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07"]) {
    if (!byId.has(id)) issues.push({ level: "error", message: `${id} is missing from the ledger` });
  }
  for (const c of ledger.claims) {
    if (c.neverClaim && c.status !== "UNAVAILABLE") issues.push({ level: "error", message: `${c.id} is never-claim but has status ${c.status}` });
    if (c.status !== "PLANNED" && c.status !== "UNAVAILABLE" && c.evidence.length === 0) {
      issues.push({ level: "error", message: `${c.id} is ${c.status} with no evidence` });
    }
    for (const e of c.evidence) {
      if (/^https?:/.test(e)) continue;
      if (!existsSync(resolve(root, e))) issues.push({ level: "error", message: `${c.id} cites missing evidence ${e}` });
    }
    if (OBSERVED_TESTNET.has(c.status) && !existsSync(resolve(root, "deployments/testnet.json"))) {
      issues.push({ level: "error", message: `${c.id} is ${c.status} but deployments/testnet.json does not exist` });
    }
    if (c.status === "OBSERVED_MAINNET" && !existsSync(resolve(root, "deployments/mainnet.json"))) {
      issues.push({ level: "error", message: `${c.id} is OBSERVED_MAINNET but deployments/mainnet.json does not exist` });
    }
  }
  if (existsSync(resolve(root, "deployments/mainnet.json")) && byId.get("C-06")?.status !== "OBSERVED_MAINNET") {
    issues.push({ level: "warning", message: "deployments/mainnet.json exists but C-06 is not OBSERVED_MAINNET" });
  }

  // Copy lint over product surfaces and public docs (the PRD and this ledger are exempt: they define the rules).
  const exempt = new Set(["PRD.md", "frontend.md", "packages/claim-ledger/data/claims.json", "docs/claims.md", "packages/claim-ledger/src/index.ts", "packages/claim-ledger/test/ledger.test.ts"]);
  const files = [
    ...walk(resolve(root, "apps/web/app")),
    ...walk(resolve(root, "apps/web/components")),
    ...walk(resolve(root, "apps/web/lib")),
    ...walk(resolve(root, "docs")),
    ...["README.md", "WHAT_IS_REAL.md", "ARCHITECTURE.md", "SECURITY.md"].map((f) => resolve(root, f)).filter(existsSync),
  ];
  for (const f of files) {
    const rel = relative(root, f);
    if (exempt.has(rel) || rel.startsWith("docs/proofs/")) continue;
    const text = readFileSync(f, "utf8");
    for (const rule of COPY_RULES) {
      const m = text.match(rule.pattern);
      if (!m) continue;
      const allowed = rule.claim ? rule.allowedStatuses.includes(byId.get(rule.claim)?.status ?? "") : false;
      if (!allowed) {
        const line = text.slice(0, m.index).split("\n").length;
        issues.push({ level: "error", message: `${rel}:${line} uses "${m[0]}" — ${rule.why} (current ledger does not permit it)` });
      }
    }
  }
  return issues;
}

export function renderMarkdown(ledger: Ledger): string {
  const rows = ledger.claims
    .map((c) => `| ${c.id} | ${c.claim} | ${c.earliestWording} | **${c.status}** | ${c.publicWording} | ${c.evidence.map((e) => `\`${e}\``).join("<br>") || "—"} |`)
    .join("\n");
  return `<!-- Generated from packages/claim-ledger/data/claims.json by \`pnpm claims:generate\`. Do not edit by hand. -->
# Claim and evidence ledger

Network: ${ledger.network} · updated ${ledger.updatedAt}

Statuses: \`PLANNED\` → \`TESTED_LOCAL\` → \`OBSERVED_TESTNET\` → \`OBSERVED_MAINNET\`, or \`FAILED\` / \`UNAVAILABLE\`.
A claim may only be worded publicly at the rung its evidence has reached. \`pnpm claims:check\` enforces this over the web app and docs.

| ID | Claim | Earliest permitted wording | Status | What we can say today | Evidence |
|---|---|---|---|---|---|
${rows}

## Notes

${ledger.claims.map((c) => `- **${c.id}** — ${c.notes}`).join("\n")}
`;
}
