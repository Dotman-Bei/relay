// Responsive audit: every route × many viewports. Reports page-level horizontal scroll, clipped or
// spilling content, small tap targets and tiny text; optionally saves viewport screenshots.
//   node e2e/responsive-audit.mjs <baseUrl> [--shots DIR] [--circle-key file.json] [--routes a,b]
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = args[0] ?? "http://127.0.0.1:3100";
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const shots = opt("shots");
const circleKey = opt("circle-key") ? JSON.parse(readFileSync(opt("circle-key"), "utf8")) : null;
const VIEWPORTS = [
  [320, 640], [360, 740], [390, 844], [414, 896], [600, 960], [768, 1024], [820, 1180],
  [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [844, 390],
];
const ROUTES = opt("routes")?.split(",") ?? [
  "/", "/how-it-works", "/explore", "/onboarding", "/verify/1",
  "/app", "/circles", "/circles/new", "/circles/4", "/circles/4/consent", "/circles/4/invite", "/circles/2",
  "/capsules", "/capsules/1", "/capsules/1/reveal", "/capsules/new?circleId=4", "/activity", "/settings",
];
if (shots) mkdirSync(shots, { recursive: true });

const b = await chromium.launch();
const report = [];
for (const [w, h] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", hasTouch: w < 1024, isMobile: w < 768 });
  await ctx.addInitScript((ck) => {
    localStorage.setItem("relay:wallet:v1", JSON.stringify({ kind: "fixture", fixture: 0 }));
    if (ck) localStorage.setItem(`relay:circle-keys:v1:${ck.scope}`, JSON.stringify({ [ck.circleId]: ck.key }));
  }, circleKey);
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    // Pages poll the chain, so "network idle" never comes: wait for load, then for data to render.
    await page.goto(base + route, { waitUntil: "load" });
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const docOverflow = document.documentElement.scrollWidth - vw;
      const visible = (el) => {
        const s = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return s.visibility !== "hidden" && s.display !== "none" && rect.width > 0 && rect.height > 0 && !el.closest("[aria-hidden=true]") && !el.classList.contains("sr-only");
      };
      const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 4).join(".")} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 32)}"`;
      // Content wider than its box that isn't meant to scroll (clipped or spilling).
      const spill = [];
      for (const el of document.querySelectorAll("main *, header *, nav *, footer *")) {
        if (!visible(el)) continue;
        const s = getComputedStyle(el);
        if (["auto", "scroll"].includes(s.overflowX)) continue;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !["svg", "path", "text", "input", "textarea", "select"].includes(el.tagName.toLowerCase())) {
          if ([...el.children].some((c) => c.scrollWidth > c.clientWidth + 2)) continue; // report the innermost
          spill.push(describe(el));
        }
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 1 && !el.closest("[class*=overflow-x-auto]")) spill.push(`beyond viewport: ${describe(el)}`);
      }
      // Tap targets.
      const small24 = [];
      const small44 = [];
      for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], label:has(input)")) {
        if (!visible(el)) continue;
        if (el.matches("label:has(input) input")) continue;
        const rect = el.getBoundingClientRect();
        const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && el.closest("p, li, dd");
        if (inline) continue; // links inside running text are exempt (WCAG 2.5.8)
        if (rect.height < 24 || rect.width < 24) small24.push(`${describe(el)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
        else if (rect.height < 44) small44.push(describe(el));
      }
      // Text under 12px.
      let tiny = 0;
      let textNodes = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim() || !n.parentElement || !visible(n.parentElement)) continue;
        textNodes++;
        if (parseFloat(getComputedStyle(n.parentElement).fontSize) < 12) tiny++;
      }
      return { docOverflow, spill: [...new Set(spill)].slice(0, 6), small24: small24.slice(0, 8), small24n: small24.length, small44n: small44.length, tinyShare: textNodes ? tiny / textNodes : 0 };
    });
    report.push({ w, h, route, ...r });
    if (shots) await page.screenshot({ path: `${shots}/${w}x${h}${route.replace(/[/?=]/g, "_") || "_home"}.png` });
  }
  await ctx.close();
}
await b.close();

const bad = report.filter((x) => x.docOverflow > 0 || x.spill.length || x.small24n);
for (const x of bad) {
  console.log(`${x.w}x${x.h} ${x.route}: ${x.docOverflow > 0 ? `PAGE SCROLLS SIDEWAYS ${x.docOverflow}px; ` : ""}${x.spill.length ? `spill ${x.spill.join(" | ")}; ` : ""}${x.small24n ? `${x.small24n} tap targets <24px: ${x.small24.join(" | ")}` : ""}`);
}
const touch = report.filter((x) => x.w < 1024);
console.log(`\n${report.length} page×viewport checks · ${bad.length} with issues · touch-size targets under 44px (advisory): ${touch.reduce((s, x) => s + x.small44n, 0)} across ${touch.length} touch checks · text under 12px: max ${(Math.max(...report.map((x) => x.tinyShare)) * 100).toFixed(0)}% of text nodes`);
writeFileSync(opt("out") ?? "/dev/null", JSON.stringify(report, null, 2));
