# Working Papers — visual identity for greghlewis.com

This folder is the source of truth for how every page on greghlewis.com looks, reads and moves.
It was designed with Greg in an iterative design canvas (claude.ai, "Bond Yields — Direction Studies") and is ready to implement.

Files here:

| File | What it is |
|---|---|
| `README.md` | The spec: principles, anatomy, colour, controls, motion, accessibility, rollout, QA. Read all of it before building. |
| `tokens.css` | Drop-in CSS: tokens, rules, selectors, links, fields, tooltips, motion keyframes. Import once from `src/app/globals.css`. |
| `palettes.json` | Every ink: per-paper pairs, highlighter tints, football position inks, data inks. |
| `components.reference.tsx` | Reference React implementations of the signature controls (adapt; not drop-in). |
| `screens/` | Rendered reference screenshots of every paper and the Index as designed, plus frame strips of the swipe, tooltip and circle motion. `K1-BondYields-option1.png` is the most current page (circle links, "Want more?" footer); other paper screenshots still show "New papers by email", which is superseded. Index thumbnails are older captures: generate real ones from the built pages. |

> The stack is Next.js 16 + React 19 + Tailwind 4. Per `AGENTS.md`, read `node_modules/next/dist/docs/` before writing Next code.

---

## 1. The idea

Each project is a **working paper**: *Greg Lewis — Working Papers*. Pages feel like a quietly printed research paper (warm paper, graphite text, two printed inks, halftone, overprint) and the **interactions feel precise and alive** (ink that draws itself, tooltips that grow, a pen that circles links). **That contrast is the identity.** Old-fashioned, low-contrast page; futuristic, soft-touch interactions.

The landing page is the **Index of papers**.

## 2. Standing principles (Greg's rules — apply everywhere)

1. **Fewer words.** The reader explores to learn: interactivity and progressive reveal. No instruction text when the graphic explains itself ("Hover to…", "Click a…"), no headings that are notes to the designer, no reflexive disclaimers ("An explainer, not advice").
2. **Open with a personal note**, not mechanics. Example (Bond Yields): *"Bond yields have been in the news a lot lately, but few understand the forces driving the high rates. This exploration seeks to make those forces a bit clearer."*
3. **Never use words where a custom visual could explain it.** The reader's ease beats build effort.
4. **A big number must communicate something.** On a history explainer, the history leads.
5. **Sources without clutter.** Sources live in the caption under each chart and in the footer. Never a sources wall.
6. **Captions go under the chart**: bold caption title, legend swatches, then `Data: <link>`. **No "Exhibit N" numbering.**
7. **Space-efficient callouts and controls.** Option groups sit **beside the section header**, right-aligned.
8. **Quiet endings.** Footer = Paper / Author / Revised / Data, plus `How it was built →` and `Want more? →` (email sign-up).
9. **Texture stays texture.** The faint rosette is background only (4–5% opacity), never a logo or seal.
10. **Keep each project's signature interaction** when restyling (e.g. Career Paths' plinko board must survive, reprinted in this style).
11. **Banned looks** (read as generic / AI-default): black filled segmented controls, outlined pill chips, plain graphite section rules, monospace "typewriter" fonts, gradients, glows, drop shadows, tinted card panels, rounded SaaS cards.

## 3. Page anatomy (desktop, 1200px design width)

