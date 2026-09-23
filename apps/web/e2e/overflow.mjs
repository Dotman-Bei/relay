import { chromium } from "@playwright/test";
const [base, path] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await p.goto(base + path, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const res = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > vw + 1)
    .filter((el) => ![...el.children].some((c) => c.getBoundingClientRect().right > vw + 1))
    .slice(0, 8)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)} text="${(el.textContent || "").slice(0, 50)}"`);
});
console.log(res.join("\n") || "no overflow");
await b.close();
