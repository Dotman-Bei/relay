/**
 * PRD §15.3 proof run: create → consent → encrypted commit → failed early release →
 * eligibility → relayer receipts → member reveal → independent verification.
 *
 *   pnpm proof:local      fresh anvil chain, LOCAL FIXTURE, time is advanced with evm_setNextBlockTimestamp
 *   pnpm proof:testnet    BOT Chain testnet; needs deployments/testnet.json, CREATOR_KEY, MEMBER_KEY,
 *                         RELAYER_DIR (funded relayer identities) — waits for real chain time
 *   pnpm proof:mainnet    BOT Chain mainnet (M1); needs deployments/mainnet.json, CREATOR_KEY, MEMBER_KEY.
 *                         The hosted relayers record eligibility and receipts, as they would for any
 *                         member; the deliberately failing early release (step 4) is not spent on
 *                         mainnet — the contract's rejection is evidenced on testnet (claim C-02).
 *
 * Writes docs/proofs/<network>/<run-id>/{input.json, output.json, verifier-report.json, transcript.md}.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatEther, toHex, type Hex } from "viem";
import { capsuleRegistryAbi, DeploymentSchema, type Deployment, type Policy } from "@relay/protocol-types";
import {
  acceptInviteFlow,
  consentFlow,
  contributeFlow,
  createCircleFlow,
  fromBase64,
  generateEncryptionKeyPair,
  HttpBlobStore,
  issueInvitesFlow,
  openCapsuleFlow,
  prepare,
  utf8,
} from "@relay/sdk";
import { verifyFromChain } from "@relay/verifier";
import { loadIdentities, Relayer } from "../apps/relayer/src/relayer.ts";
import { ANVIL_KEYS, bootLocal, Harness, ROOT } from "./lib/harness.ts";

const network = process.argv.includes("--network") ? process.argv[process.argv.indexOf("--network") + 1]! : "local";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = resolve(ROOT, "docs/proofs", network, runId);

/** 1×1 PNG, the "image" contribution. */
const PNG = fromBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==");
const SECRET_TEXT = "Proof-run secret: meet at the old lighthouse, 5pm, bring the red notebook.";
const SECRET_CAPTION = "lighthouse-caption-7f3a";

interface Step {
  n: number;
  title: string;
  ok: boolean;
  tx?: string;
  explorer?: string | null;
  detail: string;
  /** Recorded as not run, with the reason in detail. */
  skipped?: boolean;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const transcript: string[] = [];
  const steps: Step[] = [];
  const log = (s: string) => {
    console.log(s);
    transcript.push(s);
  };

  let deployment: Deployment;
  let relayer: Relayer | null = null;
  let stop = () => {};
  let creatorKey: Hex;
  let memberKey: Hex;

  if (network === "local") {
    const boot = await bootLocal({ anvilPort: 8646, storagePort: 8797, dir: resolve(ROOT, ".relay-local", `proof-${runId}`) });
    deployment = boot.deployment;
    relayer = boot.relayer;
    stop = boot.stop;
    creatorKey = ANVIL_KEYS[1]!;
    memberKey = ANVIL_KEYS[2]!;
  } else if (network === "testnet" || network === "mainnet") {
    deployment = DeploymentSchema.parse(JSON.parse(readFileSync(resolve(ROOT, `deployments/${network}.json`), "utf8")));
    creatorKey = process.env.CREATOR_KEY as Hex;
    memberKey = process.env.MEMBER_KEY as Hex;
    if (!creatorKey || !memberKey) throw new Error("Set CREATOR_KEY and MEMBER_KEY (two funded, non-developer participant wallets).");
    if (network === "testnet") {
      relayer = new Relayer({
        deployment,
        identities: loadIdentities(process.env.RELAYER_DIR ?? ".relay-testnet/relayers"),
        store: new HttpBlobStore(deployment.storage.url),
        autoRequestRelease: false,
      });
    }
  } else {
    throw new Error(`unknown network ${network}`);
  }

