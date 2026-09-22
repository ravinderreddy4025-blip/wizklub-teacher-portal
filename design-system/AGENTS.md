# AGENTS.md — WizKlub Design System (read before generating any WizKlub UI)

You are building or editing UI for **WizKlub Futurz** (an Infinity Learn product): Teachers Portal,
Parent Orientation Tracker (PMO), Kit Inventory & School Portal, Gateway, and any new WizKlub app.
Follow this file exactly. If anything here conflicts with a screenshot or your own taste, this file wins.
If this file conflicts with `frontend/wizklub-testimonials/src/styles/tokens.css`, the CSS wins. Report the mismatch.

## 0. Sources of truth (in order)

| What | Where | Use it for |
|---|---|---|
| Code tokens | `frontend/wizklub-testimonials/src/styles/tokens.css` (copy: `design-system/tokens/tokens.css`) | CSS variables to write in code |
| Machine tokens | `design-system/tokens/tokens.json` (W3C DTCG) | Programmatic lookup: every token has `$description`, `com.wizklub.css`, `com.wizklub.figma`, `resolved` hex |
| Tailwind | `design-system/tokens/tailwind.preset.js` | Tailwind apps (Inventory, School Portal) |
| Components | `design-system/components.md` | Anatomy, variants, props, tokens, code mapping per component |
| Figma | "WizKlub Design System" `ALYUYxBSYECsXW1jI0TPOC` (IDs in `design-system/figma.json`) | Visual truth; variables carry code syntax + descriptions |
| Real screens | Figma "WizKlub Admin Apps" `8q6lkq4MWJA5vJPw61gwaz` | 65 shipped screens, desktop 1440 + mobile 390 |

## 1. Golden rules (never break)

1. **Ink is navy `#02344F`** (`--text-primary`). Never pure black text.
2. **On orange, text and icons are navy** (`--on-brand`). Never white on bright orange. White is allowed only on
   `--wk-frame` (menu labels, bold/large) and on the navy promo card.
3. **Orange text on white is `#B4430F`** (`--brand`). Tangerine `#FF8C2B` (`--wk-orange`) is a *fill* only.
4. **One Primary button per view**: tangerine pill, navy 16/600 label, 3px orange bottom edge (`--shadow-brand`).
   Everything else is Secondary (white, 1px navy border) or Ghost (orange text).
5. **Everything tappable is a pill and at least 44px tall.** Inputs are *not* pills (radius 12).
6. **Cards**: white, radius 16, padding 16, `--shadow-md`, **no border**, never nested.
7. **Poppins 400/500/600 only**, using the type scale in §3. Do not invent sizes.
8. **Health RAG colours are reserved for health status** and always come with the word
   (Green / Amber / Red / Not measured). Bands are **counts of students, never averages**.
9. **Semantic tokens only.** Never hard-code hex; never use `primitive.*` in UI.
10. **Layout**: desktop (at least 1024px) = orange chrome + 256px transparent sidebar + floating white panel (radius 24);
    mobile = white page, 56px sticky top bar, 64px bottom nav (5 items max), 16px gutters.
11. **Accessibility**: AA contrast (all token pairs above are checked), visible focus ring (`--focus-ring`) on every control,
    labels above inputs, never colour alone.
12. **Personal data**: demo/mock data only in designs, screenshots and Figma. Never real student names or phone numbers.

## 2. Colour: pick by purpose

| Need | Token | CSS |
|---|---|---|
| Page background | `color.bg.page` | `var(--bg)` |
| Card / panel / input | `color.bg.surface` | `var(--surface)` |
| Desktop chrome | `color.bg.chrome` (+ `bg.chrome-dome`), menu area `bg.chrome-frame` | `var(--wk-band)` / `var(--wk-frame)` |
| Primary CTA fill | `color.action.primary` | `var(--wk-orange)` |
| Body text / headings | `color.text.primary` | `var(--text-primary)` |
| Secondary text | `color.text.secondary` | `var(--text-secondary)` |
| Links / accent text | `color.text.brand` | `var(--brand)` |
| Text on orange | `color.text.on-brand` | `var(--on-brand)` |
| Divider | `color.border.light` | `var(--border-light)` |
| Input / chip border | `color.border.control` | `var(--border-control)` |
| Success / warning / danger / info tag | `color.status.*-fg` + `*-bg` | `var(--tag-success)` … |
| Health G / A / R / N | `color.health.{green,amber,red,none}-{fg,bg,bar}` | `var(--h-g)` … |
| Icon tile | `color.tint.{orange,blue,green,purple,gold}-{bg,fg}` | `var(--tint-*)` |

