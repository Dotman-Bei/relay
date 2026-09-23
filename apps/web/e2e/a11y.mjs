// WCAG 2 A/AA audit with axe-core. Signed-in pages use LOCAL FIXTURE account #2 (member of circle 4).
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const axe = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] ?? "http://127.0.0.1:3100";
const circle = process.argv[3] ?? "4";
const pages = ["/", "/how-it-works", "/explore", "/onboarding", `/verify/${circle}`, "/app", "/circles", "/circles/new", `/circles/${circle}`, `/circles/${circle}/consent`, `/circles/${circle}/invite`, "/capsules", `/capsules/${circle}`, `/capsules/${circle}/reveal`, `/capsules/new?circleId=${circle}`, "/activity", "/settings"];
const b = await chromium.launch();
let total = 0;
for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await b.newContext({ viewport: vp, reducedMotion: "reduce" });
  await ctx.addInitScript(() => localStorage.setItem("relay:wallet:v1", JSON.stringify({ kind: "fixture", fixture: 1 })));
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.addScriptTag({ content: axe });
    const res = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
    const v = res.violations;
    total += v.length;
    console.log(`${vp.width}px ${p}: ${v.length ? v.map((x) => `${x.id}(${x.nodes.length})`).join(", ") : "ok"}`);
    for (const x of v) for (const n of x.nodes.slice(0, 3)) console.log(`    ${x.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`);
  }
  await ctx.close();
}
await b.close();
console.log(total ? `${total} violation groups` : "no axe violations");