  const h = new Harness(deployment);
  const explorer = (tx: string) => (deployment.explorerUrl ? `${deployment.explorerUrl.replace(/\/$/, "")}/tx/${tx}` : null);
  const creator = h.actor("creator", creatorKey);
  const member = h.actor("member", memberKey);
  const store = h.store();
  const reader = h.reader();
  const ctxFor = (a: typeof creator) => ({
    chainId: deployment.chainId,
    registry: deployment.contract.address,
    account: a.account.address,
    reader,
    store,
    send: h.sender(a),
  });
  const record = (s: Step) => {
    steps.push(s);
    log(`${s.ok ? "✓" : "✗"} ${s.n}. ${s.title}${s.tx ? ` — ${s.tx}` : ""}\n    ${s.detail}`);
  };

  if (network === "mainnet") {
    // Wallets must hold each transaction's gas *limit* up front, and the node's estimate runs ~20% above
    // gas used (sealing: ~76,500 limit vs ~63,000 used). Measured totals plus the last step's headroom:
    // creator 560,687 used + 14,000 → 0.0116 BOT; member 242,122 used + 14,000 → 0.0052 BOT, at 20 gwei.
    const price = await h.client.getGasPrice();
    const need = { creator: 590_000n * price, member: 262_000n * price };
    const [cb, mb] = await Promise.all([h.client.getBalance({ address: creator.account.address }), h.client.getBalance({ address: member.account.address })]);
    const short = [
      cb < need.creator ? `creator ${creator.account.address} holds ${formatEther(cb)} BOT, needs ${formatEther(need.creator)}` : null,
      mb < need.member ? `member ${member.account.address} holds ${formatEther(mb)} BOT, needs ${formatEther(need.member)}` : null,
    ].filter(Boolean);
    if (short.length) {
      console.error(`Not starting: a Circle that runs out of gas halfway can never open.\n  ${short.join("\n  ")}`);
      process.exit(2);
    }
  }

  log(`# Relay proof run · ${deployment.label} · ${runId}`);
  log(`registry ${deployment.contract.address} on chain ${deployment.chainId}; creator ${creator.account.address}; member ${member.account.address}`);

  // 1. Circle with a future date and a required-contributor threshold.
  const now = await h.now();
  const gap = network === "local" ? 600 : network === "mainnet" ? 240 : 180;
  const policy: Policy = {
    sealAt: now + gap,
    releaseAt: now + gap * 2,
    expiresAt: 0,
    capacity: 2,
    minContributions: 2,
    unanimousConsent: true,
    receiptThreshold: Math.min(2, deployment.quorum.relayers.length),
    relayers: deployment.quorum.relayers.map((r) => r.address),
  };
  const created = await createCircleFlow(ctxFor(creator), {
    policy,
    metadata: { v: 1, title: "Proof run", description: "Two members, unanimous consent, both contribute.", emoji: "🔒" },
    open: true,
  });
  const circleId = created.circleId;
  record({
    n: 1,
    title: "Circle created and rule published",
    ok: true,
    tx: created.txs[0]!.hash,
    explorer: explorer(created.txs[0]!.hash),
    detail: `circle ${circleId}; rule ${created.policyHash}: sealAt ${policy.sealAt}, releaseAt ${policy.releaseAt}, ${policy.minContributions} contributions, unanimous consent, ${policy.receiptThreshold}-of-${policy.relayers.length} receipts. Open tx ${created.txs[1]!.hash}`,
  });

  // 2. Independent consent from both members.
  const { invites, tx: inviteTx } = await issueInvitesFlow(ctxFor(creator), { circleId, count: 1, metadataKey: created.metadataKey });
  const accept = await acceptInviteFlow(ctxFor(member), invites[0]!.secret);
  const creatorKeys = await generateEncryptionKeyPair();
  const memberKeys = await generateEncryptionKeyPair();
  const c1 = await consentFlow(ctxFor(creator), { circleId, reviewedPolicyHash: created.policyHash, publicKey: creatorKeys.publicKey });
  const reviewed = (await reader.getCircle(circleId)).policyHash; // the member reads the rule from the chain
  const c2 = await consentFlow(ctxFor(member), { circleId, reviewedPolicyHash: reviewed, publicKey: memberKeys.publicKey });
  record({
    n: 2,
    title: "Both members consented to the exact rule hash",
    ok: true,
    tx: c2.hash,
    explorer: explorer(c2.hash),
    detail: `invite issued ${inviteTx.hash}; member joined ${accept.hash}; creator consent ${c1.hash}; member consent ${c2.hash}`,
  });

