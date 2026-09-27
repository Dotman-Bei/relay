/** Copy live deployment data into the web client's public folder (runtime-loaded, never compiled in). */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "apps/web/public/relay");
mkdirSync(out, { recursive: true });
// A build for one network (NEXT_PUBLIC_RELAY_NETWORK) publishes only that network's records, so a
// mainnet site serves no testnet or fixture data. Without it (local dev) every record is copied.
// Nothing is deleted: a server hosting another network's build may still serve its own records here.
const only = process.env.NEXT_PUBLIC_RELAY_NETWORK;
const nets = only ? [only] : ["local", "testnet", "mainnet"];
for (const net of nets) {
  const src = resolve(root, `deployments/${net}.json`);
  if (existsSync(src)) copyFileSync(src, resolve(out, `deployment.${net}.json`));
  const probe = resolve(root, "deployments", `${net}.probe.json`);
  if (existsSync(probe)) copyFileSync(probe, resolve(out, `${net}.probe.json`));
}
console.log(`synced ${nets.join(", ")} deployment records → apps/web/public/relay`);
