# Frontend Style Guide — "Bareng" system

Extracted from [`PugarHuda/bareng`](https://github.com/PugarHuda/bareng) · live at [bareng-jade.vercel.app](https://bareng-jade.vercel.app) (pitch deck at `/deck`).

**The one-line description:** soft neobrutalism for a group wallet. A warm cream ground, near-black 3px outlines on everything, hard un-blurred offset shadows, eight flat candy-bright fills, chunky system-font type at weight 900, rounded corners throughout, and buttons that physically sink into their own shadow. The visual grammar is the stock neobrutalism kit; what makes it *this* product is the content: arisan, patungan, @handles, and a rupiah line under every dollar balance.

**Four things to know before reading on:**

1. **The whole system is 116 lines.** `app/globals.css` holds twelve colour tokens and seven classes (`.neo`, `.neo-sm`, `.neo-flat`, `.neo-btn`, `.neo-input`, `.neo-tag`, `.neo-label`) plus one keyframe. Everything else is Tailwind utilities composed per component.
2. **No typeface is loaded.** No `next/font`, no font link. The type is Tailwind's default `font-sans` (the platform's system UI face) pushed to weight 900. Zero font bytes, and the display looks different on every OS.
3. **The custom classes are unlayered, so they beat utilities.** Tailwind v4 compiles utilities into `@layer utilities`; anything written after `@import "tailwindcss"` without a layer outranks them regardless of specificity. This has real consequences in the codebase (§1).
4. **The landing is strict; the app pages drift.** The landing and deck follow the system closely. The dashboard mixes in Tailwind's default palette, 1px borders and unbordered blocks, and several of those combinations fail contrast. §10 lists them with measured ratios, so you can clone the system and not the drift.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind v4 via `@tailwindcss/postcss`. Tokens are plain `:root` custom properties (not `@theme`), applied as arbitrary values: `bg-[var(--yellow)]`, `text-[var(--ink)]/70` |
| Fonts | None loaded. Tailwind's default `font-sans` and `font-mono` stacks |
| Icons | Emoji. No icon library |
| Motion | One keyframe (`neo-rise`) and 80ms press transitions |
| Surfaces | `/` landing · `/deck` keyboard-driven pitch deck · `/app` plus six sibling routes in a `(dash)` group sharing one sidebar shell · generated OG image |

### Tokens outside `@theme`

Because the colours live in `:root` rather than `@theme`, Tailwind generates no `bg-yellow` utility; every use is written `bg-[var(--yellow)]`. Opacity modifiers still work on arbitrary values: `text-[var(--ink)]/80` compiles to `color-mix(in oklab, var(--ink) 80%, transparent)`. Verbose but explicit. Declaring them in `@theme` as `--color-yellow` etc. would give you `bg-yellow` and keep the raw variable available.

### The layering rule

```css
@import "tailwindcss";            /* utilities compile into @layer utilities */

.neo-btn { border: 3px solid var(--line); ... }   /* unlayered: beats every utility */
```

Three consequences you can see in the code:

- **Dead utilities.** Six elements pair `.neo-btn` with `disabled:opacity-50` or `disabled:opacity-40`. Those never apply; the unlayered `.neo-btn:disabled { opacity: .55 }` wins.
- **A vanishing error cue.** The invalid-payee state is `ring-1 ring-red-500/60`, and Tailwind rings are box-shadows. The unlayered `.neo-input:focus { box-shadow: 3px 3px 0 0 var(--ink) }` replaces it, so the red ring disappears exactly while you're typing into the field it's warning about.
- **The global focus ring survives `outline-none`.** Good outcome, same mechanism.

If you want utilities to be able to override the neo classes, wrap them in `@layer components { ... }`. If you want the classes to be unbreakable, leave them unlayered, but do it on purpose.

---

## 2. Colour tokens

```css
:root {
  --bg:     #fdf6e3;   /* warm cream ground */
  --panel:  #ffffff;   /* raised surface */
  --ink:    #111111;   /* near-black */
  --line:   #111111;   /* borders are always ink */

  /* accents: fills only */
  --yellow: #ffd93d;
  --pink:   #ff8fce;
  --blue:   #4d9dff;
  --green:  #4ade80;
  --purple: #b799ff;
  --orange: #ff9f43;
  --red:    #ff6b6b;   /* defined, never used */
  --lime:   #d3f26a;
}
```

