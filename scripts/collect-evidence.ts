/**
 * Re-run every local evidence producer and record outputs under evidence/ (PRD §24).
 * Everything here is LOCAL FIXTURE or unit-level; testnet evidence comes from proof:testnet,
 * adversarial:testnet and verify:testnet once a deployment exists.
 *
 *   pnpm evidence
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gitCommit, ROOT } from "./lib/harness.ts";

const env = { ...process.env, PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}`, FORCE_COLOR: "0", NO_COLOR: "1" };
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

interface Step {
  id: string;
  cmd: string[];
  cwd?: string;
  out: string;
}

const steps: Step[] = [
  { id: "contracts", cmd: ["forge", "test", "-vv"], cwd: "contracts", out: "evidence/contracts/forge-test.txt" },
  { id: "protocol-types", cmd: ["pnpm", "--filter", "@relay/protocol-types", "test"], out: "evidence/unit/protocol-types.txt" },
  { id: "reference", cmd: ["pnpm", "--filter", "@relay/reference", "test"], out: "evidence/unit/reference.txt" },
  { id: "sdk", cmd: ["pnpm", "--filter", "@relay/sdk", "test"], out: "evidence/unit/sdk.txt" },
  { id: "verifier", cmd: ["pnpm", "--filter", "@relay/verifier", "test"], out: "evidence/unit/verifier.txt" },
  { id: "agent", cmd: ["pnpm", "--filter", "@relay/agent", "test"], out: "evidence/unit/agent.txt" },
  { id: "claim-ledger", cmd: ["pnpm", "--filter", "@relay/claim-ledger", "test"], out: "evidence/unit/claim-ledger.txt" },
  { id: "parity", cmd: ["pnpm", "-s", "test:parity", "--sequences", "80", "--steps", "30"], out: "evidence/parity/parity.txt" },
  { id: "proof-local", cmd: ["pnpm", "-s", "proof:local"], out: "evidence/proofs/proof-local.txt" },
  { id: "adversarial-local", cmd: ["pnpm", "-s", "adversarial:local"], out: "evidence/adversarial/adversarial-local.txt" },
  { id: "claims", cmd: ["pnpm", "-s", "claims:check"], out: "evidence/claims-check.txt" },
];

const only = process.argv.slice(2);
const results: { id: string; passed: boolean; seconds: number; output: string }[] = [];
for (const s of steps.filter((x) => only.length === 0 || only.includes(x.id))) {
  const t0 = Date.now();
  process.stdout.write(`▶ ${s.id} … `);
  const r = spawnSync(s.cmd[0]!, s.cmd.slice(1), { cwd: resolve(ROOT, s.cwd ?? "."), env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const text = strip(`$ ${s.cmd.join(" ")}\n# ${new Date().toISOString()} · source ${gitCommit()}\n\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  mkdirSync(resolve(ROOT, s.out, ".."), { recursive: true });
  writeFileSync(resolve(ROOT, s.out), text);
  const passed = r.status === 0;
  results.push({ id: s.id, passed, seconds: Math.round((Date.now() - t0) / 1000), output: s.out });
  console.log(`${passed ? "passed" : "FAILED"} (${Math.round((Date.now() - t0) / 1000)}s) → ${s.out}`);
}

// A subset run updates its own rows and keeps the rest of the index.
const indexPath = resolve(ROOT, "evidence/index.json");
const previous = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as { results: typeof results }).results : [];
const merged = [...previous.filter((p) => !results.some((r) => r.id === p.id)), ...results];
const index = {
  schema: "relay.evidence-index/v1",
  generatedAt: new Date().toISOString(),
  sourceCommit: gitCommit(),
  label: "LOCAL FIXTURE and unit evidence — not BOT Chain testnet evidence",
  results: steps.map((s) => merged.find((r) => r.id === s.id)).filter((r): r is (typeof results)[number] => Boolean(r)),
};
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(index.results.every((r) => r.passed) ? "\nall evidence steps passed" : "\nSOME EVIDENCE STEPS FAILED — see outputs");
process.exit(index.results.every((r) => r.passed) ? 0 : 1);
