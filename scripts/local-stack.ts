/**
 * Run the full LOCAL FIXTURE stack for developing and demoing the web client:
 * anvil (8645) · CapsuleRegistry · storage (8687) · Memory Steward (8688) · 3 relayers (2-of-3).
 * Writes deployments/local.json and apps/web/public/relay/deployment.local.json.
 *
 *   pnpm local:chain         then, in another shell: NEXT_PUBLIC_RELAY_NETWORK=local pnpm web:dev
 */
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { DeploymentSchema } from "@relay/protocol-types";
import { HttpBlobStore } from "@relay/sdk";
import { Relayer } from "../apps/relayer/src/relayer.ts";
import { startStewardServer } from "../apps/agent/src/server.ts";
import { ANVIL_KEYS, bootLocal, ROOT } from "./lib/harness.ts";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";

async function main() {
  const dir = resolve(ROOT, ".relay-local/stack");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const out = resolve(ROOT, "deployments/local.json");
  const boot = await bootLocal({ anvilPort: 8645, storagePort: 8687, dir, writeDeployment: out });
  const deployment = DeploymentSchema.parse({ ...boot.deployment, steward: { url: "http://127.0.0.1:8688", address: null } });
  const steward = startStewardServer({ port: 8688, deploymentFile: out, dir: resolve(dir, "steward") });
  const withSteward = DeploymentSchema.parse({ ...deployment, steward: { url: "http://127.0.0.1:8688", address: steward.steward.account.address } });
  writeFileSync(out, `${JSON.stringify(withSteward, null, 2)}\n`);
  mkdirSync(resolve(ROOT, "apps/web/public/relay"), { recursive: true });
  copyFileSync(out, resolve(ROOT, "apps/web/public/relay/deployment.local.json"));

  const relayer = new Relayer({
    deployment: withSteward,
    identities: boot.identities,
    store: new HttpBlobStore(withSteward.storage.url),
    autoRequestRelease: true,
    metricsFile: resolve(dir, "relayer-metrics.jsonl"),
  });
  console.log(`\nLOCAL FIXTURE stack running — this is a development chain, not BOT Chain.
  rpc        ${withSteward.rpcUrl}
  registry   ${withSteward.contract.address}
  storage    ${withSteward.storage.url}
  steward    http://127.0.0.1:8688 (${steward.mode})
  relayers   ${boot.identities.map((i) => i.address).join(", ")} (2-of-3, LOCAL FIXTURE)
  dev accounts (anvil, public keys — never use on a real network):
${ANVIL_KEYS.slice(1).map((k, i) => `    #${i + 1} ${privateKeyToAccount(k).address}`).join("\n")}
Start the web client with: NEXT_PUBLIC_RELAY_NETWORK=local pnpm web:dev\n`);

  const stop = () => {
    boot.stop();
    steward.server.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  for (;;) {
    try {
      await relayer.tick();
    } catch (e) {
      console.error(`[relayer] ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
