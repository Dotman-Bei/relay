/**
 * Smoke-test the container topology without Docker: storage, three relayers (one key file each)
 * and the Memory Steward are started with the exact commands and environment variables that
 * deploy/compose.yaml gives their containers, as separate processes, against a LOCAL FIXTURE chain.
 * A two-member capsule must then release and open through them.
 *
 *   pnpm smoke:services
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeploymentSchema, type Policy } from "@relay/protocol-types";
import {
  acceptInviteFlow,
  consentFlow,
  contributeFlow,
  createCircleFlow,
  generateEncryptionKeyPair,
  HttpBlobStore,
  issueInvitesFlow,
  openCapsuleFlow,
  utf8,
} from "@relay/sdk";
import { ANVIL_KEYS, assertPortFree, bootLocal, Harness, ROOT } from "./lib/harness.ts";

const TSX = resolve(ROOT, "node_modules/.bin/tsx");
const PORTS = { anvil: 8945, bootStorage: 8987, storage: 8997, steward: 8988 };
const children: { name: string; proc: ChildProcess; out: string[] }[] = [];

function start(name: string, args: string[], env: Record<string, string>) {
  const proc = spawn(TSX, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const out: string[] = [];
  proc.stdout!.on("data", (b: Buffer) => out.push(b.toString()));
  proc.stderr!.on("data", (b: Buffer) => out.push(b.toString()));
  children.push({ name, proc, out });
  return { proc, out };
}

async function waitFor(what: string, check: () => Promise<boolean>, timeoutMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await check()) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) throw new Error(`smoke check failed: ${label}`);
};

async function main() {
  for (const p of Object.values(PORTS)) await assertPortFree(p);
  const dir = resolve(ROOT, ".relay-local/smoke-services");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // Chain + registry + funded relayer identities (keys registered on-chain).
  const boot = await bootLocal({ anvilPort: PORTS.anvil, storagePort: PORTS.bootStorage, dir });
  const storageUrl = `http://127.0.0.1:${PORTS.storage}`;
  const deployment = DeploymentSchema.parse({ ...boot.deployment, storage: { ...boot.deployment.storage, url: storageUrl } });
  const deploymentFile = resolve(dir, "deployment.json");
  writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));

  // `relayer split`, as run on the machine holding the identities.
  mkdirSync(resolve(dir, "relayers"), { recursive: true });
  copyFileSync(resolve(dir, "relayer-identities.json"), resolve(dir, "relayers/identities.json"));
  const split = spawnSync(TSX, ["apps/relayer/src/relayer.ts", "split", "--dir", resolve(dir, "relayers"), "--out", resolve(dir, "secrets")], { cwd: ROOT, encoding: "utf8" });
  const secrets = readdirSync(resolve(dir, "secrets")).sort();
  ok("relayer split writes one key file per relayer", split.status === 0 && secrets.length === 3, secrets.join(", "));

  // storage container: same command and env as compose.
  start("storage", ["apps/relayer/src/storage-server.ts"], { STORAGE_HOST: "0.0.0.0", STORAGE_PORT: String(PORTS.storage), STORAGE_DIR: resolve(dir, "storage-data") });
  await waitFor("storage /health", async () => (await fetch(`${storageUrl}/health`)).ok);
  ok("storage container answers /health", true);

  // relayer-N containers: one mounted identity each, internal STORAGE_URL, auto-request on.
  secrets.forEach((file, i) =>
    start(`relayer-${i + 1}`, ["apps/relayer/src/relayer.ts", "run", "--identities", resolve(dir, "secrets", file), "--state", resolve(dir, `relayer-${i + 1}`)], {
      RELAY_DEPLOYMENT: deploymentFile,
      STORAGE_URL: storageUrl,
      POLL_MS: "1000",
      AUTO_REQUEST_RELEASE: "1",
    }),
  );

  // steward container.
  start("steward", ["apps/agent/src/server.ts"], {
    RELAY_DEPLOYMENT: deploymentFile,
    STEWARD_HOST: "0.0.0.0",
    STEWARD_PORT: String(PORTS.steward),
    STEWARD_DIR: resolve(dir, "steward-data"),
    ANTHROPIC_API_KEY: "",
  });
  await waitFor("steward /health", async () => (await fetch(`http://127.0.0.1:${PORTS.steward}/health`)).ok);
  const sh = (await (await fetch(`http://127.0.0.1:${PORTS.steward}/health`)).json()) as { mode: string; agent: string };
  ok("steward container answers /health", sh.mode === "TEMPLATE", `agent ${sh.agent}, ${sh.mode} mode`);

  // Relayers must have published their keys into *this* storage before anyone can seal.
  const store = new HttpBlobStore(storageUrl);
  await waitFor("relayer keys in storage", async () => {
    for (const r of deployment.quorum.relayers) await store.get(r.encryptionKeyFingerprint.slice(2));
    return true;
  });
  ok("each relayer published its key to storage over STORAGE_URL", true);

  // A two-member capsule through the running services.
  const h = new Harness(deployment);
  const creator = h.actor("creator", ANVIL_KEYS[1]!);
  const member = h.actor("member", ANVIL_KEYS[2]!);
  const reader = h.reader();
  const ctx = (a: typeof creator) => ({ chainId: deployment.chainId, registry: deployment.contract.address, account: a.account.address, reader, store, send: h.sender(a) });
  const now = await h.now();
  const policy: Policy = {
    sealAt: now + 60,
    releaseAt: now + 90,
    expiresAt: 0,
    capacity: 2,
    minContributions: 2,
    unanimousConsent: true,
    receiptThreshold: 2,
    relayers: deployment.quorum.relayers.map((r) => r.address),
  };
  const c = await createCircleFlow(ctx(creator), { policy, metadata: { v: 1, title: "Smoke", description: "", emoji: "🧪" }, open: true });
  const { invites } = await issueInvitesFlow(ctx(creator), { circleId: c.circleId, count: 1, metadataKey: c.metadataKey });
  await acceptInviteFlow(ctx(member), invites[0]!.secret);
  const kc = await generateEncryptionKeyPair();
  const km = await generateEncryptionKeyPair();
  await consentFlow(ctx(creator), { circleId: c.circleId, reviewedPolicyHash: c.policyHash, publicKey: kc.publicKey });
  await consentFlow(ctx(member), { circleId: c.circleId, reviewedPolicyHash: c.policyHash, publicKey: km.publicKey });
  await contributeFlow(ctx(creator), { circleId: c.circleId, header: { kind: "text", mime: "text/plain" }, body: utf8.encode("from the creator") });
  await contributeFlow(ctx(member), { circleId: c.circleId, header: { kind: "text", mime: "text/plain" }, body: utf8.encode("from the member") });
  ok("capsule sealed through the storage container", (await reader.getCircle(c.circleId)).contributionCount === 2);

  await h.warpTo(policy.releaseAt);
  await waitFor("relayer containers to release the capsule", async () => (await reader.getCircle(c.circleId)).lifecycle === "RELEASED", 60_000);
  const circle = await reader.getCircle(c.circleId);
  ok("relayer containers recorded eligibility and receipts", circle.lifecycle === "RELEASED", `${circle.receiptCount}/3 receipts`);

  const opened = await openCapsuleFlow(ctx(member), { circleId: c.circleId, privateJwk: km.privateJwk });
  const texts = opened.items.map((i) => (i.opened ? utf8.decode(i.opened.body) : `ERROR ${i.error}`));
  ok("member opened both contributions", texts.includes("from the creator") && texts.includes("from the member"), texts.join(" | "));

  // Graceful shutdown, as `docker compose stop` sends SIGTERM.
  for (const ch of children.filter((x) => x.name.startsWith("relayer"))) ch.proc.kill("SIGTERM");
  await waitFor("relayers to stop on SIGTERM", async () => children.filter((x) => x.name.startsWith("relayer")).every((x) => x.out.join("").includes("[relayer] stopped")), 15_000);
  ok("relayers stop cleanly on SIGTERM", true);

  boot.stop();
  console.log("\nSMOKE PASSED — the compose services work together (LOCAL FIXTURE chain)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    for (const ch of children) console.error(`--- ${ch.name}\n${ch.out.join("").slice(-1500)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const ch of children) ch.proc.kill("SIGTERM");
    setTimeout(() => process.exit(), 500);
  });
