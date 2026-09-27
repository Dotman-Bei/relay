/**
 * Relay brand marks, generated from geometry so every file shares one construction.
 *
 * The mark is an R built as a time capsule: the bowl's counter is a closed slot (the letterbox a
 * contribution drops through, sealed until the date) and the leg stands apart from the bowl (the
 * part that leaves later). It sits in the yellow tile with an ink border and a hard offset shadow
 * (frontend.md: the logo tile, `.neo`). Everything is filled paths: no strokes, fonts, gradients
 * or masks, so the files scale cleanly and open the same in any tool.
 *
 * Run `pnpm brand` to rewrite brand/*.svg; `pnpm brand:png` renders the PNG and ICO exports.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const INK = "#111111";
const YELLOW = "#ffd93d";
const PINK = "#ff8fce";
const CREAM = "#fdf6e3";
const WHITE = "#ffffff";

const out = resolve(import.meta.dirname, "../brand");
mkdirSync(out, { recursive: true });

const n = (v: number) => String(Math.round(v * 100) / 100);

// ─── The R ────────────────────────────────────────────────────────────────────────────────
// Cap height 100, baseline y=100. W stem weight, s slot height, L slot length (from the stem),
// gap the cut between bowl and leg, k the leg's run per unit of drop, over how far the leg's foot
// passes the bowl, Wl the leg's horizontal width. The bowl is the sealed capsule, its counter the
// slot; the leg stands apart: the part that leaves later.
interface RSpec { W: number; s: number; L: number; gap: number; k: number; over: number; Wl: number }

function rGlyph(p: RSpec): { bowl: string; slot: string; leg: string; width: number } {
  const Hb = 2 * p.W + p.s; // bowl height: wall, slot, wall
  const r = Hb / 2;
  const X = 2 * p.W + p.L; // bowl's right extreme: stem, slot, wall
  const cx = X - r;
  const xbr = X + p.over;
  const xbl = xbr - p.Wl;
  const yt = Hb + p.gap;
  const legTopLeft = xbl - p.k * (100 - yt);
  if (legTopLeft <= p.W) throw new Error("leg runs into the stem");
  const bowl = `M0 0H${n(cx)}A${n(r)} ${n(r)} 0 0 1 ${n(cx)} ${n(Hb)}H${n(p.W)}V100H0Z`;
  const h = p.s / 2;
  const se = p.W + p.L - h;
  const slot = `M${n(p.W)} ${n(r - h)}H${n(se)}A${n(h)} ${n(h)} 0 0 1 ${n(se)} ${n(r + h)}H${n(p.W)}Z`;
  const leg = `M${n(legTopLeft)} ${n(yt)}H${n(xbr - p.k * (100 - yt))}L${n(xbr)} 100H${n(xbl)}Z`;
  return { bowl, slot, leg, width: xbr };
}

/** Heavy R for the tile: it has to survive 16px. */
const R_MARK = rGlyph({ W: 23, s: 13, L: 34, gap: 8, k: 0.55, over: 2, Wl: 27 });
/** Text-weight R for the wordmark, matched to the lowercase. */
const R_TEXT = rGlyph({ W: 18, s: 11, L: 31, gap: 7, k: 0.55, over: 2, Wl: 22 });

/** The R as one or two fills: ink letter, and the slot either cut through or filled. */
function rFill(g: ReturnType<typeof rGlyph>, ink: string, slot: string | null): string {
  return slot
    ? `<path fill="${ink}" d="${g.bowl}${g.leg}"/><path fill="${slot}" d="${g.slot}"/>`
    : `<path fill="${ink}" fill-rule="evenodd" d="${g.bowl}${g.slot}${g.leg}"/>`;
}

// ─── Lowercase ────────────────────────────────────────────────────────────────────────────
// x-height 72 (y 28→100), weight 17, bowls on a ring of radius 36/19 centred at y=64.
const XH = 28;
const CY = 64;
const RO = 36;
const SW = 17;
const RI = RO - SW;

const ring = (cx: number, cy: number) =>
  `M${cx + RO} ${cy}A${RO} ${RO} 0 1 0 ${cx - RO} ${cy}A${RO} ${RO} 0 1 0 ${cx + RO} ${cy}Z` +
  `M${cx + RI} ${cy}A${RI} ${RI} 0 1 1 ${cx - RI} ${cy}A${RI} ${RI} 0 1 1 ${cx + RI} ${cy}Z`;
const rect = (x: number, y: number, w: number, h: number) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;