  // 3. Encrypted contributions; plaintext absent from chain events.
  const k1 = await contributeFlow(ctxFor(creator), {
    circleId,
    header: { kind: "text", mime: "text/plain", caption: SECRET_CAPTION },
    body: utf8.encode(SECRET_TEXT),
  });
  const k2 = await contributeFlow(ctxFor(member), {
    circleId,
    header: { kind: "image", mime: "image/png", caption: "a single pixel of that sky", fileName: "sky.png" },
    body: PNG,
  });
  const allLogs = (await h.client.request({
    method: "eth_getLogs",
    params: [{ address: deployment.contract.address, fromBlock: toHex(BigInt(deployment.contract.deploymentBlock)), toBlock: "latest" }],
  })) as { data: Hex; topics: Hex[] }[];
  const haystack = allLogs.map((l) => `${l.data}${l.topics.join("")}`).join("").toLowerCase();
  const needles = [SECRET_TEXT, SECRET_CAPTION, "sky.png", "lighthouse"].map((s) => toHex(utf8.encode(s)).slice(2).toLowerCase());
  const leaked = needles.filter((n) => haystack.includes(n));
  const manifestTexts = await Promise.all([k1.commitment, k2.commitment].map(async (c) => utf8.decode(await store.get(c.slice(2)))));
  const manifestLeak = manifestTexts.some((t) => t.includes("lighthouse") || t.includes("sky.png"));
  record({
    n: 3,
    title: "Encrypted contributions committed; plaintext absent from chain events and manifests",
    ok: leaked.length === 0 && !manifestLeak,
    tx: k2.tx.hash,
    explorer: explorer(k2.tx.hash),
    detail: `commitments ${k1.commitment} (${k1.tx.hash}), ${k2.commitment} (${k2.tx.hash}); scanned ${allLogs.length} registry logs for ${needles.length} plaintext needles: ${leaked.length} found; manifests leak: ${manifestLeak}`,
  });

  // 4. Failed early-release attempt, mined on-chain (not on mainnet: see the header).
  if (network === "mainnet") {
    record({
      n: 4,
      title: "Early release attempt — not run on mainnet",
      ok: true,
      skipped: true,
      detail: "A reverted transaction still spends gas; the mainnet run is funded at the measured minimum. The contract's rejection of an early release is evidenced on BOT Chain testnet (claim C-02, docs/proofs/testnet/2026-09-23T09-02-50-791Z) with the same runtime bytecode.",
    });
  } else {
  if (network === "local") await h.warpTo(policy.sealAt);
  else await h.waitUntil(policy.sealAt, log);
  const early = await h.attemptExpectingRevert(member, prepare(deployment.contract.address).requestRelease(circleId));
  record({
    n: 4,
    title: "Early release attempt rejected by the contract",
    ok: early.status === "reverted" && early.decoded?.name === "RuleNotSatisfied",
    tx: early.hash,
    explorer: explorer(early.hash),
    detail: `status ${early.status} in block ${early.blockNumber}; decoded ${early.decoded?.name}: ${early.decoded?.reason}`,
  });
  }

