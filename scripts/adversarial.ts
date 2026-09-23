/**
 * PRD §14 adversarial evidence campaign. Every attempted violation is executed for real:
 * contract rejections are mined as failing transactions (status 0) with the decoded reason,
 * client-side detections are exercised against a tampering storage server, and the verifier
 * is pointed at a false claim.
 *
 *   pnpm adversarial:local     (LOCAL FIXTURE; reproducible from a clean checkout)
 *   pnpm adversarial:testnet   (needs deployments/testnet.json, CREATOR_KEY, MEMBER_KEY, RELAYER_DIR)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Hex } from "viem";
import { DeploymentSchema, type Deployment, type Policy } from "@relay/protocol-types";
import {
  acceptInviteFlow,
  CommitmentMismatchError,
  consentFlow,
  contributeFlow,
  createCircleFlow,
  generateEncryptionKeyPair,
  HttpBlobStore,
  issueInvitesFlow,
  loadQuorum,
  openCapsuleFlow,
  prepare,
  sealContribution,
  uploadContribution,
  utf8,
} from "@relay/sdk";
import { verifyFromChain } from "@relay/verifier";
import { loadIdentities, Relayer, type RelayerIdentity } from "../apps/relayer/src/relayer.ts";
import { startStorageServer } from "../apps/relayer/src/storage-server.ts";
import { ANVIL_KEYS, bootLocal, Harness, ROOT } from "./lib/harness.ts";

const network = process.argv.includes("--network") ? process.argv[process.argv.indexOf("--network") + 1]! : "local";
const runId = new Date().toISOString().replace(/[:.]/g, "-");

interface Attempt {
  id: string;
  attempt: string;
  expected: string;
  observed: string;
  passed: boolean;
  evidence: Record<string, unknown>;
}

async function main() {
  let deployment: Deployment;
  let identities: RelayerIdentity[];
  let stop = () => {};
  let keys: { creator: Hex; member: Hex };
  let storageDir: string | null = null;

  if (network === "local") {
    const dir = resolve(ROOT, ".relay-local", `adversarial-${runId}`);
    const boot = await bootLocal({ anvilPort: 8647, storagePort: 8798, dir });
    deployment = boot.deployment;
    identities = boot.identities;
    stop = boot.stop;
    keys = { creator: ANVIL_KEYS[1]!, member: ANVIL_KEYS[2]! };
    storageDir = resolve(dir, "storage");
  } else {
    deployment = DeploymentSchema.parse(JSON.parse(readFileSync(resolve(ROOT, "deployments/testnet.json"), "utf8")));
    identities = loadIdentities(process.env.RELAYER_DIR ?? ".relay-testnet/relayers");
    keys = { creator: process.env.CREATOR_KEY as Hex, member: process.env.MEMBER_KEY as Hex };
    if (!keys.creator || !keys.member) throw new Error("Set CREATOR_KEY and MEMBER_KEY");
    storageDir = process.env.STORAGE_DIR ?? null;
  }

  const h = new Harness(deployment);
  const reg = deployment.contract.address;
  const p = prepare(reg);
  const creator = h.actor("creator", keys.creator);
  const member = h.actor("member", keys.member);
  const relayerActor = h.actor("relayer", identities[0]!.signingKey);
  const store = h.store();
  const reader = h.reader();
  const ctx = (a: typeof creator) => ({ chainId: deployment.chainId, registry: reg, account: a.account.address, reader, store, send: h.sender(a) });
  const explorer = (tx: string) => (deployment.explorerUrl ? `${deployment.explorerUrl.replace(/\/$/, "")}/tx/${tx}` : null);
  const attempts: Attempt[] = [];
  const add = (a: Attempt) => {
    attempts.push(a);
    console.log(`${a.passed ? "✓" : "✗"} ${a.id} ${a.attempt}\n    expected: ${a.expected}\n    observed: ${a.observed}`);
  };

  // Two circles on one timeline: A (2-of-3 quorum, full release) and B (2-of-2, one relayer withholds).
  const now = await h.now();
  const gap = network === "local" ? 600 : 180;
  const base = { sealAt: now + gap, releaseAt: now + 2 * gap, expiresAt: 0, capacity: 3, minContributions: 2, unanimousConsent: false };
  const policyA: Policy = { ...base, receiptThreshold: 2, relayers: identities.slice(0, 3).map((i) => i.address) };
  const policyB: Policy = { ...base, receiptThreshold: 2, relayers: identities.slice(0, 2).map((i) => i.address) };
  const meta = (title: string) => ({ v: 1 as const, title, description: "adversarial campaign", emoji: "🧪" });

  const A = await createCircleFlow(ctx(creator), { policy: policyA, metadata: meta("Campaign A"), open: true });
  const B = await createCircleFlow(ctx(creator), { policy: policyB, metadata: meta("Campaign B"), open: true });
  const creatorKeys = await generateEncryptionKeyPair();
  const memberKeys = await generateEncryptionKeyPair();
  for (const circle of [A, B]) {
    const { invites } = await issueInvitesFlow(ctx(creator), { circleId: circle.circleId, count: 1, metadataKey: circle.metadataKey });
    await acceptInviteFlow(ctx(member), invites[0]!.secret);
    await consentFlow(ctx(creator), { circleId: circle.circleId, reviewedPolicyHash: circle.policyHash, publicKey: creatorKeys.publicKey });
    await consentFlow(ctx(member), { circleId: circle.circleId, reviewedPolicyHash: circle.policyHash, publicKey: memberKeys.publicKey });
  }

  // ADV-1. Change the date after member consent.
  {
    const earlier = { ...policyA, releaseAt: policyA.sealAt };
    const r = await h.attemptExpectingRevert(creator, p.updatePolicy(A.circleId, earlier));
    const after = await reader.getCircle(A.circleId);
    add({
      id: "ADV-1",
      attempt: "Change the date after member consent",
      expected: "Revert",
      observed: `status ${r.status}, ${r.decoded?.name}: ${r.decoded?.reason}; stored rule is ${after.policyHash === A.policyHash ? "still the consented one" : "CHANGED"}`,
      passed: r.status === "reverted" && r.decoded?.name === "RuleLocked" && after.policyHash === A.policyHash,
      evidence: { tx: r.hash, explorer: explorer(r.hash), block: r.blockNumber, decoded: r.decoded, policyHashBefore: A.policyHash, policyHashAfter: after.policyHash },
    });
  }

  for (const circle of [A, B]) {
    await contributeFlow(ctx(creator), { circleId: circle.circleId, header: { kind: "text", mime: "text/plain" }, body: utf8.encode(`creator note for ${circle.circleId}`) });
    await contributeFlow(ctx(member), { circleId: circle.circleId, header: { kind: "text", mime: "text/plain" }, body: utf8.encode(`member note for ${circle.circleId}`) });
  }

  // ADV-2. Commit twice as one participant.
  {
    const r = await h.attemptExpectingRevert(member, p.commitContribution(A.circleId, `0x${"ab".repeat(32)}`));
    add({
      id: "ADV-2",
      attempt: "Commit twice as one participant",
      expected: "Revert",
      observed: `status ${r.status}, ${r.decoded?.name}: ${r.decoded?.reason}`,
      passed: r.status === "reverted" && r.decoded?.name === "AlreadyContributed",
      evidence: { tx: r.hash, explorer: explorer(r.hash), block: r.blockNumber, decoded: r.decoded, contractTest: "test_contribution_atMostOncePerMember" },
    });
  }

  // ADV-3. Request release before the rule is true: while collecting, and sealed before the date.
  {
    const r1 = await h.attemptExpectingRevert(member, p.requestRelease(A.circleId));
    if (network === "local") await h.warpTo(policyA.sealAt);
    else await h.waitUntil(policyA.sealAt, console.log);
    const r2 = await h.attemptExpectingRevert(member, p.requestRelease(A.circleId));
    add({
      id: "ADV-3",
      attempt: "Request release before the rule is true",
      expected: "Revert",
      observed: `collecting: ${r1.status} ${r1.decoded?.name}; sealed before date: ${r2.status} ${r2.decoded?.name} (${r2.decoded?.reason})`,
      passed: r1.status === "reverted" && r1.decoded?.name === "WrongLifecycle" && r2.status === "reverted" && r2.decoded?.name === "RuleNotSatisfied",
      evidence: {
        whileCollecting: { tx: r1.hash, explorer: explorer(r1.hash), decoded: r1.decoded },
        sealedBeforeDate: { tx: r2.hash, explorer: explorer(r2.hash), decoded: r2.decoded },
        contractTest: "test_requestRelease_revertsUntilRuleIsTrue",
      },
    });
  }

  // ADV-4. Submit a receipt before eligibility.
  {
    const r = await h.attemptExpectingRevert(relayerActor, p.recordReleaseReceipt(A.circleId, `0x${"cd".repeat(32)}`));
    add({
      id: "ADV-4",
      attempt: "Submit a receipt before eligibility",
      expected: "Revert",
      observed: `status ${r.status}, ${r.decoded?.name}: ${r.decoded?.reason}`,
      passed: r.status === "reverted" && r.decoded?.name === "EligibilityNotRecorded",
      evidence: { tx: r.hash, explorer: explorer(r.hash), block: r.blockNumber, decoded: r.decoded, contractTest: "test_receipt_revertsBeforeEligibility" },
    });
  }

  // Release both. Identity 2 withholds everywhere: A still reaches 2-of-3, B stalls at 1-of-2.
  if (network === "local") await h.warpTo(policyA.releaseAt);
  else await h.waitUntil(policyA.releaseAt, console.log);
  await h.sender(member)(p.requestRelease(A.circleId));
  await h.sender(member)(p.requestRelease(B.circleId));
  const relayer = new Relayer({ deployment, identities, store, autoRequestRelease: false, log: () => {}, withhold: new Set([identities[1]!.address.toLowerCase()]) });
  await relayer.tick();

  // ADV-5. Serve modified ciphertext.
  {
    let readDetected = false;
    let uploadBlocked = false;
    let detail = "";
    if (storageDir) {
      // Storage that serves modified ciphertext for circle A's contributions (manifests stay honest).
      const events = await reader.circleEvents(A.circleId);
      const ciphertexts = new Set<string>();
      for (const e of events.filter((x) => x.name === "ContributionCommitted")) {
        const m = JSON.parse(utf8.decode(await store.get((e.args.commitment as string).slice(2)))) as { ciphertext: { sha256: string } };
        ciphertexts.add(m.ciphertext.sha256);
      }
      const port = network === "local" ? 8799 : 8899;
      const tamperCt = startStorageServer({ port, dir: storageDir, tamper: ciphertexts });
      const tamperAll = startStorageServer({ port: port + 1, dir: storageDir, tamper: true });
      const lying = new HttpBlobStore(`http://127.0.0.1:${port}`, "TAMPERING fixture (ciphertext)");
      const opened = await openCapsuleFlow({ ...ctx(member), store: lying }, { circleId: A.circleId, privateJwk: memberKeys.privateJwk });
      readDetected = opened.items.length === 2 && opened.items.every((i) => i.opened === null && /Commitment mismatch for ciphertext/.test(i.error ?? ""));
      detail += `reveal with modified ciphertext refused: ${opened.items.map((i) => i.error?.slice(0, 60)).join(" | ")}. `;
      try {
        const circle = await reader.getCircle(A.circleId);
        const sealed = await sealContribution({
          ctx: { chainId: deployment.chainId, registry: reg, circleId: A.circleId },
          contributor: member.account.address,
          policyHash: circle.policyHash,
          quorum: await loadQuorum(reader, store, circle.policy.relayers),
          threshold: 2,
          header: { kind: "text", mime: "text/plain" },
          body: utf8.encode("never committed"),
        });
        await uploadContribution(new HttpBlobStore(`http://127.0.0.1:${port + 1}`, "TAMPERING fixture (all)"), sealed);
      } catch (e) {
        uploadBlocked = e instanceof CommitmentMismatchError;
        detail += `Upload through tampering storage blocked before any transaction: ${(e as Error).message.slice(0, 90)}`;
      }
      tamperCt.close();
      tamperAll.close();
    } else {
      detail = "No storage directory available to run a tampering fixture against.";
    }
    add({
      id: "ADV-5",
      attempt: "Serve modified ciphertext",
      expected: "Client detects commitment mismatch",
      observed: detail,
      passed: readDetected && uploadBlocked,
      evidence: { readDetected, uploadBlocked, integrationTest: "packages/relay-sdk/test/crypto.test.ts › detects modified ciphertext served by storage" },
    });
  }

  // ADV-6. Point the verifier at a false server response.
  {
    const claimed = { lifecycle: "RELEASED", released: true, receiptCount: 2 };
    const report = await verifyFromChain({ circleId: B.circleId, client: h.client, registry: reg, deploymentBlock: BigInt(deployment.contract.deploymentBlock), deployment, claimed });
    add({
      id: "ADV-6",
      attempt: "Point verifier at a false server response",
      expected: "Verifier derives state from chain and reports the actual state",
      observed: `claimed RELEASED; chain-derived ${report.evaluation.lifecycle}; claim ${report.claimedStateCheck?.matches ? "accepted" : "rejected"}: ${report.claimedStateCheck?.differences.join("; ")}`,
      passed: report.claimedStateCheck?.matches === false && report.evaluation.lifecycle === "RELEASE_ELIGIBLE",
      evidence: { claimed, derivedLifecycle: report.evaluation.lifecycle, differences: report.claimedStateCheck?.differences, verdictOnChainHistory: report.verdict },
    });
  }

  // ADV-7. Withhold one relayer receipt.
  {
    const b = await reader.getCircle(B.circleId);
    const report = await verifyFromChain({ circleId: B.circleId, client: h.client, registry: reg, deploymentBlock: BigInt(deployment.contract.deploymentBlock), deployment });
    const opened = await openCapsuleFlow(ctx(member), { circleId: B.circleId, privateJwk: memberKeys.privateJwk });
    const unavailable = opened.items.length > 0 && opened.items.every((i) => /Release unavailable: 1 of 2/.test(i.error ?? ""));
    add({
      id: "ADV-7",
      attempt: "Withhold one relayer receipt",
      expected: "State remains RELEASE_UNAVAILABLE, not RELEASED",
      observed: `lifecycle ${b.lifecycle}; receipts ${b.receiptCount}/${b.policy.receiptThreshold}; delivery ${JSON.stringify(report.evaluation.delivery)}; member reveal: ${opened.items.map((i) => i.error).join(" | ")}`,
      passed: b.lifecycle === "RELEASE_ELIGIBLE" && report.evaluation.delivery?.kind === "RELEASE_UNAVAILABLE" && unavailable,
      evidence: { eventTrace: report.events.map((e) => `${e.name}@${e.blockNumber}`), delivery: report.evaluation.delivery, verifierVerdict: report.verdict, withheldBy: identities[1]!.address },
    });
  }

  const a = await reader.getCircle(A.circleId);
  const openedA = await openCapsuleFlow(ctx(member), { circleId: A.circleId, privateJwk: memberKeys.privateJwk });
  const control = { lifecycle: a.lifecycle, receipts: a.receiptCount, opened: openedA.items.filter((i) => i.opened).length };
  console.log(`control: circle A ${control.lifecycle} with ${control.receipts} receipts; member opened ${control.opened}/2`);

  const out = {
    schema: "relay.adversarial-report/v1",
    label: deployment.label,
    network,
    runId,
    registry: reg,
    chainId: deployment.chainId,
    sourceCommit: deployment.sourceCommit,
    control,
    passed: attempts.every((x) => x.passed) && control.lifecycle === "RELEASED" && control.opened === 2,
    attempts,
  };
  const dir = resolve(ROOT, "evidence/adversarial", network);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${runId}.json`), `${JSON.stringify(out, null, 2)}\n`);
  writeFileSync(resolve(dir, "latest.json"), `${JSON.stringify(out, null, 2)}\n`);
  const rows = attempts.map((x) => `| ${x.id} | ${x.attempt} | ${x.expected} | ${x.passed ? "✅" : "❌"} ${x.observed.replace(/\|/g, "\\|")} |`).join("\n");
  writeFileSync(
    resolve(dir, "latest.md"),
    `# Adversarial campaign — ${deployment.label}\n\nRun ${runId} against registry \`${reg}\` (chain ${deployment.chainId}).\n\n| ID | Attempt | Expected | Observed |\n|---|---|---|---|\n${rows}\n\nControl: circle ${A.circleId} ${control.lifecycle} with ${control.receipts} receipts; member opened ${control.opened}/2 contributions.\n`,
  );
  console.log(`\n${out.passed ? "ALL EXPECTED REJECTIONS EVIDENCED" : "UNEXPECTED RESULT — record it in the claim ledger"} → evidence/adversarial/${network}/${runId}.json`);
  stop();
  process.exit(out.passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