### The rules the landing follows

**Text on an accent is always ink, never white.** This single rule is what makes eight bright fills readable. Measured:

| Fill | `#111` on it |
|---|---|
| cream `--bg` | 17.51 : 1 |
| white `--panel` | 18.88 : 1 |
| lime | 15.00 : 1 |
| yellow | 13.71 : 1 |
| green | 10.84 : 1 |
| orange | 9.25 : 1 |
| pink | 9.06 : 1 |
| purple | 8.11 : 1 |
| blue | 6.82 : 1 |
| red | 6.80 : 1 |

The weakest pairing still clears AA by a wide margin.

**Accents are fills, never text or borders.** Borders are always `--line`. Colour enters the page as the background of a bordered object.

**Hierarchy comes from ink opacity, not a grey token.** `/80` for lead copy (9.79:1 on cream), `/70` for secondary (6.83:1), `/60` for metadata (4.82:1, the floor). On fills, `black/70` bottoms out at 4.89:1 on blue.

### Usage weight

Blue is the most-used accent (21 uses) and is the app's primary-action colour: Pay, Continue with Google, Next. Yellow (17) is the brand colour: the logo tile and the landing's main CTA. Green (19) marks proof and settlement. Pink, purple, orange and lime are supporting fills.

### Colour is rotation, not meaning

Every card, proof and nav item gets an accent, but the assignment isn't a fixed map. Arisan is pink on the landing and purple in the app nav; Receive is the reverse. The proof strip and feature grid assign colours independently. There is one consistent use: in the app shell each route owns a colour that fills its nav button only when active.

That suits a playful aesthetic; it just means colour carries mood here, not information. If you want colour to encode something, fix one map and use it everywhere.

`--red` is defined and used zero times. The app's error states reach for Tailwind's red scale instead, and that's where most of the contrast failures in §10 come from. Note that `--red` doesn't work as text either (2.57:1 on cream); the system-consistent error is a red *fill* with ink text, at 6.80:1.

---

## 3. Typography

### No font, just weight

`font-sans` resolves to `ui-sans-serif, system-ui, sans-serif` plus the emoji fonts; `font-mono` to `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, …`. So the display renders as SF Pro on Apple devices, Segoe UI on Windows, Roboto on Android, and whatever the heaviest installed weight is elsewhere.

The personality is carried by weight: headings at `font-black` (900), buttons, labels and tags at 800, body copy between 500 and 700.

### Scale in use

Tailwind v4 default sizes; `tracking-tight` is -0.025em.

| Role | Classes | Size |
|---|---|---|
| Landing h1 | `text-5xl sm:text-6xl font-black leading-[0.95] tracking-tight` | 48 → 60px |
| Deck title | `text-6xl sm:text-7xl font-black leading-[1.15] tracking-tight` | 60 → 72px |
| Deck h2 | `text-4xl sm:text-5xl font-black leading-[0.98] tracking-tight` | 36 → 48px |
| Section h2 | `text-2xl font-black tracking-tight` | 24px |
| Pot balance | `text-4xl font-black` | 36px |
| Card title | `text-lg font-black` | 18px |
| Lead | `text-lg font-medium text-[var(--ink)]/80` | 18px |
| Rows, body | `text-sm` | 14px |
| Meta | `text-xs`, `text-[10px]` | 12 / 10px |
| Hashes | `font-mono text-xs font-bold text-[var(--ink)]/60` | 12px |

The chunk is concentrated on the landing and deck, which carry 24 of the codebase's 32 `font-black`s. The app pages run smaller and lighter: in the `(dash)` routes, `text-xs` and `text-sm` appear 96 times, and `font-semibold` outnumbers `font-black` 27 to 6.

### Labels and tags

```css
.neo-label { text-transform: uppercase; font-weight: 800; letter-spacing: .04em; }
.neo-tag   { border: 2px solid var(--line); font-weight: 800;
             text-transform: uppercase; letter-spacing: .02em; }
```

`.neo-tag` is the chip, with a border one step lighter (2px) than objects (3px). It carries chain names on proof cards, the "works across" chain list, the hero event chip, and the weekly cap on member rows.

### The highlighter

One phrase per headline gets a flat accent block behind it:

```html
<h1>Money,<br><span class="bg-[var(--pink)] px-1 [box-decoration-break:clone]">together.</span></h1>
```

