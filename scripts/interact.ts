/**
 * Mainnet interaction check: three TEAM TEST wallets make five real transactions against the
 * deployed registry — one three-person Circle, created, published and joined.
 *
 *   A: createCircle → openCircle → issueInvitations (2 keys)      B: acceptInvitation      C: acceptInvitation
 *
 *   pnpm interact:mainnet            keys from .relay-mainnet/interaction-wallets.json (git-ignored)
 *
 * The wallets are project-controlled and listed in deployments/mainnet.developer-wallets.json:
 * this is evidence that the product works on mainnet, not evidence of users or adoption.
 * The rule expires three hours after creation, so the Circle ends EXPIRED without more transactions,
 * and no relayer ever spends gas on it. Refuses to start unless every wallet covers its gas limits.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatEther, type Hex } from "viem";
import { DeploymentSchema, type Policy } from "@relay/protocol-types";
import { acceptInviteFlow, createCircleFlow, issueInvitesFlow } from "@relay/sdk";
import { verifyFromChain } from "@relay/verifier";
import { Harness, ROOT } from "./lib/harness.ts";

// Gas the wallet must hold, at the node's limits (≈20% above used; testnet-measured):
// A: createCircle ≤338,606 + openCircle 35,401 + issueInvitations(2) limit ≈100,000.
// B, C: acceptInvitation ≤113,414 used, ≈142,000 limit.
const NEED_GAS = { A: 475_000n, B: 142_000n, C: 142_000n } as const;

async function main() {
  const deployment = DeploymentSchema.parse(JSON.parse(readFileSync(resolve(ROOT, "deployments/mainnet.json"), "utf8")));
  const wallets = JSON.parse(readFileSync(resolve(ROOT, ".relay-mainnet/interaction-wallets.json"), "utf8")) as { role: "A" | "B" | "C"; address: string; key: Hex }[];
  const h = new Harness(deployment);
  const [a, b, c] = (["A", "B", "C"] as const).map((role) => h.actor(role, wallets.find((w) => w.role === role)!.key));

  const price = await h.client.getGasPrice();
  const short: string[] = [];
  for (const [role, actor] of [["A", a], ["B", b], ["C", c]] as const) {
    const bal = await h.client.getBalance({ address: actor!.account.address });
    const need = NEED_GAS[role] * price;
    console.log(`wallet ${role} ${actor!.account.address}: ${formatEther(bal)} BOT (needs ${formatEther(need)})`);
    if (bal < need) short.push(`wallet ${role} ${actor!.account.address} holds ${formatEther(bal)} BOT, needs ${formatEther(need)}`);
  }
  if (short.length) {
    console.error(`Not starting: nothing was sent.\n  ${short.join("\n  ")}`);
    process.exit(2);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(ROOT, "docs/proofs/mainnet-interactions", runId);
  mkdirSync(outDir, { recursive: true });
  const store = h.store();
  const reader = h.reader();
  const ctx = (actor: typeof a) => ({ chainId: deployment.chainId, registry: deployment.contract.address, account: actor!.account.address, reader, store, send: h.sender(actor!) });
  const explorer = (tx: string) => `${deployment.explorerUrl!.replace(/\/$/, "")}/tx/${tx}`;
  const txs: { n: number; wallet: string; address: string; action: string; hash: string; explorer: string }[] = [];
  const note = (wallet: "A" | "B" | "C", actor: typeof a, action: string, hash: string) => {
    txs.push({ n: txs.length + 1, wallet, address: actor!.account.address, action, hash, explorer: explorer(hash) });
    console.log(`✓ ${txs.length}. ${wallet} ${action} — ${hash}`);
  };

  const now = await h.now();
  const policy: Policy = {
    sealAt: now + 3600,
    releaseAt: now + 7200,
    expiresAt: now + 10800,
    capacity: 3,
    minContributions: 3,
    unanimousConsent: true,
    receiptThreshold: Math.min(2, deployment.quorum.relayers.length),
    relayers: deployment.quorum.relayers.map((r) => r.address),
  };
  const created = await createCircleFlow(ctx(a), {
    policy,
    metadata: { v: 1, title: "Mainnet interaction check", description: "Team test Circle: three project wallets create, publish and join.", emoji: "🧪" },
    open: true,
  });
  note("A", a, `createCircle → Circle #${created.circleId}`, created.txs[0]!.hash);
  note("A", a, "openCircle (rule published)", created.txs[1]!.hash);
  const { invites, tx: inviteTx } = await issueInvitesFlow(ctx(a), { circleId: created.circleId, count: 2, metadataKey: created.metadataKey });
  note("A", a, "issueInvitations (2 invite keys)", inviteTx.hash);
  note("B", b, "acceptInvitation (joined as member 2)", (await acceptInviteFlow(ctx(b), invites[0]!.secret)).hash);
  note("C", c, "acceptInvitation (joined as member 3)", (await acceptInviteFlow(ctx(c), invites[1]!.secret)).hash);

  const report = await verifyFromChain({
    circleId: created.circleId,
    client: h.client,
    rpcUrl: deployment.rpcUrl,
    registry: deployment.contract.address,
    deploymentBlock: BigInt(deployment.contract.deploymentBlock),
    deployment,
  });
  const ok = report.verdict === "VALID" && report.evaluation.members.length === 3;
  const output = {
    runId,
    label: `${deployment.label} — TEAM TEST WALLETS (project-controlled; not users)`,
    registry: deployment.contract.address,
    circleId: created.circleId.toString(),
    policy,
    transactions: txs,
    verifier: { verdict: report.verdict, lifecycle: report.evaluation.lifecycle, members: report.evaluation.members.map((m) => m.address) },
    passed: ok,
  };
  writeFileSync(resolve(outDir, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(
    resolve(outDir, "transcript.md"),
    [
      `# Mainnet interaction check · ${runId}`,
      "",
      `Registry ${deployment.contract.address} on ${deployment.label} (chain ${deployment.chainId}). **Three team test wallets controlled by the Relay project** — listed in \`deployments/mainnet.developer-wallets.json\`. This shows the product working on mainnet; it is not evidence of users.`,
      "",
      "| # | Wallet | Address | Action | Transaction |",
      "|---|---|---|---|---|",
      ...txs.map((t) => `| ${t.n} | ${t.wallet} | \`${t.address}\` | ${t.action} | [${t.hash.slice(0, 10)}…](${t.explorer}) |`),
      "",
      `Verifier: ${report.verdict}, lifecycle ${report.evaluation.lifecycle}, ${report.evaluation.members.length} members. The rule expires at ${new Date(policy.expiresAt * 1000).toISOString()}; the Circle then reads EXPIRED with no further transactions.`,
      "",
      `**Result: ${ok ? "PASSED" : "FAILED"}**`,
      "",
    ].join("\n"),
  );
  console.log(`\n${ok ? "PASSED" : "FAILED"} — ${txs.length} transactions from 3 wallets; evidence in ${outDir}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
