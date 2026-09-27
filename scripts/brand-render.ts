/**
 * Render brand/*.svg to PNG exports, favicon.ico and a preview sheet (brand/preview.png),
 * using the Playwright Chromium already installed for the web e2e suite.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const dir = resolve(import.meta.dirname, "../brand");
const png = resolve(dir, "png");
mkdirSync(png, { recursive: true });
const read = (f: string) => readFileSync(resolve(dir, f), "utf8");
const uri = (f: string) => `data:image/svg+xml;base64,${Buffer.from(read(f)).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

async function raster(file: string, w: number, h: number, bg = "transparent"): Promise<Buffer> {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:${bg}"><img src="${uri(file)}" style="display:block;width:${w}px;height:${h}px"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  return page.screenshot({ omitBackground: bg === "transparent", clip: { x: 0, y: 0, width: w, height: h } });
}
const box = (f: string) => {
  const m = read(f).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!;
  return { w: Number(m[1]), h: Number(m[2]) };
};

// Favicon and app icons.
const icoSizes = [16, 32, 48];
const icoPngs: Buffer[] = [];
for (const s of icoSizes) {
  const b = await raster("relay-favicon.svg", s, s);
  writeFileSync(resolve(png, `favicon-${s}.png`), b);
  icoPngs.push(b);
}
for (const [name, s] of [["apple-touch-icon", 180], ["icon-192", 192], ["icon-512", 512]] as const) {
  writeFileSync(resolve(png, `${name}.png`), await raster("relay-mark-flat.svg", s, s));
}
for (const f of ["relay-mark.svg", "relay-mark-black.svg", "relay-mark-white.svg"]) {
  const { w, h } = box(f);
  writeFileSync(resolve(png, f.replace(".svg", "-1024.png")), await raster(f, 1024, Math.round((1024 * h) / w)));
}
for (const f of ["relay-lockup.svg", "relay-lockup-dark.svg", "relay-lockup-black.svg", "relay-lockup-white.svg"]) {
  const { w, h } = box(f);
  writeFileSync(resolve(png, f.replace(".svg", "-1200.png")), await raster(f, 1200, Math.round((1200 * h) / w)));
}

// favicon.ico: an ICONDIR followed by PNG-encoded entries (supported by every current browser).
{
  const head = Buffer.alloc(6 + 16 * icoPngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(icoPngs.length, 4);
  let offset = head.length;
  icoPngs.forEach((b, i) => {
    const e = 6 + 16 * i;
    const s = icoSizes[i]!;
    head.writeUInt8(s, e);
    head.writeUInt8(s, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(b.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += b.length;
  });
  writeFileSync(resolve(dir, "favicon.ico"), Buffer.concat([head, ...icoPngs]));
}

// Preview sheet.
const img = (f: string, style: string) => `<img src="${uri(f)}" style="${style}">`;
const sheet = `<html><head><style>
  body{margin:0;font:600 14px system-ui,sans-serif;color:#111;background:#fdf6e3}
  .row{display:flex;gap:40px;align-items:center;padding:36px 48px;border-bottom:3px solid #111;flex-wrap:wrap}
  .dark{background:#111;color:#fdf6e3}
  .label{width:140px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;font-size:12px}
  .px{image-rendering:pixelated}
</style></head><body>
  <div class="row"><span class="label">Lockup</span>${img("relay-lockup.svg", "height:120px")}</div>
  <div class="row dark"><span class="label">Lockup · dark</span>${img("relay-lockup-dark.svg", "height:120px")}</div>
  <div class="row" style="background:#fff"><span class="label">One colour</span>${img("relay-lockup-black.svg", "height:90px")}${img("relay-mark-black.svg", "height:90px")}</div>
  <div class="row dark"><span class="label">One colour · reverse</span>${img("relay-lockup-white.svg", "height:90px")}${img("relay-mark-white.svg", "height:90px")}</div>
  <div class="row"><span class="label">Mark</span>${img("relay-mark.svg", "height:200px")}${img("relay-mark-flat.svg", "height:96px")}${img("relay-wordmark.svg", "height:110px")}</div>
  <div class="row"><span class="label">Favicon, real px</span>
    ${img("relay-favicon.svg", "width:16px")}${img("relay-favicon.svg", "width:24px")}${img("relay-favicon.svg", "width:32px")}${img("relay-favicon.svg", "width:48px")}
    <span class="label" style="width:auto">×8 zoom</span>
    <img class="px" src="data:image/png;base64,${icoPngs[0]!.toString("base64")}" style="width:128px">
    <img class="px" src="data:image/png;base64,${icoPngs[1]!.toString("base64")}" style="width:128px">
  </div>
  <div class="row"><span class="label">In a browser tab</span>
    <div style="display:flex;align-items:center;gap:8px;background:#dee1e6;border-radius:10px 10px 0 0;padding:8px 14px;width:220px">
      ${img("relay-favicon.svg", "width:16px")}<span style="font:400 12px system-ui">Relay · Later, together</span></div>
    <div style="display:flex;align-items:center;gap:8px;background:#35363a;color:#fff;border-radius:10px 10px 0 0;padding:8px 14px;width:220px">
      ${img("relay-favicon.svg", "width:16px")}<span style="font:400 12px system-ui">Relay · Later, together</span></div>
  </div>
</body></html>`;
await page.setViewportSize({ width: 1100, height: 400 });
await page.setContent(sheet);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
writeFileSync(resolve(dir, "preview.png"), await page.screenshot({ fullPage: true }));
await browser.close();
// Next.js file conventions: app/favicon.ico and app/apple-icon.png are linked automatically.
copyFileSync(resolve(dir, "favicon.ico"), resolve(dir, "../apps/web/app/favicon.ico"));
copyFileSync(resolve(png, "apple-touch-icon.png"), resolve(dir, "../apps/web/app/apple-icon.png"));
console.log("brand/png/*, brand/favicon.ico, brand/preview.png, apps/web/app/{favicon.ico,apple-icon.png}");
