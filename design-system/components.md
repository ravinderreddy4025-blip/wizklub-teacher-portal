# Components — WizKlub Design System v1

Every component uses the same block so humans and agents can parse it:
`purpose · variants · props · anatomy (token per part) · rules · code`. Figma IDs and property keys: `figma.json`.
Token names are `tokens.json` paths (`color.action.primary`) with the CSS variable in brackets.

---

## Button
- **purpose**: trigger an action. Exactly one Primary per view.
- **variants**: `Style` Primary | Secondary | Ghost | Danger × `Size` Large (44px) | Small (36px) × `State` Default | Hover | Disabled
- **props**: `Label` text · `Show icon` boolean · `Icon` instance swap (default `Icon/arrow-right`, trailing)
- **anatomy**
  - container: pill `radius.pill`; padding-x `space.6` (L) / `space.4` (S); gap `space.2`
  - Primary: fill `color.action.primary` [--wk-orange], hover `action.primary-hover`, label `color.text.on-brand` [--on-brand], `shadow.brand-edge`
  - Secondary: fill `bg.surface`, 1px `action.secondary-border` [--wk-navy], label `text.primary`, hover fill `bg.surface-hover`
  - Ghost: no fill, label `text.brand` [--brand], hover fill `bg.brand-soft`
  - Danger: fill `action.danger` [--red], label `text.on-dark`
  - Disabled: fill `bg.surface-muted`, label `text.muted`, no edge
  - label: `typography.label.button` (L) / `label.button-small` (S)
- **rules**: never white on orange; never recolour via overrides; full-width on mobile forms; icon only trailing.
- **code**: Teachers Portal `.btn-primary`, `.btn-secondary` (`styles/app.css`) · Inventory `<Button variant="primary|secondary|ghost|danger">` (`components/ui/Button.jsx`)

## Input
- **purpose**: labelled single-line field.
- **variants**: `State` Default | Focus | Error | Disabled
- **props**: `Label`, `Value`, `Helper` text · `Show helper` boolean
- **anatomy**: label `label.default` `text.primary` · field 48px, `radius.control` (12), 1px `border.control`, padding-x `space.4`, value `body.large` · helper `caption.default` `text.secondary`
  - Focus: 2px `border.focus` + `shadow.focus-ring` · Error: border + helper `text.danger` · Disabled: fill `bg.surface-muted`, text `text.muted`
- **rules**: label always visible (placeholder is not a label); error text says how to fix; 16px value text on mobile.
- **code**: Teachers Portal `.auth-input`, `.feedback-form__input` · Inventory `<Input label error>` (`components/ui/Input.jsx`)

## Search field
- **purpose**: filter a list/table.
- **variants**: `State` Default | Focus · **props**: `Placeholder`
- **anatomy**: 48px, `radius.control`, 1px `border.control`, leading `Icon/search` 20px `text.muted`, text `body.default`
- **code**: Teachers Portal `.search-input` · Inventory `components/shared/ListToolbar.jsx`

## Chip (filters and view tabs)
- **purpose**: filter a list (All 8 · Red 3) or switch views (Students · Assessments · Health).
- **variants**: `State` Default | Hover | Selected · **props**: `Label`, `Count` text · `Show count`
- **anatomy**: 36px pill, padding-x `space.4`, gap `space.2`, label `label.default`
  - Default: `bg.surface` + 1px `border.control`, label `text.primary`, count `text.secondary`
  - Hover: `bg.surface-hover` · Selected: fill `action.secondary-border` (navy) + `text.on-dark`
- **rules**: one Selected per group; 8px gaps; wraps on mobile; never orange for selection.
- **code**: Teachers Portal `.chip`, `.chip.is-active`, `.view-tabs`

## Health band
- **purpose**: RAG health status of a student, batch or school.
- **variants**: `Band` G Green | A Amber | R Red | N Not measured × `Size` Small | Medium
- **anatomy**: pill, padding 3/10 (M) or 2/8 (S), 7px dot + label `caption.badge`; colours `color.health.{green,amber,red,none}-fg` on `-bg`
- **rules**: health only; always the word + colour; overall Red if delivery Red or 2+ pillars Red; N = not enough data (e.g. under 2 sessions due).
- **code**: Teachers Portal `<BandPill band size>` (`components/health/HealthUi.jsx`, `.hband--G/A/R/N`) · PMO `.hr-band` (`public/app.js`)

## Status tag
- **purpose**: workflow status (dispatch, audit, upload, ticket).
- **variants**: `Tone` Success | Warning | Danger | Info | Neutral · **props**: `Label`
- **anatomy**: pill, padding 3/10, `caption.badge`; `color.status.<tone>-fg` on `-bg`
- **rules**: 1–2 words; not for health.
- **code**: Teachers Portal `.badge`, `.tag--*` · Inventory `<Badge>` (`components/ui/Badge.jsx`)