`box-decoration-break: clone` repeats the horizontal padding on every line when the phrase wraps, so a two-line highlight reads as two marker strokes rather than one broken box. It appears on nearly every headline: "proven on-chain" (green), "is" (yellow), "Seven" (green), "No member holds a key." (yellow).

### Money

Dollars first, rupiah underneath, formatted with Indonesian grouping:

```ts
const idr = (usd: number) => `Rp ${Math.round(usd * USD_TO_IDR).toLocaleString("id-ID")}`;
// "Rp 6.846.000"
```

A small bold line under every pot balance. It's the most place-specific detail in the UI.

---

## 4. Surface grammar

### Three lift levels

```css
.neo      { border: 3px solid var(--line); box-shadow: 5px 5px 0 0 var(--ink); }
.neo-sm   { border: 3px solid var(--line); box-shadow: 3px 3px 0 0 var(--ink); }
.neo-flat { border: 3px solid var(--line); }
```

`.neo` (5px) for primary objects: cards, bands, the sidebar. `.neo-sm` (3px) for rows, the nav bar, chips and app sections. `.neo-flat` for anything nested inside another bordered object: the logo tile, the emoji tiles on feature cards, partner name blocks in the deck. Nested objects go flat so shadows never stack.

### The press, in two stages

```css
.neo-btn {
  border: 3px solid var(--line);
  box-shadow: 4px 4px 0 0 var(--ink);
  font-weight: 800;
  transition: transform .08s ease, box-shadow .08s ease;
}
.neo-btn:hover:not(:disabled)  { transform: translate(2px, 2px); box-shadow: 2px 2px 0 0 var(--ink); }
.neo-btn:active:not(:disabled) { transform: translate(4px, 4px); box-shadow: 0 0 0 0 var(--ink); }
.neo-btn:disabled              { opacity: .55; cursor: not-allowed; }
```

Hover sinks the face halfway into the shadow; press sinks it the rest of the way. Translate plus remaining shadow always sums to 4px, so the shadow's outer edge never moves. The button drops into a hole that stays put. At 80ms it reads as mechanical rather than animated.

`.neo-btn` isn't only for `<button>`. Whole proof cards (links), sidebar nav items, mobile nav pills and the selected category chip all use it, so anything you can click behaves the same way.

### Inputs rise where buttons sink

```css
.neo-input       { border: 3px solid var(--line); background: var(--panel);
                   color: var(--ink); font-weight: 600; }
.neo-input:focus { outline: none; box-shadow: 3px 3px 0 0 var(--ink); }
```

Focus makes a hard shadow appear, so an active field lifts off the page: the inverse of the button. Range inputs use `accent-black`.

### Radius: soft neobrutalism

Rounded corners everywhere, stepped by container size (Tailwind v4 values):

| Radius | Class | Used for |
|---|---|---|
| 4px | `rounded` | tags, chips |
| 6px | `rounded-md` | hero event chip, deck logo |
| 8px | `rounded-lg` | buttons, logo tile, icon tiles |
| 12px | `rounded-xl` | nav bar, proof and feature cards, list rows, app inputs |
| 16px | `rounded-2xl` | hero pot card, CTA band, partner band, app sections, sidebar |
| pill | `rounded-full` | category chips, progress bars, deck dots |

Outer containers take the larger radius and their contents the smaller one.

### Rotation, used twice

`rotate-1` on the hero pot card, `-rotate-1` on the closing CTA band. Two tilted objects on the whole landing, in opposite directions: enough to feel hand-placed, few enough to stay calm.

---

## 5. Layout

### Landing

`mx-auto max-w-5xl px-4 py-5 sm:px-6` (1024px). Sections sit `mt-14` apart. The nav is a bordered floating bar (`neo-sm rounded-xl bg-[var(--panel)]`) inside the container, not a full-width header. Hero is `md:grid-cols-[1.3fr_1fr]`, copy-weighted. Card grids are `sm:grid-cols-2 lg:grid-cols-3 gap-4`. The footer is opened by a `border-t-[3px]` rule, and its GitHub link uses a 3px underline (`decoration-[3px]`) to match the border weight.

### App shell (`app/(dash)/layout.tsx`)

