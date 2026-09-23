/** Copy live deployment data into the web client's public folder (runtime-loaded, never compiled in). */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "apps/web/public/relay");
mkdirSync(out, { recursive: true });
for (const net of ["local", "testnet", "mainnet"]) {
  const src = resolve(root, `deployments/${net}.json`);
  if (existsSync(src)) copyFileSync(src, resolve(out, `deployment.${net}.json`));
}
for (const probe of ["testnet.probe.json", "mainnet.probe.json"]) {
  const src = resolve(root, "deployments", probe);
  if (existsSync(src)) copyFileSync(src, resolve(out, probe));
}
console.log("synced deployment records → apps/web/public/relay");
