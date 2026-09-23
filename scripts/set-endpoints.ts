/**
 * Point a deployment record at its public storage and Memory Steward endpoints (off-chain data:
 * no redeploy). Checks each endpoint answers /health before writing.
 *
 *   pnpm endpoints:set --network testnet --storage https://storage.relay.example.com --steward https://steward.relay.example.com
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DeploymentSchema } from "@relay/protocol-types";
import { ROOT } from "./lib/harness.ts";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function health(url: string) {
  const res = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url}/health answered HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  const network = arg("network") ?? "testnet";
  const file = resolve(ROOT, `deployments/${network}.json`);
  const d = DeploymentSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const storage = arg("storage");
  const steward = arg("steward");
  if (!storage && !steward) throw new Error("Pass --storage and/or --steward");
  for (const u of [storage, steward]) {
    if (u && network !== "local" && !u.startsWith("https://")) throw new Error(`${u}: public endpoints must use https (browsers block mixed content)`);
  }
  if (storage) {
    const h = await health(storage);
    if (h.label !== "PROJECT_BASELINE storage") throw new Error(`${storage} is not a Relay storage server`);
    d.storage = { url: storage.replace(/\/$/, ""), operator: arg("storage-operator") ?? "Relay project (hosted)", label: d.storage.label };
  }
  if (steward) {
    const h = await health(steward);
    if (typeof h.agent !== "string") throw new Error(`${steward} is not a Relay Memory Steward`);
    d.steward = { url: steward.replace(/\/$/, ""), address: h.agent as `0x${string}` };
  }
  writeFileSync(file, `${JSON.stringify(DeploymentSchema.parse(d), null, 2)}\n`);
  console.log(`Updated ${file}\n  storage ${d.storage.url}\n  steward ${d.steward.url ?? "—"} (${d.steward.address ?? "no agent"})\nCommit it, pull on the server, then: docker compose restart relayer-1 relayer-2 relayer-3 steward web`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