  // 5. Rule satisfaction and recorded release request.
  if (network === "local") await h.warpTo(policy.releaseAt);
  else await h.waitUntil(policy.releaseAt, log);
  let receiptTxs: string[];
  if (relayer) {
    const rel = await h.sender(member)(prepare(deployment.contract.address).requestRelease(circleId));
    const afterRel = await reader.getCircle(circleId);
    record({
      n: 5,
      title: "Release eligibility recorded after the rule became true",
      ok: afterRel.lifecycle === "RELEASE_ELIGIBLE",
      tx: rel.hash,
      explorer: explorer(rel.hash),
      detail: `lifecycle ${afterRel.lifecycle}; eligibleAt ${afterRel.eligibleAt} ≥ releaseAt ${policy.releaseAt}; receipts 0/${policy.receiptThreshold} → RELEASE_UNAVAILABLE until relayers deliver`,
    });
    const actions = await relayer.tick();
    receiptTxs = actions.filter((a) => a.startsWith("receipt")).map((a) => a.split(" ")[3]!);
  } else {
    // Mainnet: the hosted relayers watch the chain; the designated one records eligibility, then all deliver.
    const deadline = Date.now() + 15 * 60_000;
    let seen = await reader.getCircle(circleId);
    while (seen.lifecycle !== "RELEASED" && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 10_000));
      seen = await reader.getCircle(circleId);
      log(`waiting for hosted relayers: lifecycle ${seen.lifecycle}, receipts ${seen.receiptCount}/${policy.receiptThreshold}`);
    }
    const events = await reader.circleEvents(circleId, await h.client.getBlockNumber({ cacheTime: 0 }));
    const eligible = events.find((e) => e.name === "ReleaseEligibilityReached");
    record({
      n: 5,
      title: "Release eligibility recorded by a hosted relayer after the rule became true",
      ok: Boolean(eligible),
      tx: eligible?.transactionHash,
      explorer: eligible ? explorer(eligible.transactionHash) : null,
      detail: eligible ? `eligibility in block ${eligible.blockNumber}; releaseAt ${policy.releaseAt}` : `no eligibility within 15 minutes; lifecycle ${seen.lifecycle}`,
    });
    receiptTxs = events.filter((e) => e.name === "ReleaseReceiptRecorded").map((e) => e.transactionHash);
  }

  // 6. Receipt delivery and member reveal.
  const afterReceipts = await reader.getCircle(circleId);
  const opened = await openCapsuleFlow(ctxFor(member), { circleId, privateJwk: memberKeys.privateJwk });
  const texts = opened.items.map((i) => (i.opened?.header.kind === "text" ? utf8.decode(i.opened.body) : i.opened ? `${i.opened.header.mime} ${i.opened.body.length}B` : `ERROR ${i.error}`));
  const revealOk =
    afterReceipts.lifecycle === "RELEASED" &&
    opened.items.every((i) => i.opened) &&
    texts.includes(SECRET_TEXT) &&
    opened.items.some((i) => i.opened?.header.mime === "image/png" && i.opened.body.length === PNG.length);
  record({
    n: 6,
    title: "Relayer receipts recorded; the member decrypted every contribution",
    ok: revealOk,
    tx: receiptTxs[0],
    explorer: receiptTxs[0] ? explorer(receiptTxs[0]) : null,
    detail: `receipts ${afterReceipts.receiptCount}/${policy.relayers.length} (threshold ${policy.receiptThreshold}) in ${receiptTxs.join(", ")}; lifecycle ${afterReceipts.lifecycle}; member opened: ${texts.map((t) => JSON.stringify(t.slice(0, 60))).join(" | ")}`,
  });

  // 7. Independent verification from the deployed contract.
  const report = await verifyFromChain({
    circleId,
    client: h.client,
    rpcUrl: deployment.rpcUrl,
    registry: deployment.contract.address,
    deploymentBlock: BigInt(deployment.contract.deploymentBlock),
    deployment,
    storage: store,
  });
  record({
    n: 7,
    title: "Independent verifier replayed the chain",
    ok: report.verdict === "VALID" && report.evaluation.lifecycle === "RELEASED" && report.source.bytecodeMatches === true,
    detail: `verdict ${report.verdict}; ${report.events.length} events replayed; lifecycle ${report.evaluation.lifecycle}; bytecode matches ${report.source.bytecodeMatches}; cross-check ${report.crossCheck.matches}; deliveries ${report.relayers.map((r) => r.delivery?.coverage ?? "–").join(", ")}`,
  });

  const allOk = steps.every((s) => s.ok);
  const input = { network, label: deployment.label, registry: deployment.contract.address, chainId: deployment.chainId, creator: creator.account.address, member: member.account.address, policy, sourceCommit: deployment.sourceCommit, abi: capsuleRegistryAbi.length };
  const output = { runId, label: deployment.label, circleId: circleId.toString(), passed: allOk, steps };
  writeFileSync(resolve(outDir, "input.json"), `${JSON.stringify(input, null, 2)}\n`);
  writeFileSync(resolve(outDir, "output.json"), `${JSON.stringify(output, null, 2)}\n`);
  writeFileSync(resolve(outDir, "verifier-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    resolve(outDir, "transcript.md"),
    `${transcript.join("\n\n")}\n\n**Result: ${allOk ? "PASSED" : "FAILED"}** — ${deployment.label}${deployment.network === "local" ? ". This is a LOCAL FIXTURE run on a development chain, not evidence of a BOT Chain deployment." : ""}\n`,
  );
  log(`\n${allOk ? "PASSED" : "FAILED"} — evidence in ${outDir}`);
  stop();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