- **Desktop (`md`+):** a `max-w-6xl` wrapper and a 224px (`w-56`) sticky sidebar at `top-6`, `h-[calc(100dvh-3rem)]`, which is itself a `.neo` panel. Nav items are stacked `.neo-btn`s with an emoji (`aria-hidden`) and label; the active route fills with its colour and carries `aria-current="page"`.
- **Mobile:** a sticky top bar on the cream ground with a 3px bottom rule, the wordmark, and a horizontally scrolling row of `.neo-btn` pills. Emoji are dropped.
- **Content:** the overview uses a `max-w-3xl` column (`gap-5 p-5`), splitting into two columns at `md`: pot and members left, spend and activity right.

### Deck

Full viewport. Top chrome: logo, fullscreen toggle, a `tabular-nums` "n / N" counter. A `max-w-4xl` slide area. Bottom row: Prev, dots, Next. The demo video breaks out of the slide width with `mx-[calc(50%-45vw)] w-[90vw] max-w-[1240px]`, and the source comment gives the reason: at `max-w-4xl` on a 1080p projector the recorded UI downscales past legibility.

Breakpoints are Tailwind defaults: `sm` 640, `md` 768, `lg` 1024.

---

## 6. Components

**Logo tile.** `neo-flat grid h-9 w-9 place-items-center rounded-lg bg-[var(--yellow)] font-black` with a "B", beside a `text-xl font-black tracking-tight` wordmark.

**Hero pot card.** The hero's right column shows the product state rather than a slogan graphic: a tilted white `.neo` card with a `neo-label` ("Group pot · @lunchsquad"), a 36px black balance, the rupiah line, and three member rows. Each row is a `neo-sm` strip filled with a different accent, handle on the left, a white `neo-tag` cap ("$100/wk") on the right.

**Proof cards.** Linked `.neo-btn` cards on white: an accent chain chip, the label in black, the short hash in mono with ↗. The whole card presses.

**Feature cards.** `.neo rounded-xl` filled with an accent, a white 44px `neo-flat` tile holding an emoji, title in `text-lg font-black`, description in `text-sm font-medium text-black/80`.

**Bands.** The partner band is a purple `.neo rounded-2xl p-6` with a row of white `neo-sm` name chips and a caveat paragraph. The CTA band is a yellow `.neo -rotate-1 rounded-2xl p-8`, centred, with one white `.neo-btn`.

**App section.** `rounded-2xl neo-sm p-4`, usually with no background so the cream shows inside the border; rows inside it sit on white.

**Primary action with a live label.** Full-width `rounded-xl neo-btn bg-[var(--blue)] py-3 font-semibold`, disabled to `bg-[var(--panel)] text-black/60`. The label is the validation message:

```tsx
{busy ? "Paying…"
  : !receiver ? "Enter a valid payee"
  : ok ? `Pay $${amount}`
  : amount > left ? "Over limit"
  : "Not enough balance"}
```

When the action can't happen, the button says why. No separate error line needed.

**Category chips.** A `role="group" aria-label="Category"` of `rounded-full` buttons with `aria-pressed`. Selected becomes a blue `.neo-btn`; unselected is a flat white pill.

**Receipts.** `neo-sm bg-[var(--panel)] rounded-xl p-2.5 text-xs` rows: `@from → to · memo`, the tx hash as a mono link with a dotted underline that turns solid on hover, amount right-aligned over a pill category. The app has its own small text convention here: handles in `text-blue-700 font-bold`, tx links in `text-green-700` mono.

**"Where the pot goes" bars.** Label, a `h-2.5 rounded-full` white track with a blue fill at `max(4%, share)` so tiny categories stay visible, amount right-aligned in `tabular-nums`.

**QR.** Generated to a data URL, rendered only after a toggle, on a white rounded block, with `[image-rendering:pixelated]` so the modules stay crisp at any scale.

**Diagram boxes in SVG.** The deck's architecture diagram carries the hard shadow into SVG by drawing it as a second rect:

```tsx
const DBox = ({ x, y, w, h, fill }) => (
  <>
    <rect x={x + 6} y={y + 6} width={w} height={h} rx="12" fill="#111" />
    <rect x={x} y={y} width={w} height={h} rx="12" fill={fill} stroke="#111" strokeWidth="3" />
  </>
);
```

The whole diagram is `role="img"` with an `aria-label` that narrates the flow.