function eGlyph(cx: number): string[] {
  // The bowl starts at the bar's lower edge and ends at a radial cut 40° below the right.
  const bar = { top: CY - 8, h: 12 };
  const by = bar.top + bar.h;
  const dy = by - CY;
  const a = (40 * Math.PI) / 180;
  const ox = cx + RO * Math.cos(a), oy = CY + RO * Math.sin(a);
  const ix = cx + RI * Math.cos(a), iy = CY + RI * Math.sin(a);
  const bowl =
    `M${n(cx + Math.sqrt(RO * RO - dy * dy))} ${n(by)}A${RO} ${RO} 0 1 0 ${n(ox)} ${n(oy)}L${n(ix)} ${n(iy)}` +
    `A${RI} ${RI} 0 1 1 ${n(cx + Math.sqrt(RI * RI - dy * dy))} ${n(by)}Z`;
  return [bowl, rect(cx - RO + SW / 2, bar.top, RO + RI, bar.h)];
}
const lGlyph = (x: number) => [rect(x, 0, SW, 100)];
const aGlyph = (cx: number) => [ring(cx, CY), rect(cx + RI, XH, SW, 100 - XH)];
function yGlyph(cx: number): string[] {
  const lowerHalf =
    `M${cx - RO} ${CY}A${RO} ${RO} 0 0 0 ${cx + RO} ${CY}L${cx + RI} ${CY}A${RI} ${RI} 0 0 1 ${cx - RI} ${CY}Z`;
  const hookY = 110;
  const hook =
    `M${cx + RO} ${hookY}A${RO} ${RO} 0 0 1 ${cx} ${hookY + RO}L${cx} ${hookY + RI}A${RI} ${RI} 0 0 0 ${cx + RI} ${hookY}Z`;
  // Straight parts run 1 unit into the curves they meet, so edge antialiasing leaves no seam.
  return [rect(cx - RO, XH, SW, CY - XH + 1), lowerHalf, rect(cx + RI, XH, SW, hookY - XH + 1), hook];
}

// Spacing: tight, like `tracking-tight` at weight 900.
const E_CX = R_TEXT.width + 8 + RO;
const L_X = E_CX + RO + 11;
const A_CX = L_X + SW + 11 + RO;
const Y_CX = A_CX + RO + 9 + RO;
const WORD_W = Y_CX + RO;
const WORD_H = 146; // descender of the y
// Each part is its own path: overlapping parts (the e's bar, the a's stem) stack instead of
// cancelling, which a single even-odd path would do. Rings are the only parts with a counter.
const LOWER: string[] = [...eGlyph(E_CX), ...lGlyph(L_X), ...aGlyph(A_CX), ...yGlyph(Y_CX)];

/** Wordmark paths at cap height 100, origin at the cap line. */
function wordmark(ink: string, slot: string | null): string {
  return `${rFill(R_TEXT, ink, slot)}${LOWER.map((d) => `<path fill="${ink}" fill-rule="evenodd" d="${d}"/>`).join("")}`;
}

// ─── Tile ─────────────────────────────────────────────────────────────────────────────────
// 112-unit box: 102-unit tile with a 6-unit ink border, 8-unit hard shadow.
const TILE = 102;
const BORDER = 6;
const SHADOW = 8;
const RAD = 24;
const R_SCALE = 0.54;
const R_CAP = 100 * R_SCALE;
function rInTile(x0: number, y0: number, size: number, scale: number, width: number) {
  // Optical centre: the leg is lighter than the stem, so nudge right of the bbox centre.
  const tx = x0 + (size - width * scale) / 2 + size * 0.01;
  const ty = y0 + (size - 100 * scale) / 2;
  return { tx, ty };
}
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}` +
  `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
  `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;

interface TileOpts { shadow: boolean; fill: string; ink: string; slot: string | null }

/** The tile at the origin, TILE units square (plus SHADOW when shadowed). */
function tile(o: TileOpts): string {
  const { tx, ty } = rInTile(0, 0, TILE, R_SCALE, R_MARK.width);
  const glyph = rFill(R_MARK, o.ink, o.slot);
  return (
    (o.shadow ? `<path fill="${o.ink}" d="${rr(SHADOW, SHADOW, TILE, TILE, RAD)}"/>` : "") +
    `<path fill="${o.ink}" d="${rr(0, 0, TILE, TILE, RAD)}"/>` +
    `<path fill="${o.fill}" d="${rr(BORDER, BORDER, TILE - 2 * BORDER, TILE - 2 * BORDER, RAD - BORDER)}"/>` +
    `<g transform="translate(${n(tx)} ${n(ty)}) scale(${R_SCALE})">${glyph}</g>`
  );
}

/** One-colour tile: solid tile with the R cut out, so it works on any background. */
function knockoutTile(ink: string): string {
  const { tx, ty } = rInTile(0, 0, TILE, R_SCALE, R_MARK.width);
  // Transform the R into tile space by hand so tile and letter share one even-odd path.
  const t = (d: string) => transformPath(d, R_SCALE, tx, ty);
  return `<path fill="${ink}" fill-rule="evenodd" d="${rr(0, 0, TILE, TILE, RAD)}${t(R_MARK.bowl)}${t(R_MARK.slot)}${t(R_MARK.leg)}"/>`;
}

/** Scale+translate an absolute path made of M/H/V/L/A/Z commands. */
function transformPath(d: string, s: number, tx: number, ty: number): string {
  const toks = d.match(/[MHVLAZ]|-?\d*\.?\d+/g)!;
  let o = "";
  let i = 0;
  let cmd = "";
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[MHVLAZ]/.test(toks[i]!)) cmd = toks[i++]!;
    switch (cmd) {
      case "M": case "L": o += `${cmd}${n(num() * s + tx)} ${n(num() * s + ty)}`; break;
      case "H": o += `H${n(num() * s + tx)}`; break;
      case "V": o += `V${n(num() * s + ty)}`; break;
      case "A": {
        const rx = num() * s, ry = num() * s, rot = num(), la = num(), sw = num();
        o += `A${n(rx)} ${n(ry)} ${rot} ${la} ${sw} ${n(num() * s + tx)} ${n(num() * s + ty)}`;
        break;
      }
      case "Z": o += "Z"; break;
      default: throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return o;
}

// ─── Files ────────────────────────────────────────────────────────────────────────────────
function svg(w: number, h: number, title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}" role="img" aria-label="${title}">` +
    `<title>${title}</title>${body}</svg>\n`
  );
}
function write(name: string, content: string) {
  writeFileSync(resolve(out, name), content);
  console.log(`brand/${name}`);
}

