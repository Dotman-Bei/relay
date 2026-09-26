/**
 * Acceptance gates (PRD §22) read from evidence, and recorded only from evidence.
 *
 *   pnpm gate:status                           every gate, what it rests on, what is missing
 *   pnpm gate:record T3 --circle 8             verify a real two-member run on testnet, write evidence/gates/T3.json
 *   pnpm gate:record T6 --circle 9 [--circle 10] [--notes docs/beta/notes.md]
 *   pnpm gate:record review --reviewer "Name" --report https://… [--scope "…"]
 *   pnpm gate:record M0 --owner "Name"         owner authorisation; refused unless T0–T6 and the review pass
 *   pnpm gate:record M0 --owner "Name" --override "reason"
 *                                              the owner authorises with gates unmet; they stay recorded as unmet
 *   add --dry-run to any record command to check without writing evidence
 *
 * T3/T6 are checked against the chain, never taken on trust: the verifier must replay the Circle
 * as VALID and RELEASED, every member must have consented and contributed, and no member may be
 * a wallet the project controls (deployments/testnet.developer-wallets.json, the deployer, the
 * relayers). T3 also needs the §15.3 failed early-release attempt, found on the explorer.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { DeploymentSchema, NetworkProbeSchema, type Deployment } from "@relay/protocol-types";
import { CAPSULE_REGISTRY_RUNTIME_SHA256 } from "@relay/protocol-types/provenance";
import { verifyFromChain, type VerifierReport } from "@relay/verifier";
import { gitCommit, ROOT } from "./lib/harness.ts";

const GATES_DIR = resolve(ROOT, "evidence/gates");
const rel = (p: string) => p.replace(`${ROOT}/`, "");
const readJson = <T = unknown>(p: string): T => JSON.parse(readFileSync(resolve(ROOT, p), "utf8")) as T;
const args = (name: string) => process.argv.flatMap((a, i) => (a === `--${name}` ? [process.argv[i + 1]!] : []));
const arg = (name: string) => args(name)[0];

export interface GateStatus { id: string; passed: boolean; basis: string; missing: string[] }

function loadTestnet(): Deployment {
  return DeploymentSchema.parse(readJson("deployments/testnet.json"));
}

/** Wallets the project controls: they can never count as non-developer participants. */
export function projectWallets(d: Deployment): Set<string> {
  const list = existsSync(resolve(ROOT, "deployments/testnet.developer-wallets.json"))
    ? readJson<{ wallets: { address: string }[] }>("deployments/testnet.developer-wallets.json").wallets.map((w) => w.address)
    : [];
  return new Set([...list, d.contract.deployer, ...d.quorum.relayers.map((r) => r.address)].map((a) => a.toLowerCase()));
}

function latest(dir: string, filter: (f: string) => boolean): string | null {
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return null;
  const files = readdirSync(abs).filter(filter).sort();
  return files.length ? `${dir}/${files.at(-1)}` : null;
}

export function gateStatus(): GateStatus[] {
  const out: GateStatus[] = [];
  const g = (id: string, basis: string, missing: string[]) => out.push({ id, passed: missing.length === 0, basis, missing });

  // T0
  {
    const m: string[] = [];
    const p = "deployments/testnet.probe.json";
    if (!existsSync(resolve(ROOT, p))) m.push("run `pnpm probe:testnet`");
    else if (!NetworkProbeSchema.parse(readJson(p)).agreement) m.push("probe recorded a chain-ID disagreement");
    g("T0", p, m);
  }
  // T1
  {
    const idx = existsSync(resolve(ROOT, "evidence/index.json")) ? readJson<{ results: { id: string; passed: boolean }[] }>("evidence/index.json") : null;
    const need = ["contracts", "reference", "sdk", "verifier", "parity"];
    const m = idx ? need.filter((id) => !idx.results.find((r) => r.id === id)?.passed).map((id) => `${id} not passing in evidence/index.json`) : ["run `pnpm evidence`"];
    g("T1", "evidence/index.json", m);
  }
  // T2
  {
    const d = loadTestnet();
    const m: string[] = [];
    if (d.contract.verifiedSource !== "VERIFIED") m.push("testnet source not verified");
    if (d.contract.runtimeSha256 !== CAPSULE_REGISTRY_RUNTIME_SHA256) m.push("deployed runtime differs from the current build: the gate reopens (§18)");
    g("T2", `deployments/testnet.json · ${d.contract.address}`, m);
  }
  // T3, T6: recorded from chain by `gate:record`.
  for (const id of ["T3", "T6"] as const) {
    const p = `evidence/gates/${id}.json`;
    const m: string[] = [];
    if (!existsSync(resolve(ROOT, p))) m.push(id === "T3" ? "two non-developer wallets complete a capsule, then `pnpm gate:record T3 --circle <id>`" : "a non-developer group completes a capsule, then `pnpm gate:record T6 --circle <id>`");
    else if (!readJson<{ passed: boolean }>(p).passed) m.push(`${p} records a failed check`);
    g(id, p, m);
  }
  // T4
  {
    const p = "evidence/verifier/testnet.json";
    const m: string[] = [];
    if (!existsSync(resolve(ROOT, p))) m.push("run `pnpm verify:testnet --out evidence/verifier/testnet.json`");
    else {
      const r = readJson<VerifierReport | VerifierReport[]>(p);
      if ([r].flat().some((x) => x.verdict !== "VALID")) m.push("a testnet verifier report is not VALID");
    }
    g("T4", p, m);
  }
  // T5
  {
    const p = latest("evidence/adversarial/testnet", (f) => /^\d{4}-.*\.json$/.test(f));
    const m: string[] = [];
    if (!p) m.push("run `pnpm adversarial:testnet`");
    else if (!readJson<{ passed: boolean }>(p).passed) m.push(`${p} did not pass`);
    g("T5", p ?? "evidence/adversarial/testnet/", m);
  }
  // Security review (PRD §16, required by M0)
  {
    const p = "evidence/gates/review.json";
    const m: string[] = [];
    if (!existsSync(resolve(ROOT, p))) m.push("independent review of the contract and encryption/release model, then `pnpm gate:record review --reviewer … --report …`");
    else if (readJson<{ runtimeSha256: string }>(p).runtimeSha256 !== CAPSULE_REGISTRY_RUNTIME_SHA256) m.push("the reviewed bytecode is not the current build: review again");
    g("REVIEW", p, m);
  }
  // M0
  {
    const p = "evidence/gates/M0.json";
    const m: string[] = [];
    const prior = out.filter((x) => !x.passed).map((x) => x.id);
    const overridden = existsSync(resolve(ROOT, p)) && Boolean(readJson<{ override?: string | null }>(p).override);
    if (prior.length && !overridden) m.push(`not yet passed: ${prior.join(", ")}`);
    if (!existsSync(resolve(ROOT, p))) m.push("owner authorisation: `pnpm gate:record M0 --owner …` once everything above passes");
    else if (readJson<{ runtimeSha256: string }>(p).runtimeSha256 !== CAPSULE_REGISTRY_RUNTIME_SHA256) m.push("authorised bytecode differs from the current build: the gate reopens (§18)");
    g("M0", p, m);
  }
  return out;
}