**Error and 404.** Centred: a large emoji (🤝 / 🧭) over one `.neo rounded-2xl` card in yellow or pink, a headline, one sentence, and two `.neo-btn` exits.

**OG image.** Generated with `next/og` at 1200×630 in the same grammar, scaled up: 4px borders, 10px shadows, and "together." as a bordered, shadowed pink sticker rather than a flat highlight.

---

## 7. Motion

```css
@keyframes neo-rise {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
.neo-rise        { animation: neo-rise .55s cubic-bezier(.2,.7,.3,1) both; }
.neo-stagger > * { animation: neo-rise .55s cubic-bezier(.2,.7,.3,1) both; }
.neo-stagger > *:nth-child(2) { animation-delay: .06s; }
/* … 60ms steps through :nth-child(6) at .30s */
```

Applied to the hero copy, the hero pot card (0.12s inline delay), the proof and feature grids (staggered), and each deck slide, which is remounted with `key={i}` so the rise replays on every change. Presses take 80ms. Nothing else moves.

Two things to fix if you copy it:

- **The staggers run unseen.** Both staggered grids sit below the fold on most screens, and CSS animations start on load, so the stagger usually finishes before anyone scrolls to it. Trigger it on intersection or drop it.
- **Reduced motion zeroes duration but not delay.** With `fill-mode: both`, staggered items stay invisible for their delay (up to 300ms) and then snap in. Add `animation-delay: 0s !important` to the reduced-motion block.

---

## 8. Accessibility: what's there

- **One global focus ring:** `:where(a, button, input, select, [tabindex]):focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }`. `:where` keeps it at zero specificity, and being unlayered it still beats Tailwind's `outline-none`. `.neo-input` swaps it for the hard-shadow focus. `textarea` isn't in the selector; add it if you use one.
- A blanket `prefers-reduced-motion` rule (with the delay gap above).
- `aria-current="page"` on the active nav item, `aria-hidden` on nav emoji, `aria-pressed` on category chips inside a labelled group, `aria-label` on the range and memo inputs, the QR toggle, fullscreen and slide controls, `alt` on the QR image, and a described `role="img"` on the SVG diagram.
- A keyboard-driven deck: ←/→, space, PageUp/PageDown.
- Ink on every accent across the landing; the weakest pairing is 6.80:1.
- The split page pairs colour with words ("is owed", "owes", "settled"), so balance state doesn't rest on colour alone.
- The README reports a 38-case Playwright QA sweep including accessibility and responsive checks.

---

## 9. Copy voice

- **A two-word thesis, highlight on the second:** "Money, *together.*"
- **Local vocabulary is the brand:** *bareng* (together), *gotong royong*, *arisan*, *patungan*; handles like @budi, @sari, @dewi, @lunchsquad; rupiah under dollars.
- **Proof over claim:** "Not a mockup — proven on-chain", "Click any to verify", and a caveat printed on the landing itself that per-member caps are owner-signed and app-side: "we don't overclaim."
- **Features as plain mechanics:** "Log who fronted what; it nets down to the fewest transfers."
- **Errors reassure first:** "Something hiccuped. The pot's fine — this screen just tripped." / "That page isn't here. Maybe the handle moved."
- **Buttons name the outcome and turn into the reason when blocked:** "Pay $25" becomes "Over limit".
- **Arrows as wayfinding:** → moves forward in the product; ↗ goes out to an explorer, GitHub, or the deck.
- **Emoji carry tone and double as icons:** 🫙 🔒 🎲 🧾 🕶️ 🤖, and 🎉 on "Everyone's even."

---

## 10. Where the implementation drifts from its own system

Clone the tokens and classes, not these. Contrast measured against Tailwind v4.3.1's default colours:

| Where | What | Contrast |
|---|---|---|
| Sign-in error (`/app`) | `text-red-300` on `bg-red-900/20` over cream: a dark-theme style on a light page | **1.23 : 1** |
| Settle-up card (`/split`) | payer in `text-orange-600`, payee in `text-green-700`, both on the green fill | **2.06 : 1**, **2.84 : 1** |
| Proof banner (`/app`) | mono hash in `text-green-700` on the green fill | **2.84 : 1** |
| Demo-mode banner (`/app`) | `text-orange-700` on yellow at 12px | **3.80 : 1** |
| Admin error | `text-red-600` on cream at 12px | **4.42 : 1** |