```
┌ masthead ─ "Greg Lewis" 700 · "Working Papers" #5b5d63 ………… "No. 12"  "Index of papers →" ┐
├ dotted rule (ink A) ──────────────────────────────────────────────────────────────────────┤
│                     OVERPRINTED TITLE (centered, 92px)                                    │
│        italic personal note, centered, 16px, #5b5d63, max 780px (≈2 lines)                │
├ dotted rule ──────────────────────────────────────────────────────────────────────────────┤
│  Section title (28px/600)                               [ swipe selector options ]        │
│  chart / interactive ……………………………………………………………………… side panel (optional)            │
│  Caption title · legend · legend · Data: Source link                                      │
├ dotted rule ──────────────────────────────────────────────────────────────────────────────┤
│  … more sections …                                                                        │
├ dotted rule ──────────────────────────────────────────────────────────────────────────────┤
│  Paper No.12 · Author Greg Lewis · Revised 15 Oct 2026 · Data FRED      How it was built → Want more? → │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- Page padding 34px top, 64px sides, 48px bottom; content max width 1072px.
- Hero section: padding 84px top / 72px bottom. Sections separated by ~96px with a dotted rule; ~30px from rule to section header.
- Masthead: 17px. Right side 14px/500: paper number in #5b5d63, `Index of papers →` (circle link).
- Title: Instrument Sans 600, 92px (74px for long titles, ~44px on the Index rows), line-height .92, letter-spacing −0.045em, `color: var(--a); text-shadow: 4px 3px 0 var(--b)` (the **overprint**; 3px 2px on the Index).
- Faint rosette: an SVG of 18 rotated ellipses (rx 190, ry 62, every 10°) + 3 circles, stroke ink A 0.6, opacity .05, absolutely positioned behind the hero, `pointer-events:none`. Decorative only (`aria-hidden`).
- Callouts: leader lines (1.5px graphite) with a 15px/600 label + 13px/500 #5b5d63 sub-label; put a paper-colored background behind labels that cross data. Dimension lines (with 9px arrowheads) for measured gaps.
- Footer: 11.5px/500 #7a7c82 field labels over 13px values; right: the two circle links.
- **Mobile** (not yet designed — implement sensibly): single column, 16–20px gutters, title scales with `clamp(44px, 9vw, 92px)`, selectors wrap under the section header, side panels drop below charts, tooltips become tap-to-open and anchor inside the viewport. Keep the dotted rules, overprint and motion.
- **Light only.** Working Papers is always on paper; do not apply the site's dark-mode palette to these pages.

## 4. Type

- **Instrument Sans only** (Google Fonts, variable: wdth 75–100, wght 400–700, with italics). Load with `next/font/google` (`Instrument_Sans`), expose as `--font-wp`.
- Tabular figures for every number (`font-variant-numeric: tabular-nums`).
- Scale: title 92 / section 28 / panel title 28 / big number 42 (700, −0.045em) / body 16 (line-height 1.5) / UI 14.5 / label 12.5–13 / axis 12.
- Exception: chess glyphs use `Noto Sans Symbols 2`.
- No monospace anywhere in the design.

## 5. Colour

### 5.1 Constants

| Token | Value | Use |
|---|---|---|
| `--wp-paper` | `#f3f2ee` | page, tooltip and panel backgrounds |
| `--wp-ink` | `#1f2023` | graphite text, hairlines, chart frames |
| `--wp-label` | `#5b5d63` | labels, unselected options, notes |
| `--wp-quiet` | `#7a7c82` | placeholders, footer field names |
| `--wp-footer` | `#3a3c42` | footer values and links |
| `--wp-hair` | `#cfcdc6` | light dividers inside tables/lists |

### 5.2 Per-paper inks (two inks per paper)

Every paper sets three CSS variables on its root: `--a` (ink A: title, dotted rules, data), `--b` (ink B: overprint offset, link underline), `--hl` (the highlighter: ink B, screened lighter only when needed so graphite text on it stays ≥ 7.5:1).

| Paper (route) | Ink A `--a` | Ink B `--b` | Highlighter `--hl` | Data notes |
|---|---|---|---|---|
| No. 12 Intro to Bond Yields (`bond-yields`) | teal `#00707a` | sunflower `#ffb20f` | `#ffb20f` | 10-year = ink-A halftone; Fed funds = ink-B flat |
| No. 11 Chess Coach (`chess-coach`) | forest `#24583f` | coral `#ff6f7d` | `#fb9da5` | dark squares = forest halftone; selected square = coral |
| No. 09 Should You Join a Startup? (`career-paths`) | indigo `#343a8c` | orange `#ff6a2b` | `#fb9a6f` | paths: startup orange, corporate indigo, consulting teal `#00707a` |
| No. 08 A Draft Board for the Casual Fan (`draft-sheet`) | forest `#24583f` | sunflower `#ffb20f` | `#ffb20f` | football position inks (5.3) |
| No. 06 Glass Box RAG (`glass-box-rag`) | indigo `#343a8c` | orange `#e8590c` | `#ed9e72` | precedent = indigo, AI-era = orange |
| No. 04 Religious Voices (`religious-voices`) | burgundy `#7c2335` | sky `#5fb0e5` | `#75bae6` | dots burgundy, multiply |
| No. 03 Two-Minute Drill (`two-minute-drill`) | graphite `#2b2c30` | orange `#ff6a2b` | `#fb9a6f` | team colours for teams only |
| No. 02 NFL Prospect Comparables (`nfl-prospect-comparables`) | graphite `#2b2c30` | coral `#ff6f7d` | `#fb9da5` | football position inks |
| Index of papers (`/`) | graphite `#1f2023` | sunflower `#ffb20f` | `#ffb20f` | each row uses its paper's pair |

Paper numbers are placeholders; keep them stable once published. For projects not listed (playbook, scale-or-sell, emba-roi-analysis, adventureworks-chat) pick an unused pair from 5.4 and add it to `palettes.json`.

### 5.3 Shared football position inks

QB indigo `#343a8c` · TE teal `#00707a` · WR orange `#e8590c` · RB sky `#5fb0e5` · K/DST sunflower `#ffb20f`. They sit at distinct lightness, so they separate in greyscale. Text on QB/TE is paper; on WR/RB/K/DST is graphite.

