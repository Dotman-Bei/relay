import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:3100";
const id = process.argv[3] ?? "1";
const pages = ["/app", "/circles", "/circles/new", `/circles/${id}`, `/circles/${id}/consent`, `/circles/${id}/invite`, "/capsules", `/capsules/${id}`, `/capsules/${id}/reveal`, `/capsules/new?circleId=${id}`, "/activity", "/settings"];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => localStorage.setItem("relay:wallet:v1", JSON.stringify({ kind: "fixture", fixture: 1 })));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
for (const p of pages) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${p}: ${o > 0 ? `OVERFLOW ${o}px` : "ok"}`);
}
console.log(errors.length ? `page errors: ${errors.join(" | ")}` : "no page errors");
await b.close();