const MARK_BOX = TILE + SHADOW;

// Mark
write("relay-mark.svg", svg(MARK_BOX, MARK_BOX, "Relay", tile({ shadow: true, fill: YELLOW, ink: INK, slot: PINK })));
write("relay-mark-flat.svg", svg(TILE, TILE, "Relay", tile({ shadow: false, fill: YELLOW, ink: INK, slot: PINK })));
write("relay-mark-black.svg", svg(TILE, TILE, "Relay", knockoutTile(INK)));
write("relay-mark-white.svg", svg(TILE, TILE, "Relay", knockoutTile(WHITE)));

// Favicon: no shadow, heavier border and a larger R so it holds at 16px.
{
  const S = 64, B = 5, RD = 14, sc = 0.39;
  const { tx, ty } = rInTile(0, 0, S, sc, R_MARK.width);
  const body =
    `<path fill="${INK}" d="${rr(0, 0, S, S, RD)}"/>` +
    `<path fill="${YELLOW}" d="${rr(B, B, S - 2 * B, S - 2 * B, RD - B)}"/>` +
    `<path fill="${INK}" fill-rule="evenodd" d="${transformPath(R_MARK.bowl, sc, tx, ty)}${transformPath(R_MARK.slot, sc, tx, ty)}${transformPath(R_MARK.leg, sc, tx, ty)}"/>`;
  write("relay-favicon.svg", svg(S, S, "Relay", body));
}

// Wordmark, with padding equal to nothing: the viewBox is the ink box.
write("relay-wordmark.svg", svg(WORD_W, WORD_H, "Relay", wordmark(INK, PINK)));
write("relay-wordmark-black.svg", svg(WORD_W, WORD_H, "Relay", wordmark(INK, null)));
write("relay-wordmark-white.svg", svg(WORD_W, WORD_H, "Relay", wordmark(WHITE, null)));
write("relay-wordmark-cream.svg", svg(WORD_W, WORD_H, "Relay", wordmark(CREAM, PINK)));

// Lockup: the wordmark's cap height matches the tile's R, baselines aligned.
function lockup(tileBody: string, word: string, withShadow: boolean): string {
  const { ty } = rInTile(0, 0, TILE, R_SCALE, R_MARK.width);
  const ws = R_CAP / 100;
  const gap = 26;
  const wx = TILE + (withShadow ? SHADOW : 0) + gap;
  const w = wx + WORD_W * ws;
  const h = Math.max(withShadow ? MARK_BOX : TILE, ty + WORD_H * ws);
  return svg(w, h, "Relay", tileBody + `<g transform="translate(${n(wx)} ${n(ty)}) scale(${n(ws)})">${word}</g>`);
}
write("relay-lockup.svg", lockup(tile({ shadow: true, fill: YELLOW, ink: INK, slot: PINK }), wordmark(INK, PINK), true));
write("relay-lockup-dark.svg", lockup(tile({ shadow: false, fill: YELLOW, ink: INK, slot: PINK }), wordmark(CREAM, PINK), false));
write("relay-lockup-black.svg", lockup(knockoutTile(INK), wordmark(INK, null), false));
write("relay-lockup-white.svg", lockup(knockoutTile(WHITE), wordmark(WHITE, null), false));

// The web client uses the same files: the header tile and wordmark, and the favicon.
const web = resolve(import.meta.dirname, "../apps/web");
mkdirSync(resolve(web, "public/brand"), { recursive: true });
copyFileSync(resolve(out, "relay-mark-flat.svg"), resolve(web, "public/brand/relay-mark.svg"));
copyFileSync(resolve(out, "relay-wordmark.svg"), resolve(web, "public/brand/relay-wordmark.svg"));
copyFileSync(resolve(out, "relay-favicon.svg"), resolve(web, "app/icon.svg"));
console.log("apps/web/public/brand/{relay-mark,relay-wordmark}.svg, apps/web/app/icon.svg");