### 5.4 The palette library (ink A / ink B / highlighter)

Teal & Sunflower `#00707a / #ffb20f / #ffb20f` · Graphite & Orange `#2b2c30 / #ff6a2b / #fb9a6f` · Forest & Coral `#24583f / #ff6f7d / #fb9da5` · Indigo & Peach `#343a8c / #f59b74 / #f59b74` · Burgundy & Sky `#7c2335 / #5fb0e5 / #75bae6` · Blue & Red `#2236c4 / #f15060 / #f299a0` · Indigo & Orange `#343a8c / #e8590c / #ed9e72` · Forest & Sunflower `#24583f / #ffb20f / #ffb20f`.

### 5.5 Colour rules

- **Ink is only ever printed**: flat, halftone (radial-gradient dot screens), screen tint, or multiply overprint. No gradients, glows, shadows or tinted panels.
- **A light ink never carries small text** (no sunflower/sky/coral text). Light inks may sit *behind* graphite text (the highlighter).
- **Scaling categories**: 5 unordered → 5 inks at distinct lightness; 5 ordered → one ink at five strengths (sparse halftone, medium halftone, dense halftone, solid, solid with an inset paper rule); more than 5 → position plus one ink, labelled in place. **At most two inks ever overlap.**
- Halftone recipe: `background-image: radial-gradient(<ink> 1.4px, transparent 1.7px); background-size: 5px 5px` (vary dot radius for strength). In SVG use a `<pattern>` of circles.
- Overlaps use `mix-blend-mode: multiply`.

## 6. Controls

