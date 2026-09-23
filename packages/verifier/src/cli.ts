#!/usr/bin/env -S npx tsx
/**
 * relay-verify — independent verification of Relay capsules from chain data.
 *
 *   relay-verify --deployment deployments/testnet.json [--circle 3] [--rpc URL]
 *   relay-verify --rpc https://rpc.bohr.life --registry 0x… --from-block 123 --circle 3
 *   options: --claimed claimed.json   compare a server's claimed state with the chain
 *            --storage URL            also verify delivery manifests (hash + relayer signature)
 *            --out report.json        write the full JSON report (default: stdout summary only)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createPublicClient, http } from "viem";
import { DeploymentSchema, type Deployment } from "@relay/protocol-types";
import { RelayReader } from "@relay/sdk";
import { verifyFromChain, type ClaimedState, type VerifierReport } from "./verify.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const deploymentPath = arg("deployment");
  let deployment: Deployment | null = null;
  if (deploymentPath) {
    try {
      deployment = DeploymentSchema.parse(JSON.parse(readFileSync(deploymentPath, "utf8")));
    } catch (e) {
      const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
      console.error(
        missing
          ? `No deployment record at ${deploymentPath}. Nothing to verify on this network yet (see WHAT_IS_REAL.md).`
          : `Deployment record ${deploymentPath} is invalid: ${(e as Error).message}`,
      );
      process.exit(2);
    }
  }
  const rpcUrl = arg("rpc") ?? deployment?.rpcUrl;
  const registry = (arg("registry") ?? deployment?.contract.address) as `0x${string}` | undefined;
  if (!rpcUrl || !registry) {
    console.error("Provide --deployment, or --rpc and --registry.");
    process.exit(2);
  }
  const fromBlock = BigInt(arg("from-block") ?? deployment?.contract.deploymentBlock ?? 0);
  const claimedPath = arg("claimed");
  const claimed = claimedPath ? (JSON.parse(readFileSync(claimedPath, "utf8")) as ClaimedState) : null;
  const storage = arg("storage") ?? null;

  const client = createPublicClient({ transport: http(rpcUrl) });
  const reader = new RelayReader(client, registry, fromBlock);
  const circleArg = arg("circle");
  const ids = circleArg ? [BigInt(circleArg)] : Array.from({ length: Number(await reader.circleCount()) }, (_, i) => BigInt(i + 1));

  const reports: VerifierReport[] = [];
  for (const circleId of ids) {
    const r = await verifyFromChain({
      circleId,
      client,
      rpcUrl,
      registry,
      deploymentBlock: fromBlock,
      deployment,
      claimed,
      storage,
      ...(deployment ? { label: deployment.label } : {}),
    });
    reports.push(r);
    printSummary(r);
  }

  const out = arg("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
    console.log(`\nFull report written to ${out}`);
  }
  if (reports.some((r) => r.verdict !== "VALID")) process.exit(1);
}

function printSummary(r: VerifierReport) {
  const line = "─".repeat(72);
  console.log(`\n${line}\nCircle ${r.circleId} · ${r.label} · chain ${r.source.chainId} · registry ${r.source.registry}`);
  console.log(`Bytecode matches audited build: ${r.source.bytecodeMatches ? "yes" : "NO"}`);
  if (r.rule) {
    console.log(
      `Rule ${r.rule.policyHash.slice(0, 18)}… hash ${r.rule.policyHashValid ? "valid" : "INVALID"} · release ≥ ${new Date(r.rule.releaseAt * 1000).toISOString()} · ` +
        `${r.rule.minContributions} contributions · ${r.rule.unanimousConsent ? "unanimous consent" : "contributors consent"} · ` +
        `${r.rule.receiptThreshold}/${r.rule.relayers.length} receipts`,
    );
  }
  for (const e of r.events) {
    console.log(`  ${e.accepted ? "✓" : "✗"} [${e.blockNumber}] ${e.summary}${e.violation ? `  ← ${e.violation}` : ""}`);
  }
  const d = r.evaluation.delivery;
  console.log(
    `Lifecycle: ${r.evaluation.lifecycle}` +
      (d?.kind === "RELEASE_UNAVAILABLE" ? ` · RELEASE_UNAVAILABLE (${d.missing} receipt${d.missing === 1 ? "" : "s"} missing)` : ""),
  );
  if (r.evaluation.eligibility) console.log(`Eligibility recorded with rule satisfied: ${r.evaluation.eligibility.ruleSatisfied}`);
  for (const rl of r.relayers) {
    console.log(`  relayer ${rl.address} · ${rl.label} · ${rl.independence} · receipt ${rl.receiptDigest ? "yes" : "no"}${rl.delivery ? ` · delivery ${rl.delivery.signatureValid ? "signed" : "UNVERIFIED"} ${rl.delivery.coverage}` : ""}`);
  }
  if (r.claimedStateCheck) {
    console.log(`Claimed state ${r.claimedStateCheck.matches ? "matches" : "DOES NOT MATCH"} the chain${r.claimedStateCheck.differences.length ? `: ${r.claimedStateCheck.differences.join("; ")}` : ""}`);
  }
  console.log(`Verdict: ${r.verdict}${r.violations.length ? `\n  ${r.violations.join("\n  ")}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