/** A failed requestRelease for this Circle, from the explorer (reverted txs emit no events). */
async function earlyReleaseRejections(d: Deployment, circleId: bigint): Promise<{ hash: string; from: string; block: number }[]> {
  const found: { hash: string; from: string; block: number }[] = [];
  const base = `${d.explorerUrl}/api/v2/addresses/${d.contract.address}/transactions?filter=to`;
  let url: string | null = base;
  for (let page = 1; url && page <= 40; page++) {
    const body = (await (await fetch(url)).json()) as {
      items: { hash: string; status: string; method: string | null; block_number?: number; block?: number; from: { hash: string }; decoded_input?: { parameters?: { value: unknown }[] } }[];
      next_page_params?: Record<string, string> | null;
      total_pages?: number;
    };
    for (const t of body.items) {
      if (t.status !== "ok" && t.method === "requestRelease" && String(t.decoded_input?.parameters?.[0]?.value) === circleId.toString()) {
        found.push({ hash: t.hash, from: t.from.hash, block: Number(t.block_number ?? t.block) });
      }
    }
    // Blockscout serves either keyset pagination (next_page_params) or numbered pages (total_pages).
    url = body.next_page_params
      ? `${base}&${new URLSearchParams(body.next_page_params)}`
      : body.total_pages && page < body.total_pages
        ? `${base}&page=${page + 1}`
        : null;
  }
  return found;
}

async function checkCircle(d: Deployment, circleId: bigint, needEarlyRejection: boolean) {
  const client = createPublicClient({ transport: http(d.rpcUrl) });
  const report = await verifyFromChain({ circleId, client, rpcUrl: d.rpcUrl, registry: d.contract.address, deploymentBlock: BigInt(d.contract.deploymentBlock), deployment: d, storage: d.storage.url });
  const project = projectWallets(d);
  const members = report.evaluation.members;
  const problems: string[] = [];
  if (report.verdict !== "VALID") problems.push(`verifier verdict ${report.verdict}: ${report.violations.join("; ")}`);
  if (report.evaluation.lifecycle !== "RELEASED") problems.push(`lifecycle is ${report.evaluation.lifecycle}, not RELEASED`);
  if (members.length < 2) problems.push(`${members.length} member(s); at least two are required`);
  for (const m of members) {
    if (project.has(m.address.toLowerCase())) problems.push(`${m.address} is a project-controlled wallet, not a non-developer participant`);
    if (!m.consented) problems.push(`${m.address} did not consent`);
    if (!m.contributed) problems.push(`${m.address} did not contribute`);
  }
  if (report.relayers.some((r) => r.delivery && !r.delivery.signatureValid)) problems.push("a delivery manifest failed signature verification");
  const early = await earlyReleaseRejections(d, circleId);
  const eligibleBlock = report.events.find((e) => e.name === "ReleaseEligibilityReached")?.blockNumber;
  const beforeEligibility = early.filter((e) => eligibleBlock === undefined || BigInt(e.block) < BigInt(eligibleBlock));
  if (needEarlyRejection && beforeEligibility.length === 0) {
    problems.push("no failed early-release attempt on the explorer (§15.3 item 4): press Request release before the date once");
  }
  return {
    circleId: circleId.toString(),
    passed: problems.length === 0,
    problems,
    members: members.map((m) => ({ address: m.address, consented: m.consented, contributed: m.contributed, commitment: m.commitment })),
    lifecycle: report.evaluation.lifecycle,
    verdict: report.verdict,
    earlyReleaseRejections: beforeEligibility.map((e) => ({ ...e, explorerUrl: `${d.explorerUrl}/tx/${e.hash}` })),
    events: report.events.map((e) => ({ block: e.blockNumber, summary: e.summary, tx: e.transactionHash, explorerUrl: e.explorerUrl })),
  };
}