| Control | Look | Never |
|---|---|---|
| **Single-select options** (tabs, filters, modes) | **Ink swipe**: plain text options in a row (14.5px/500, #5b5d63); the selected one is graphite 600 on a slightly tilted, ragged block of `--hl` (multiply). Each option has its own tilt: −1.5°, 1°, −0.8°, 1.4°, −1.2°, 0.8° (cycle). Reserve bold width so nothing shifts. | black boxes, pills, outlined chips |
| **Multi-select toggles** | Same swipe per option; `aria-pressed`. | checkboxes styled as chips |
| **Section separators** | **Halftone dotted rule** in ink A: 4px tall, `radial-gradient(var(--a) 1.4px, transparent 1.7px)` at `6px 4px`. Masthead, between sections, above footer. | plain 1–1.5px graphite rules (tables and chart frames may keep hairlines) |
| **Arrow links** (`… →`) | **Hand-drawn circle** draws around the link on hover (ink A pen line), the arrow nudges 3px right. | underline-only hover |
| **Inline links** (sources, citations) | 2px ink-B underline that **grows into a full highlighter** on hover. | blue links, default underline |
| **Actions** (Ask, Start the game, Take BUF, dropdown triggers) | Text button with arrow, 600; a swipe draws behind on hover. Primary action in ink A. | filled buttons |
| **Text inputs** | No box: dotted ink-A underline; a solid 2px ink-A line draws across on hover/focus. Placeholder #7a7c82. | bordered input boxes |
| **Suggested prompts** | Graphite text with a faint dotted ink-A underline; swipe on hover. | bordered chips |
| **Tooltips** | Paper card, 1.5px graphite hairline, 9×12px padding, bold 15px title with an ink-B underline that draws in, 12.5px #5b5d63 details. **Grows from its anchor.** | instant tooltips, dark tooltips, shadows |
| **Selection markers** (balloons, dots, squares) | Fill floods with ink from the centre; hover scales 1.14 with a soft overshoot. | instant colour swaps |

## 7. Motion & interactivity standards

Two easing curves only:

- `--wp-draw: cubic-bezier(.55,.05,.25,1)` — anything that draws or wipes (swipes, underlines, circles, re-ink).
- `--wp-grow: cubic-bezier(.2,.8,.2,1)` — anything that grows or opens (tooltips, thumbnails). Small elastic pops use `cubic-bezier(.3,1.5,.5,1)`.

| Interaction | Behaviour | Timing |
|---|---|---|
| Select an option | Highlighter **draws left → right** across the new option (`clip-path: inset(0 100% 0 0)` → `inset(0)`); the previous one lifts (fade). | draw 520ms, 90ms delay; lift 200ms |
| Hover an inline link | Underline rises into a full highlighter. | 320ms |
| Hover an arrow link | Hand-drawn circle traces round (start top-left, full loop, slight overshoot; `stroke-dashoffset` 1 → 0 with `pathLength="1"`); faster un-draw on leave; arrow nudges 3px. | draw 640ms, undraw 260ms |
| Hover/focus a data mark | **Tooltip grows** from the anchor (scale .4 → 1 + `clip-path: circle()` iris from the anchor point, set via `--ox/--oy`), text prints in (fade + 3px rise, 40ms stagger), title underline draws. Other categories fade back (e.g. hover a QB → all non-QBs to 18% opacity). | grow 300ms; print 260ms from 110ms; underline 460ms from 240ms; dim 260ms |
| Select a mark | Ink floods from the centre (`clip-path: circle(0)` → `circle(75%)`); linked detail panel **re-inks** with a left-to-right wipe whenever its content changes (toggle between two identical keyframe names to restart). | flood 340ms; re-ink 460ms |
| Reveal related marks | Pop in one by one (scale .2 → 1.18 → 1). | 360ms, 45ms stagger |
| Lit/dim, hover | Always transition opacity/colour; never snap. | 200–260ms |
| Index row hover | Thumbnail eases to 1.04 inside its frame; frame darkens to graphite; an ink stroke draws under the title. | 700ms / 300ms / 520ms |
| Text inputs | Solid underline draws across on hover/focus. | 460ms |

Rules:

- Motion is **soft, short and purposeful**: it confirms an action or reveals information; nothing loops, bounces for attention or auto-plays.
- Don't duplicate information: if a page already has a detail panel that updates on hover (Bond Yields), it doesn't also get a floating tooltip.
- **`prefers-reduced-motion: reduce`**: all transitions/animations collapse to instant (state still changes).
- In React, keep elements mounted and change styles so CSS transitions run; mount tooltips conditionally so their entry animation plays; re-key or alternate animation names to replay a wipe.

## 8. Accessibility

- Selectors: `role="tablist"` + `role="tab"` + `aria-selected` (single) or `role="group"` + `aria-pressed` (multi); keyboard arrows move between tabs.
- Every hoverable data mark is focusable (`tabindex="0"`) with an `aria-label` that contains the tooltip's content; tooltips open on focus as well as hover. Tooltip cards are `aria-hidden` duplicates of that label or `role="tooltip"` with `aria-describedby`.
- Focus ring: `outline: 1.5px dotted #1f2023; outline-offset: 3px`.
- Contrast: graphite on paper and on every `--hl` ≥ 7.5:1; never set small text in a light ink.
- Decorative SVG (rosette, circles, rules) are `aria-hidden`.

## 9. Rollout plan for Claude Code

1. Load Instrument Sans via `next/font/google` in `src/app/layout.tsx` (`variable: "--font-wp"`).
2. Import `design/working-papers/tokens.css` from `src/app/globals.css` (after `@import "tailwindcss";`). Optionally map tokens into Tailwind's `@theme` (colors `wp-paper`, `wp-ink`, `wp-label`; font `wp`).
3. Build shared components (see `components.reference.tsx`): `PaperShell` (masthead, rosette, hero, footer), `DottedRule`, `SwipeSelect`, `CircleLink`, `InkLink`, `InkField`, `GrowTip`, `Caption`, `Callout`.
4. Restyle **Bond Yields** first (`src/app/projects/bond-yields`) using `screens/P12-BondYields.png` and `screens/K1-BondYields-option1.png` (the final controls and footer) as the visual reference. Get Greg's sign-off.
5. Roll through the other papers in the order: Chess Coach, Career Paths (restore the plinko board in print style), Two-Minute Drill, Glass Box RAG, Draft Sheet, NFL Prospect Comparables, Religious Voices; then the remaining projects with new palettes.
6. Rebuild the landing page as the **Index of papers** (`screens/Index.png`): number + date, overprinted title, italic one-line note, real chart thumbnail per row; footer with `How this site was built →` and `Want more? →`.
7. Keep every existing data pipeline, API and interaction working; this is a visual and interaction layer.

## 10. QA checklist (run per page before publishing)

- [ ] Instrument Sans only; tabular figures; no mono.
- [ ] Root sets `--a`, `--b`, `--hl` from `palettes.json`; title overprints A over B.
- [ ] Opens with a personal note (≤ 2 lines); no instruction text, no "Exhibit N", no disclaimers.
- [ ] Every chart has a caption under it with the data source link.
- [ ] Dotted rules for structure; no black boxes, pills, gradients, shadows, tinted panels.
- [ ] Every selector is the ink swipe and draws on select; arrow links circle on hover; inline links highlight on hover.
- [ ] Every tooltip grows from its anchor; dimming and selection transitions never snap.
- [ ] Keyboard: tabs, focus rings, tooltips on focus. Reduced motion respected.
- [ ] Footer: Paper · Author · Revised · Data + `How it was built →` + `Want more? →`.
- [ ] Mobile: no horizontal scroll; selectors wrap; tooltips stay on screen.
- [ ] Project's signature interaction still works.
