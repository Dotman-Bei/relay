/**
 * Relay social assets: the X/Twitter profile picture and header, plus the "link" emblem they share.
 *
 * The emblem is the logo tile and its hard offset shadow (frontend.md: `.neo`) opened into two
 * rounded-square rings and linked: ink over blue at one crossing, blue over ink at the other, so it
 * is symmetric under a half turn. Two sealed rooms that hold each other: later, together.
 * The header runs the same link out into a chain.
 *
 * Run `pnpm brand:social` after `pnpm brand` (it reuses the wordmark) to write brand/social/.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const INK = "#111111";
const BLUE = "#4d9dff";
const WHITE = "#ffffff";
const DOT = "#e6e8ec";

const brand = resolve(import.meta.dirname, "../brand");
const out = resolve(brand, "social");
mkdirSync(out, { recursive: true });

const n = (v: number) => String(Math.round(v * 100) / 100);

// ─── The link ─────────────────────────────────────────────────────────────────────────────
// Ring outer size S, corner radius RC, stroke T; the second ring sits O down and right.
// G is the white moat either side of the strand on top at a crossing.
const S = 100;
const RC = 30;
const T = 17;
const O = 44;
const G = 6;

const ring = (x: number, y: number, color: string) =>
  `<rect x="${n(x + T / 2)}" y="${n(y + T / 2)}" width="${n(S - T)}" height="${n(S - T)}" rx="${n(RC - T / 2)}" fill="none" stroke="${color}" stroke-width="${T}"/>`;
const box = (x: number, y: number, w: number, h: number, color: string) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${color}"/>`;

/**
 * A chain of rings stepping O right and O down, colours alternating. Each pair links the same way:
 * the earlier ring's right side runs over the next ring's top, the later ring's left side runs over
 * the earlier ring's bottom. Both crossings fall on straight runs, so the strand on top is redrawn
 * as a plain bar over a moat: no clip paths, no antialiasing seams.
 */
function chain(x0: number, y0: number, count: number, colors: string[], bg: string): string {
  const pos = Array.from({ length: count }, (_, i) => ({ x: x0 + i * O, y: y0 + i * O, c: colors[i % colors.length]! }));
  let body = pos.map((p) => ring(p.x, p.y, p.c)).join("");
  for (let i = 0; i + 1 < pos.length; i++) {
    const a = pos[i]!, b = pos[i + 1]!;
    // a's right side over b's top.
    body += box(a.x + S - T - G, b.y - 1, T + 2 * G, T + 2, bg) + box(a.x + S - T, b.y - 4, T, T + 8, a.c);
    // b's left side over a's bottom.
    body += box(b.x - G, a.y + S - T - 1, T + 2 * G, T + 2, bg) + box(b.x, a.y + S - T - 4, T, T + 8, b.c);
  }
  return body;
}

const EMBLEM = S + O; // the two-ring link's box

function svg(w: number, h: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" role="img" aria-label="${title}">` +
    `<title>${title}</title>${body}</svg>\n`
  );
}
function write(name: string, content: string) {
  writeFileSync(resolve(out, name), content);
  console.log(`brand/social/${name}`);
}

// ─── Emblem on its own ────────────────────────────────────────────────────────────────────
write("relay-link.svg", svg(EMBLEM, EMBLEM, "Relay", chain(0, 0, 2, [INK, BLUE], WHITE)));

// ─── Profile picture ──────────────────────────────────────────────────────────────────────
// X crops the square to a circle: the link spans 62% of the side, well inside it.
const AV = 400;
{
  const k = (AV * 0.62) / EMBLEM;
  const p = (AV - EMBLEM * k) / 2;
  const body =
    `<rect width="${AV}" height="${AV}" fill="${WHITE}"/>` +
    `<g transform="translate(${n(p)} ${n(p)}) scale(${n(k)})">${chain(0, 0, 2, [INK, BLUE], WHITE)}</g>`;
  write("relay-x-avatar.svg", svg(AV, AV, "Relay", body));
}

// ─── Header ───────────────────────────────────────────────────────────────────────────────
// 1500×500. X lays the avatar over the bottom-left and crops top and bottom on narrow screens,
// so the type starts right of the avatar (it covers x<400, y>320 on the 600px profile column) and
// the chain holds the right.
const HW = 1500, HH = 500;
{
  // Wordmark from brand/relay-wordmark.svg (cap height 100), with its slot recoloured blue.
  const wm = readFileSync(resolve(brand, "relay-wordmark.svg"), "utf8");
  const wmBody = wm.replace(/^.*?<\/title>/s, "").replace(/<\/svg>\s*$/, "").replaceAll("#ff8fce", BLUE);

  const dots: string[] = [];
  const step = 28;
  for (let y = step / 2; y < HH; y += step) for (let x = step / 2; x < HW; x += step) dots.push(`M${x} ${y}h0`);

  // Three links, centred on the band's height, clear of the right edge.
  const links = 3;
  const cs = 2.05;
  const span = (S + (links - 1) * O) * cs;
  const tx = HW - 125 - span, ty = (HH - span) / 2;
  const chainBody = chain(0, 0, links, [INK, BLUE], WHITE);

  const capX = 420, capY = 136, capH = 92;
  const body =
    `<rect width="${HW}" height="${HH}" fill="${WHITE}"/>` +
    `<path d="${dots.join("")}" stroke="${DOT}" stroke-width="4" stroke-linecap="round"/>` +
    `<g transform="translate(${tx} ${ty}) scale(${cs})">${chainBody}</g>` +
    `<g transform="translate(${capX} ${capY}) scale(${n(capH / 100)})">${wmBody}</g>` +
    `<text x="${capX}" y="${capY + capH + 92}" font-family="Inter, 'Inter Black', system-ui, sans-serif" font-weight="900" font-size="54" letter-spacing="-1.4" fill="${INK}">Later, together.</text>` +
    `<text x="${capX + 2}" y="${capY + capH + 140}" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="24" fill="${INK}" fill-opacity=".62">Social time capsules on BOT Chain</text>`;
  write("relay-x-header.svg", svg(HW, HH, "Relay: Later, together.", body));
}

// ─── PNG exports ──────────────────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();
async function raster(file: string, w: number, h: number, name: string) {
  const src = readFileSync(resolve(out, file), "utf8");
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0">${src.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(resolve(out, name), await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }));
  console.log(`brand/social/${name}`);
}
await raster("relay-x-avatar.svg", 1000, 1000, "relay-x-avatar.png");
await raster("relay-x-header.svg", 1500, 500, "relay-x-header.png");
await raster("relay-x-header.svg", 3000, 1000, "relay-x-header@2x.png");
await browser.close();
