/**
 * PRD §17 operational metrics, derived from chain data (plus relayer / steward logs when given).
 *
 *   pnpm metrics [--deployment deployments/testnet.json] [--developer 0xabc,0xdef] [--steward-dir DIR] [--out FILE]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, decodeFunctionData, http, type PublicClient } from "viem";
import { capsuleRegistryAbi, DeploymentSchema } from "@relay/protocol-types";
import { RelayReader } from "@relay/sdk";
import { verifyFromChain } from "@relay/verifier";
import { ANVIL_KEYS } from "./lib/harness.ts";
import { privateKeyToAccount } from "viem/accounts";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};

/** Failed requestRelease transactions: explorer API on public networks, block scan on the local fixture. */
async function rejectedReleaseAttempts(client: PublicClient, registry: `0x${string}`, fromBlock: bigint, explorer: string | null, local: boolean): Promise<number | null> {
  if (local) {
    const head = await client.getBlockNumber({ cacheTime: 0 });
    let n = 0;
    for (let b = fromBlock; b <= head; b++) {
      const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
      for (const tx of block.transactions) {
        if (typeof tx === "string" || tx.to?.toLowerCase() !== registry.toLowerCase()) continue;
        try {
          if (decodeFunctionData({ abi: capsuleRegistryAbi, data: tx.input }).functionName !== "requestRelease") continue;
        } catch {
          continue;
        }
        if ((await client.getTransactionReceipt({ hash: tx.hash })).status === "reverted") n++;
      }
    }
    return n;
  }
  if (!explorer) return null;
  try {
    let n = 0;
    let next: string | null = "";
    while (next !== null) {
      const res = await fetch(`${explorer}/api/v2/addresses/${registry}/transactions${next}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { items: { status: string; method: string | null }[]; next_page_params: Record<string, string> | null };
      n += body.items.filter((t) => t.status === "error" && t.method === "requestRelease").length;
      next = body.next_page_params ? `?${new URLSearchParams(body.next_page_params).toString()}` : null;
    }
    return n;
  } catch {
    return null;
  }
}

async function main() {
  const deployment = DeploymentSchema.parse(JSON.parse(readFileSync(arg("deployment") ?? "deployments/local.json", "utf8")));
  const client = createPublicClient({ transport: http(deployment.rpcUrl) }) as PublicClient;
  const reader = new RelayReader(client, deployment.contract.address, BigInt(deployment.contract.deploymentBlock));
  const developer = new Set(
    (arg("developer")?.split(",") ?? (deployment.network === "local" ? ANVIL_KEYS.map((k) => privateKeyToAccount(k).address) : [])).map((a) => a.toLowerCase()),
  );

  const count = Number(await reader.circleCount());
  let invites = 0, joined = 0, consents = 0, contributions = 0, sealed = 0, released = 0, eligible = 0, verified = 0;
  const latencies: number[] = [];
  const participants = new Set<string>();
  for (let i = 1; i <= count; i++) {
    const id = BigInt(i);
    const [c, events] = await Promise.all([reader.getCircle(id), reader.circleEvents(id)]);
    invites += c.invitesIssued;
    joined += c.memberCount;
    consents += c.consentCount;
    contributions += c.contributionCount;
    if (["SEALED", "RELEASE_ELIGIBLE", "RELEASED", "EXPIRED"].includes(c.lifecycle)) sealed++;
    if (c.eligibleAt) eligible++;
    if (c.lifecycle === "RELEASED") {
      released++;
      const thresholdReceipt = events.find((e) => e.name === "ReleaseReceiptRecorded" && Number(e.args.receiptCount) === c.policy.receiptThreshold);
      if (thresholdReceipt?.blockTimestamp) latencies.push(thresholdReceipt.blockTimestamp - c.eligibleAt);
      const report = await verifyFromChain({ circleId: id, client, registry: deployment.contract.address, deploymentBlock: BigInt(deployment.contract.deploymentBlock), deployment });
      if (report.verdict === "VALID") verified++;
    }
    for (const e of events) if (e.args.member) participants.add(String(e.args.member).toLowerCase());
    participants.add(c.creator.toLowerCase());
  }

  let steward: { actions: number; optIns: number; optOuts: number } | null = null;
  const stewardDir = arg("steward-dir");
  if (stewardDir && !existsSync(`${stewardDir}/receipts.jsonl`)) steward = { actions: 0, optIns: 0, optOuts: 0 };
  else if (stewardDir) {
    const rs = readFileSync(`${stewardDir}/receipts.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { action: string });
    steward = { actions: rs.length, optIns: rs.filter((r) => r.action === "OPT_IN_RECORDED").length, optOuts: rs.filter((r) => r.action === "OPT_OUT_RECORDED").length };
  }

  const external = [...participants].filter((p) => !developer.has(p));
  const metrics = {
    schema: "relay.metrics/v1",
    label: deployment.label,
    measuredAt: new Date().toISOString(),
    registry: deployment.contract.address,
    circlesCreated: count,
    invitationsIssued: invites,
    membersJoined: joined,
    consentCompletionRate: joined ? +(consents / joined).toFixed(3) : null,
    contributionCompletionRate: consents ? +(contributions / consents).toFixed(3) : null,
    sealedCapsules: sealed,
    eligibilityRecorded: eligible,
    released,
    independentlyVerifiedReleases: verified,
    eligibilityToThresholdSeconds: { median: pct(latencies, 50), p95: pct(latencies, 95), samples: latencies.length },
    rejectedReleaseAttempts: await rejectedReleaseAttempts(client, deployment.contract.address, BigInt(deployment.contract.deploymentBlock), deployment.explorerUrl, deployment.network === "local"),
    participants: { total: participants.size, developerWallets: participants.size - external.length, external: external.length },
    memorySteward: steward ?? "not measured (pass --steward-dir)",
    storage: "Upload failures and commitment mismatches are detected client-side and not reported to any server; count them from client and relayer logs.",
  };
  console.log(JSON.stringify(metrics, null, 2));
  const out = arg("out");
  if (out) writeFileSync(out, `${JSON.stringify(metrics, null, 2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