function write(id: string, record: Record<string, unknown>) {
  if (process.argv.includes("--dry-run")) return `(dry run: evidence/gates/${id}.json not written)`;
  mkdirSync(GATES_DIR, { recursive: true });
  const p = resolve(GATES_DIR, `${id}.json`);
  writeFileSync(p, `${JSON.stringify({ schema: "relay.gate/v1", gate: id, recordedAt: new Date().toISOString(), sourceCommit: gitCommit(), ...record }, null, 2)}\n`);
  return rel(p);
}

async function record(id: string) {
  const d = loadTestnet();
  if (id === "T3" || id === "T6") {
    const circles = args("circle");
    if (!circles.length) throw new Error(`gate:record ${id} needs --circle <id>`);
    const results = [];
    for (const c of circles) results.push(await checkCircle(d, BigInt(c), id === "T3"));
    const passed = results.some((r) => r.passed);
    const notes = arg("notes") ?? null;
    if (id === "T6" && passed && !notes) throw new Error("T6 also needs --notes <file>: the beta's results and failures, documented (PRD §22)");
    for (const r of results) console.log(`Circle ${r.circleId}: ${r.passed ? "PASS" : "FAIL"}${r.problems.map((p) => `\n  • ${p}`).join("")}`);
    if (!passed) {
      console.log(`\n${id} not recorded: no Circle passed.`);
      process.exit(1);
    }
    console.log(`\n${id} PASSED → ${write(id, { passed, network: d.network, registry: d.contract.address, chainId: d.chainId, notes, circles: results })}`);
    return;
  }
  if (id === "review") {
    const reviewer = arg("reviewer");
    const report = arg("report");
    if (!reviewer || !report) throw new Error("gate:record review needs --reviewer and --report");
    console.log(`REVIEW recorded → ${write("review", { passed: true, reviewer, report, scope: arg("scope") ?? "CapsuleRegistry, encryption and threshold-release model", runtimeSha256: CAPSULE_REGISTRY_RUNTIME_SHA256 })}`);
    return;
  }
  if (id === "M0") {
    const owner = arg("owner");
    if (!owner) throw new Error("gate:record M0 needs --owner");
    const open = gateStatus().filter((s) => s.id !== "M0" && !s.passed);
    const override = arg("override") ?? null;
    if (open.length && !override) {
      console.log(`M0 refused. Not passed: ${open.map((s) => s.id).join(", ")}. The owner may override with --override "<reason>"; the unmet gates are then recorded as unmet.`);
      process.exit(1);
    }
    // §18: the live testnet verification must succeed at authorisation time.
    const client = createPublicClient({ transport: http(d.rpcUrl) });
    const count = Number(await client.readContract({ address: d.contract.address, abi: (await import("@relay/protocol-types")).capsuleRegistryAbi, functionName: "circleCount" }));
    const invalid: number[] = [];
    for (let i = 1; i <= count; i++) {
      const r = await verifyFromChain({ circleId: BigInt(i), client, rpcUrl: d.rpcUrl, registry: d.contract.address, deploymentBlock: BigInt(d.contract.deploymentBlock), deployment: d });
      if (r.verdict !== "VALID") invalid.push(i);
    }
    if (invalid.length) {
      console.log(`M0 refused: testnet re-verification found INVALID Circles ${invalid.join(", ")}`);
      process.exit(1);
    }
    const unmet = open.map((s) => ({ gate: s.id, missing: s.missing }));
    console.log(
      `M0 recorded${override ? " as an OWNER OVERRIDE" : ""} → ${write("M0", { passed: true, owner, override, unmetGates: unmet, testnetReverified: { circles: count, allValid: true }, runtimeSha256: CAPSULE_REGISTRY_RUNTIME_SHA256 })}`,
    );
    return;
  }
  throw new Error(`unknown gate ${id}; recordable: T3, T6, review, M0`);
}

async function main() {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === "record") return record(id ?? "");
  const all = gateStatus();
  for (const s of all) console.log(`${s.passed ? "✓" : "✗"} ${s.id.padEnd(6)} ${s.basis}${s.missing.map((m) => `\n         – ${m}`).join("")}`);
  const m0 = all.find((s) => s.id === "M0")!;
  console.log(`\nMainnet deployment ${m0.passed ? "AUTHORISED (M0 recorded)" : "BLOCKED"}`);
  process.exit(m0.passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
