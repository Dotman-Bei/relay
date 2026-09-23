// JavaScript a route needs before it renders: the chunks its own HTML references (gzip size),
// excluding lazy chunks and link prefetches. node e2e/js-initial.mjs <baseUrl> [routes…]
import { gzipSync } from "node:zlib";
const [base, ...rest] = process.argv.slice(2);
const routes = rest.length ? rest : ["/", "/how-it-works", "/explore", "/onboarding", "/app", "/circles/new", "/capsules/1/reveal", "/verify/1"];
const cache = new Map();
async function size(url) {
  if (!cache.has(url)) cache.set(url, gzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).length);
  return cache.get(url);
}
for (const r of routes) {
  const html = await (await fetch(base + r)).text();
  const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"'\s)\\]+\.js/g)].map((m) => m[0]))];
  let total = 0;
  for (const c of chunks) total += await size(base + c);
  console.log(`${r.padEnd(22)} ${(total / 1024).toFixed(0).padStart(4)} KB gzip JS in ${chunks.length} chunks (HTML ${(gzipSync(Buffer.from(html)).length / 1024).toFixed(0)} KB)`);
}