The first row matters most: when login fails, the message explaining why is effectively invisible.

Structural drift:

- **Member rows show no selection.** Both branches of the active-state ternary are `"border-black bg-[var(--panel)]"`, so the list never shows who "Spend as @…" refers to.
- **1px borders** (`border border-black`) on banners and member rows, against the system's 3px.
- **The dashboard's pot card is unbordered and unshadowed,** while the landing's pot card is the most "neo" object on the page.
- **Plain buttons:** the pot card's "QR" and "Share link" and the email "Continue" are white rounded rectangles without `.neo-btn`.
- **The invalid-payee cue** is a 1px, 60%-opacity red ring: colour-only, thin in a 3px system, and it vanishes on focus (§1).
- **`#000` versus `#111`:** `text-black` and `border-black` resolve to `#000`, the tokens to `#111`. Visually close; pick one.
- **Three brand marks.** The favicon is an indigo-to-violet gradient square (`#6366f1 → #7c3aed`, Tailwind's indigo-500 and violet-600) with a white B, off-system entirely. The in-app mark is a bordered yellow tile. The OG image hard-codes its own near-miss hexes (`#FBF7ED`, `#FFD84D`, `#FF8FB1` against the tokens' `#fdf6e3`, `#ffd93d`, `#ff8fce`).
- **Invisible focus stops.** The deck's left and right click zones are `opacity-0` buttons, so keyboard focus can land on something you can't see. The visible Prev and Next buttons make it recoverable.

---

## 11. Build checklist

1. `globals.css`: `@import "tailwindcss"`, the twelve tokens, the seven classes. Decide the layering deliberately: unlayered if the classes must always win, `@layer components` if utilities should be able to override them.
2. Body on `--bg`, text in `--ink`. Either accept the system face at 900 or load one heavy grotesque and set it as `--font-sans`.
3. Three lift levels: `.neo` (5px) for objects, `.neo-sm` (3px) for rows and chips, `.neo-flat` for anything inside a bordered object.
4. Everything clickable (buttons, nav items, whole link cards) gets `.neo-btn` and the two-stage press.
5. Accents are fills only; text on them is ink, always. Hierarchy through ink opacity: /80, /70, /60.
6. Errors are a `--red` fill with ink text inside a `neo-sm` border, never red text.
7. Radius steps with container size: 4, 8, 12, 16px, and pills for chips and bars.
8. One highlighted phrase per headline, with `box-decoration-break: clone`.
9. Tilt at most two objects per page, 1°, in opposite directions.
10. A global 3px ink `:focus-visible` ring; hard-shadow focus on inputs.
11. Reduced motion zeroes duration *and* delay.
12. Before shipping any secondary text colour, check it on every fill it can land on.

---

## 12. What to change when reusing

| Keep | Change |
|---|---|
| Ink text on every fill: the rule that makes a rainbow palette readable | The eight accents (keep them light enough that ink clears about 6:1) |
| Three lift levels, with nested objects going flat | The offsets |
| The two-stage press with a fixed shadow edge | — the best interaction in the system |
| Inputs rising on focus while buttons sink | — |
| A button label that becomes the reason it's disabled | — |
| Radius stepped by container size | The steps, or go square for a harder brutalism |
| `box-decoration-break: clone` on highlights | How often you highlight |
| Local currency and vocabulary in the UI | Your locale's |
| One token file | Where it lives: moving it into `@theme` gets you `bg-yellow` for free |

**The idea to think hardest about:** this is the stock neobrutalism kit. Cream ground, near-black outlines, candy fills, hard offset shadows and chunky type identify a genre, not a product, and the kit is widely shared. What's specific to Bareng is its content: arisan, patungan, @handles, rupiah under dollars, receipts "everyone can see." If you reuse the grammar, the visual layer is where you still have room to be specific (the colour map, the typeface, the ornament) and it's worth spending that on something from your own product's world rather than on a second copy of the kit.

**On the missing typeface:** loading nothing is a real trade. Zero bytes and an instant first paint, but the 900-weight display changes shape per platform, and falls back to whatever the heaviest installed weight is where no black cut exists. Sensible for a hackathon; for a brand, pick a face.

**Licence:** the repo ships no licence file, so default copyright applies. This spec documents the design grammar; ask the author before lifting source files wholesale.
