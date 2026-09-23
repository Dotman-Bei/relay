// JavaScript and total bytes transferred on first load of each route (cold cache).
//   node e2e/js-weight.mjs <baseUrl> [routes…]
import { chromium } from "@playwright/test";
const [base, ...rest] = process.argv.slice(2);
const routes = rest.length ? rest : ["/", "/how-it-works", "/explore", "/onboarding", "/app", "/circles/new", "/capsules/new?circleId=4", "/capsules/1/reveal", "/verify/1"];
const b = await chromium.launch();
const rows = [];
for (const r of routes) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem("relay:wallet:v1", JSON.stringify({ kind: "fixture", fixture: 0 })));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  let js = 0, all = 0, jsFiles = 0;
  const types = {};
  cdp.on("Network.responseReceived", (e) => (types[e.requestId] = e.type));
  cdp.on("Network.loadingFinished", (e) => { all += e.encodedDataLength; if (types[e.requestId] === "Script") { js += e.encodedDataLength; jsFiles++; } });
  await p.goto(base + r, { waitUntil: "load" });
  await p.waitForTimeout(2500);
  rows.push({ r, js, jsFiles, all });
  await ctx.close();
}
await b.close();
for (const x of rows) console.log(`${x.r.padEnd(28)} JS ${(x.js / 1024).toFixed(0).padStart(5)} KB in ${String(x.jsFiles).padStart(2)} files · total ${(x.all / 1024).toFixed(0)} KB`);