## Avatar
- **variants**: `Tone` Brand | Soft × `Size` 32 | 40 | 48 · **props**: `Initials`
- **anatomy**: circle; Brand = `action.primary` + `text.on-brand` (signed-in user); Soft = `bg.brand-soft` + `text.brand` (people in lists); initials `label.button-small`
- **rules**: real photos only when the product has them; never generated faces.

## Progress bar
- **variants**: `Value` 25 | 50 | 85 | 100
- **anatomy**: 8px pill; track `progress.track`, fill `progress.fill`; 100% uses `health.green-bar`
- **rules**: always show the number beside it ("85% covered · 17 of 20").
- **code**: Teachers Portal `.progress`, `.dash-hero__meter`

## Card
- **props**: `Title`, `Body`
- **anatomy**: `bg.surface`, `radius.md` (16), padding `space.4`, gap `space.2`, `shadow.md`, no border; title `title.section`, body `body.default` `text.secondary`
- **rules**: no nested cards; stack with 16–24px gaps; primary action at the bottom or trailing edge.
- **code**: Teachers Portal `.card` · Inventory `<Card>` (`components/ui/Card.jsx`)

## Stat card
- **variants**: `Tone` Orange | Green | Red | Blue · **props**: `Label`, `Value`, `Hint` text · `Show hint` · `Icon` swap
- **anatomy**: Card shell; top row = label (`body.default` `text.secondary`, wraps) + 40px round icon tile (`tint.*-bg`, icon `tint.*-fg`); value `number.stat`; hint `caption.default`
- **tone meaning**: Orange neutral count · Green good/complete · Red needs attention · Blue structural (schools, batches)
- **rules**: 2 per row on mobile, 4 on desktop.
- **code**: Teachers Portal `<StatCard>` (`components/ui/StatCard.jsx`) · Inventory `components/admin/StatCard.jsx`

## Sidebar item (desktop)
- **variants**: `State` Default | Active · **props**: `Label`, `Icon` swap
- **anatomy**: 44px pill, padding-x 14, gap `space.3`, icon 20, label `label.button`; sits on `bg.chrome-frame`
  - Default: transparent, `text.on-dark` · Active: `bg.surface` pill + `text.brand`
- **rules**: groups under `overline.nav-group` labels (WORKSPACE, OPERATIONS, HELP); width 256 (collapsed 88); Log out at the bottom.
- **code**: Teachers Portal `components/layout/SidebarNav.jsx` · Inventory `components/layout/Sidebar.jsx`

## Bottom nav item (mobile)
- **variants**: `State` Default | Active · **props**: `Label`, `Icon` swap
- **anatomy**: 72×52 tile, radius 16, icon 22, label 11/500; Default `text.muted`; Active `bg.brand-soft` + `text.brand`
- **rules**: max 5 items; same order as the sidebar; 64px bar with `border.light` top hairline; respect safe area.
- **code**: Teachers Portal `components/layout/BottomNav.jsx` · Inventory `components/layout/MobileNav.jsx`

## Page header
- **variants**: `Viewport` Desktop | Mobile · **props**: `Breadcrumb`, `Title`, `Subtitle` text · `Show breadcrumb`
- **anatomy**: breadcrumb `caption.default` `text.brand` (› separators) · title `title.page-desktop` / `title.page-mobile` · subtitle `body.default` `text.secondary`
- **rules**: one per page; subtitle states scope and data freshness ("data as of 18 Sept 2026"); page actions right of title (desktop) or below (mobile).
- **code**: Teachers Portal `<PageHeader>` (`components/ui/PageHeader.jsx`) · Inventory `components/layout/PageHeader.jsx`

## Empty state
- **props**: `Title`, `Message` text · `Show action` · `Icon` swap
- **anatomy**: `bg.surface`, radius 16, padding 40/32; 56px round `bg.brand-soft` tile with `icon.brand` icon; title `label.button`; message `body.default` `text.secondary` centred; Primary Small button
- **rules**: say what is missing AND what to do next; errors are not empty states.
- **code**: Teachers Portal `.empty-state` (`styles/app.css`)

## Icon
- 27 Lucide icons, 24px, stroke 2, round caps/joins, colour `icon.primary` by default. Names in `figma.json › icons`.
- **code**: `lucide-react` (Inventory) · `components/icons/Icons.jsx` (Teachers Portal)

## Pattern: App shell
- **Desktop (at least 1024px)**: `bg.chrome-frame` full-bleed; 256px sidebar (Sidebar items, group overlines, Log out at bottom); white content panel `bg.surface`, `radius.lg`, inset 12px top/right/bottom; panel padding 24–32; top bar = greeting + Avatar Brand 40.
- **Mobile (under 1024px)**: `bg.surface` page; 56px top bar (logo + avatar, `border.light` bottom); 16px gutters; 64px Bottom nav.
- Figma: `App shell · Desktop 1440` (7:2), `App shell · Mobile 390` (7:156).