## 3. Type scale (Poppins)

| Token | Size / weight / line-height | Use |
|---|---|---|
| display/welcome | 36 / 500 / 1.3 | Login "Welcome" only |
| title/page-desktop · title/page-mobile | 28 / 600 · 22 / 600 | One page title per screen (switch at 1024px) |
| title/hero | 24 / 500 | Headline inside the navy promo card |
| title/section | 18 / 500 | Section headings |
| number/stat | 28 / 600 / 1.2 | KPI numbers |
| body/large · body/default | 16 / 400 · 14 / 400 / 1.5 | Paragraphs · default text |
| label/default | 14 / 500 | Labels, chips, list titles |
| label/button · label/button-small | 16 / 600 · 14 / 600 | Buttons |
| caption/default · caption/badge | 12 / 400 · 12 / 600 | Meta · badges |
| overline/nav-group | 12 / 600 uppercase +0.1em | Sidebar group labels |

## 4. Spacing, radius, elevation

- 4px grid: `space.1`=4 … `space.12`=48. Card padding 16, gaps between cards 16–24, sections 24–32.
- Radius: `sm` 8 · `control` 12 (inputs) · `md` 16 (cards) · `lg` 24 (desktop panel) · `pill` 9999 (anything tappable).
- Shadows: `md` for cards, `sm` small controls, `lg` menus/sheets, `brand-edge` primary button, `focus-ring` focus.

## 5. Component decision tree

- A user action? → **Button** (Primary if it is THE action on the view, else Secondary; Ghost for inline; Danger to destroy).
- A field? → **Input** (labelled) or **Search field** (filtering a list).
- Filter a list or switch views? → **Chip** row (one Selected, navy).
- Show a health status? → **Health band**. Any other status? → **Status tag**.
- A number that matters? → **Stat card** (row of 2 on mobile / 4 on desktop).
- Group content? → **Card**. Nothing to show? → **Empty state** (what is missing + what to do).
- Top of a page? → **Page header** (breadcrumb · title · subtitle with data freshness).
- Navigation? → **Sidebar item** (desktop) + **Bottom nav item** (mobile), same destinations and order.
Full specs: `components.md`.

## 6. Writing code

- **Teachers Portal** (React + plain CSS): import `styles/tokens.css`; use existing classes (`.btn-primary`, `.card`, `.chip`, `.badge`,
  `.stat-card`, `.page-header__title`) and CSS variables. Health UI: `components/health/HealthUi.jsx`.
- **Inventory / School Portal** (React + Tailwind): use `components/ui/*` (`<Button variant>`, `<Card>`, `<Badge>`, `<Input>`) and
  the `wk-*` Tailwind colours; never `className` colour hacks on Buttons.
- **PMO** (vanilla JS, `public/app.js` + CSS): reuse the existing `hr-*` / shell classes; bump `app.js?v=` in `index.html` after edits.
- **New apps**: include `design-system/tokens/tokens.css`, extend Tailwind with `tailwind.preset.js`, follow `components.md`.

## 7. Working in Figma via MCP

1. `get_variable_defs` / `search_design_system` in file `ALYUYxBSYECsXW1jI0TPOC` for tokens (each has code syntax + description).
2. Import components by the IDs in `figma.json`; set text through component properties (`Label#…`, `Title#…`).
3. Bind every fill/stroke/radius/gap to variables; apply text + effect styles. After an icon INSTANCE_SWAP, re-apply the stroke token.
4. Frame naming for product files: `App · NN Screen · Desktop|Mobile`, Desktop 1440 wide, Mobile 390 wide.

## 8. Checklist before you hand back UI

- [ ] Only semantic tokens; no hex in code or Figma fills.
- [ ] Exactly one Primary button; all tappables pills at least 44px.
- [ ] Navy text on orange; orange text uses `--brand`.
- [ ] Cards = shadow, no border; no nested cards.
- [ ] Poppins sizes from §3 only.
- [ ] Health colours only for health, always labelled.
- [ ] Works at 390 and 1440; focus ring visible; demo data only.
