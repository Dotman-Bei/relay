// Visual review: capture pages at desktop and phone widths. Usage: node e2e/screens.mjs <baseUrl> <outDir> [paths...]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const [base = "http://127.0.0.1:3100", out = "screens", ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const list = paths.length ? paths : ["/", "/how-it-works", "/explore", "/onboarding", "/app", "/verify/1"];
const b = await chromium.launch();
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: vp, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  for (const p of list) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const file = `${out}/${name}${p === "/" ? "-home" : p.replace(/\//g, "-")}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(`${file}${overflow ? "  ⚠ horizontal overflow" : ""}`);
  }
  if (errors.length) console.log(`${name} console errors:\n  ${[...new Set(errors)].join("\n  ")}`);
  await ctx.close();
}
await b.close();
