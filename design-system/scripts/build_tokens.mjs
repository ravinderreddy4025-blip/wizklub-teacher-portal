#!/usr/bin/env node
/**
 * Builds tokens/tokens.json (W3C DTCG), tokens/tailwind.preset.js and tokens/tokens.css.
 * Node port of build_tokens.py — use when Python is not installed (e.g. Windows).
 * Run: node design-system/scripts/build_tokens.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'tokens');

const PRIMITIVES = [
  ['orange/band', '#F47D31', '--wk-band', 'App chrome band (desktop frame, login brand half).'],
  ['orange/frame', '#E8661E', '--wk-frame', 'Deeper chrome behind white menu text (3.31:1, bold/large only).'],
  ['orange/dome', '#F28C43', '--wk-dome', 'Lighter dome rising from the bottom of the chrome.'],
  ['orange/500', '#FF8C2B', '--wk-orange', 'Tangerine: primary CTA fill, progress, active fills. Text on it is NAVY.'],
  ['orange/400', '#FF9D47', '--wk-orange-hover', 'Primary CTA hover.'],
  ['orange/edge', '#D9661A', '--wk-orange-edge', '3px chunky bottom edge under primary buttons.'],
  ['orange/sun', '#FFB547', '--wk-sun', 'Accent highlight on dark promo.'],
  ['orange/700', '#B4430F', '--wk-orange-text', 'Orange TEXT/ICONS on white (5.1:1 AA).'],
  ['orange/800', '#8F3409', '--wk-orange-text-hover', 'Orange text hover.'],
  ['orange/900', '#6E2807', '--brand-pressed', 'Orange text pressed.'],
  ['orange/100', '#FFE7CF', '--wk-peach', 'Peach tint: avatars, soft fills.'],
  ['orange/200', '#FFD1A8', '--wk-peach-2', 'Stronger peach.'],
  ['orange/50', '#FFF7EE', '--wk-cream', 'Cream: page background, hover surfaces.'],
  ['navy/900', '#02344F', '--wk-navy', 'Logo navy: ALL main text, text on orange (5.6:1).'],
  ['navy/700', '#0B4A6B', '--wk-navy-2', 'Navy gradient stop.'],
  ['neutral/white', '#FFFFFF', null, 'White.'],
  ['neutral/50', '#F2F2F2', '--surface-muted', 'Muted surface.'],
  ['neutral/100', '#EEF0F2', '--h-n-bg', 'Not-measured background.'],
  ['neutral/150', '#E6E7E8', '--border-light', 'Hairlines, progress track.'],
  ['neutral/200', '#CECFD0', '--border', 'Default border.'],
  ['neutral/250', '#C9CED3', '--h-bar-n', 'Not-measured bar.'],
  ['neutral/500', '#85878A', '--border-control', 'Control borders (3:1 non-text).'],
  ['neutral/600', '#6C6E72', '--text-muted', 'Muted text.'],
  ['neutral/650', '#52565C', '--gray-badge', 'Neutral badge text.'],
  ['neutral/700', '#4A5B68', '--text-secondary', 'Secondary text.'],
  ['green/700', '#04742D', '--green', 'Success / Green band text.'],
  ['green/400', '#35C759', '--green-bright', 'Green bars.'],
  ['green/100', '#D6F4DE', '--green-light', 'Success / Green band background.'],
  ['amber/700', '#8A5500', '--amber', 'Warning / Amber band text.'],
  ['amber/400', '#FFB020', '--h-bar-a', 'Amber bars.'],
  ['amber/100', '#FFEECC', '--amber-light', 'Warning / Amber band background.'],
  ['red/700', '#B42323', '--red', 'Danger / Red band text.'],
  ['red/400', '#F03E3E', '--h-bar-r', 'Red bars.'],
  ['red/50', '#FEF0F0', '--red-light', 'Danger / Red band background.'],
  ['blue/700', '#0062CC', '--blue', 'Info text.'],
  ['blue/50', '#E6F2FF', '--blue-light', 'Blue tile background.'],
  ['purple/700', '#5B2FD6', '--tint-purple-ink', 'Purple ink.'],
  ['purple/50', '#EDE3FF', '--tint-purple', 'Purple tile background.'],
  ['gold/700', '#8A5500', '--tint-gold-ink', 'Gold ink.'],
  ['gold/50', '#FFF3CC', '--tint-gold', 'Gold tile background.'],
];

const SEMANTIC = [
  ['bg/page', 'orange/50', '--bg', 'fill', 'Page background behind cards.'],
  ['bg/surface', 'neutral/white', '--surface', 'fill', 'Cards, panels, desktop content panel, inputs.'],
  ['bg/surface-muted', 'neutral/50', '--surface-muted', 'fill', 'Stat tiles inside cards, disabled button fill.'],
  ['bg/surface-hover', 'orange/50', '--surface-hover', 'fill', 'Hover on rows and secondary buttons.'],
  ['bg/chrome', 'orange/band', '--wk-band', 'fill', 'Desktop chrome + login brand half; pair with bg/chrome-dome.'],
  ['bg/chrome-frame', 'orange/frame', '--wk-frame', 'fill', 'Desktop frame/menu where WHITE menu labels sit.'],
  ['bg/chrome-dome', 'orange/dome', '--wk-dome', 'fill', 'Dome ellipse (150% x 88% at 50% 100%) over bg/chrome.'],
  ['bg/promo', 'navy/900', '--wk-promo', 'fill', 'Dark promo/hero card (linear 120deg navy/900 -> navy/700).'],
  ['bg/brand-soft', 'orange/100', '--brand-light', 'fill', 'Peach soft fill: avatar, icon tiles, active bottom-nav item.'],
  ['action/primary', 'orange/500', '--wk-orange', 'fill', 'Primary button fill. Label MUST be text/on-brand (navy).'],
  ['action/primary-hover', 'orange/400', '--wk-orange-hover', 'fill', 'Primary button hover.'],
  ['action/primary-edge', 'orange/edge', '--wk-orange-edge', 'fill', '3px bottom edge of primary buttons.'],
  ['action/secondary-border', 'navy/900', '--wk-navy', 'stroke', 'Secondary button border; also Selected chip fill.'],
  ['action/danger', 'red/700', '--red', 'fill', 'Destructive button fill (white label).'],
  ['text/primary', 'navy/900', '--text-primary', 'text', 'Headings and body. Navy, never black.'],
  ['text/secondary', 'neutral/700', '--text-secondary', 'text', 'Supporting text, subtitles.'],
  ['text/muted', 'neutral/600', '--text-muted', 'text', 'Hints, timestamps, inactive nav.'],
  ['text/on-brand', 'navy/900', '--on-brand', 'text', 'Text/icons ON orange. Never white on bright orange.'],
  ['text/brand', 'orange/700', '--brand', 'text', 'Orange links/accent text on white.'],
  ['text/brand-hover', 'orange/800', '--brand-hover', 'text', 'Hover for text/brand.'],
  ['text/on-dark', 'neutral/white', null, 'text', 'Text on navy promo and white menu labels on bg/chrome-frame.'],
  ['text/danger', 'red/700', '--red', 'text', 'Error messages.'],
  ['icon/primary', 'navy/900', '--wk-navy', 'icon', 'Default icon colour.'],
  ['icon/brand', 'orange/700', '--brand', 'icon', 'Accent icons on white.'],
  ['border/default', 'neutral/200', '--border', 'stroke', 'Borders when needed (cards use Shadow/md instead).'],
  ['border/light', 'neutral/150', '--border-light', 'stroke', 'Hairline dividers, top bar bottom border.'],
  ['border/control', 'neutral/500', '--border-control', 'stroke', 'Inputs, chips, tab pills.'],
  ['border/focus', 'navy/900', '--focus-ring', 'stroke', 'Focus ring (3px at 45%).'],
  ['status/success-fg', 'green/700', '--tag-success', 'text', 'Success tag text.'],
  ['status/success-bg', 'green/100', '--tag-success-light', 'fill', 'Success tag background.'],
  ['status/warning-fg', 'amber/700', '--tag-warning', 'text', 'Warning tag text.'],
  ['status/warning-bg', 'amber/100', '--tag-warning-light', 'fill', 'Warning tag background.'],
  ['status/danger-fg', 'red/700', '--tag-danger', 'text', 'Danger tag text.'],
  ['status/danger-bg', 'red/50', '--tag-danger-light', 'fill', 'Danger tag background.'],
  ['status/info-fg', 'blue/700', '--blue', 'text', 'Info tag text.'],
  ['status/info-bg', 'blue/50', '--blue-light', 'fill', 'Info tag background.'],
  ['status/neutral-fg', 'neutral/650', '--gray-badge', 'text', 'Neutral tag text.'],
  ['status/neutral-bg', 'neutral/50', '--gray-badge-light', 'fill', 'Neutral tag background.'],
  ['health/green-fg', 'green/700', '--h-g', 'icon', 'Health Green (G) text + dot. Bands = counts of students, never averages.'],
  ['health/green-bg', 'green/100', '--h-g-bg', 'fill', 'Health Green background.'],
  ['health/green-bar', 'green/400', '--h-bar-g', 'fill', 'Green segment in distribution bars.'],
  ['health/amber-fg', 'amber/700', '--h-a', 'icon', 'Health Amber (A) text + dot.'],
  ['health/amber-bg', 'amber/100', '--h-a-bg', 'fill', 'Health Amber background.'],
  ['health/amber-bar', 'amber/400', '--h-bar-a', 'fill', 'Amber segment.'],
  ['health/red-fg', 'red/700', '--h-r', 'icon', 'Health Red (R) text + dot.'],
  ['health/red-bg', 'red/50', '--h-r-bg', 'fill', 'Health Red background.'],
  ['health/red-bar', 'red/400', '--h-bar-r', 'fill', 'Red segment.'],
  ['health/none-fg', 'neutral/650', '--h-n', 'icon', 'Health Not measured (N) text + dot.'],
  ['health/none-bg', 'neutral/100', '--h-n-bg', 'fill', 'Not measured background.'],
  ['health/none-bar', 'neutral/250', '--h-bar-n', 'fill', 'Not measured segment.'],
  ['tint/orange-bg', 'orange/100', '--tint-orange', 'fill', 'Icon tile / quick link (orange).'],
  ['tint/orange-fg', 'orange/700', '--tint-orange-ink', 'icon', 'Ink on tint/orange-bg.'],
  ['tint/blue-bg', 'blue/50', '--tint-blue', 'fill', 'Icon tile (blue).'],
  ['tint/blue-fg', 'blue/700', '--tint-blue-ink', 'icon', 'Ink on tint/blue-bg.'],
  ['tint/green-bg', 'green/100', '--tint-green', 'fill', 'Icon tile (green).'],
  ['tint/green-fg', 'green/700', '--green', 'icon', 'Ink on tint/green-bg.'],
  ['tint/purple-bg', 'purple/50', '--tint-purple', 'fill', 'Icon tile (purple).'],
  ['tint/purple-fg', 'purple/700', '--tint-purple-ink', 'icon', 'Ink on tint/purple-bg.'],
  ['tint/gold-bg', 'gold/50', '--tint-gold', 'fill', 'Icon tile (gold).'],
  ['tint/gold-fg', 'gold/700', '--tint-gold-ink', 'icon', 'Ink on tint/gold-bg.'],
  ['progress/track', 'neutral/150', '--progress-bg', 'fill', 'Progress track.'],
  ['progress/fill', 'orange/500', '--wk-orange', 'fill', 'Progress fill (100% = health/green-bar).'],
];

const SPACE = [['0', 0], ['1', 4], ['2', 8], ['3', 12], ['4', 16], ['5', 20], ['6', 24], ['8', 32], ['10', 40], ['12', 48]];
const RADIUS = [
  ['sm', 8, '--radius-sm', 'Thumbnails, small tiles.'],
  ['control', 12, null, 'Inputs and search (NOT pills).'],
  ['md', 16, '--radius-md', 'Cards, stat cards.'],
  ['lg', 24, '--radius-lg', 'Desktop content panel, sheets.'],
  ['pill', 9999, '--radius-pill', 'Everything you tap: buttons, chips, tabs, badges, nav items.'],
];
const LAYOUT = [
  ['page-gutter', 16, 32, '--page-gutter'],
  ['header-height', 56, 56, '--header-height'],
  ['bottom-nav-height', 64, 0, '--nav-height'],
  ['sidebar-width', 0, 256, '--sidebar-width'],
  ['content-max', 1180, 1180, '--content-max'],
  ['touch-min', 44, 44, null],
];
const TYPE = [
  ['display/welcome', 500, 36, 130, 0, false, '.auth-panel__title'],
  ['title/page-desktop', 600, 28, 130, 0, false, '.page-header__title (>=1024px)'],
  ['title/page-mobile', 600, 22, 140, 0, false, '.page-header__title'],
  ['title/hero', 500, 24, 130, 0, false, '.dash-hero__title'],
  ['title/section', 500, 18, 140, 0, false, '.section-title'],
  ['number/stat', 600, 28, 120, 0, false, '.stat-card__value'],
  ['body/large', 400, 16, 150, 0, false, 'lead paragraphs, mobile form values'],
  ['body/default', 400, 14, 150, 0, false, 'body and table text'],
  ['label/default', 500, 14, 140, 0, false, 'labels, chip labels, list titles'],
  ['label/button', 600, 16, 100, 0, false, '.btn-primary'],
  ['label/button-small', 600, 14, 100, 0, false, 'compact buttons'],
  ['caption/default', 400, 12, 140, 0, false, 'meta text'],
  ['caption/badge', 600, 12, 140, 0, false, '.badge, .hband'],
  ['overline/nav-group', 600, 12, 140, 0.1, true, '.sidebar-nav__group-label'],
];
const SHADOW = [
  ['sm', '--shadow-sm', [[0, 1, 4, 0, '#00000029']], 'Chips, small floating controls.'],
  ['md', '--shadow-md', [[0, 1, 12, 0, '#00000029']], 'DEFAULT for every card (cards have no border).'],
  ['lg', '--shadow-lg', [[0, 10, 15, -3, '#0000001A'], [0, 4, 6, -4, '#0000001A']], 'Menus, popovers, sheets.'],
  ['brand-edge', '--shadow-brand', [[0, 3, 0, 0, '#D9661A']], '3px orange edge under PRIMARY buttons only.'],
  ['focus-ring', '--focus-ring', [[0, 0, 0, 3, '#02344F73']], 'Keyboard focus on every control.'],
];

function ext(css, figma, more = {}) {
  const e = {};
  if (css) e.css = `var(${css})`;
  if (figma) e.figma = figma;
  Object.assign(e, more);
  return Object.keys(e).length ? { 'com.wizklub': e } : {};
}

function put(tree, pathStr, node) {
  const parts = pathStr.split('/');
  let cur = tree;
  for (const p of parts.slice(0, -1)) {
    cur[p] = cur[p] ?? {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = node;
}

function primitiveHex(name) {
  const row = PRIMITIVES.find(([pn]) => pn === name);
  if (!row) throw new Error(`Unknown primitive: ${name}`);
  return row[1];
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const t = {
    $description:
      'WizKlub Design System tokens (W3C DTCG format). Use SEMANTIC tokens (color.*); primitives are for aliasing only. ' +
      'Code truth: frontend/wizklub-testimonials/src/styles/tokens.css. Figma: WizKlub Design System (ALYUYxBSYECsXW1jI0TPOC).',
  };

  const prim = { $description: 'Raw brand values. Hidden in Figma. Do not use directly in UI.' };
  for (const [n, h, css, d] of PRIMITIVES) {
    put(prim, n, {
      $type: 'color',
      $value: h,
      $description: d,
      $extensions: ext(css, `Primitives/${n}`),
    });
  }
  t.primitive = prim;

  const col = { $description: 'Semantic colours. The ONLY colours UI should use.' };
  for (const [n, p, css, scope, d] of SEMANTIC) {
    const hexv = primitiveHex(p);
    put(col, n, {
      $type: 'color',
      $value: `{primitive.${p.replace('/', '.')}}`,
      $description: d,
      $extensions: ext(css, `Color/${n}`, { resolved: hexv, use: scope }),
    });
  }
  t.color = col;

  t.space = Object.fromEntries(
    SPACE.map(([k, v]) => [
      k,
      {
        $type: 'dimension',
        $value: `${v}px`,
        $description: `4px grid step ${k}`,
        $extensions: ext(null, `Spacing & Radius/space/${k}`),
      },
    ]),
  );

  t.radius = Object.fromEntries(
    RADIUS.map(([k, v, css, d]) => [
      k,
      {
        $type: 'dimension',
        $value: `${v}px`,
        $description: d,
        $extensions: ext(css, `Spacing & Radius/radius/${k}`),
      },
    ]),
  );

  t.layout = Object.fromEntries(
    LAYOUT.map(([k, m, dk, css]) => [
      k,
      {
        $type: 'dimension',
        $value: `${m}px`,
        $description: `Mobile ${m}px / Desktop ${dk}px (breakpoint 1024px)`,
        $extensions: ext(css, `Layout/${k}`, { desktop: `${dk}px` }),
      },
    ]),
  );

  t.font = {
    family: {
      $type: 'fontFamily',
      $value: ['Poppins', 'system-ui', 'sans-serif'],
      $description: 'Only family. Weights 400/500/600.',
      $extensions: ext('--font'),
    },
  };

  const typo = {};
  for (const [n, w, sz, lh, ls, up, code] of TYPE) {
    put(typo, n, {
      $type: 'typography',
      $value: {
        fontFamily: '{font.family}',
        fontWeight: w,
        fontSize: `${sz}px`,
        lineHeight: lh / 100,
        letterSpacing: `${ls}em`,
      },
      $description: `Code: ${code}${up ? ' · uppercase' : ''}`,
      $extensions: ext(null, `Text style ${n.replace('/', '/').replace(/\b\w/g, (c) => c.toUpperCase())}`, {
        textTransform: up ? 'uppercase' : 'none',
      }),
    });
  }
  t.typography = typo;

  t.shadow = Object.fromEntries(
    SHADOW.map(([n, css, layers, d]) => [
      n,
      {
        $type: 'shadow',
        $value: layers.map(([x, y, b, s, c]) => ({
          offsetX: `${x}px`,
          offsetY: `${y}px`,
          blur: `${b}px`,
          spread: `${s}px`,
          color: c,
        })),
        $description: d,
        $extensions: ext(css),
      },
    ]),
  );

  fs.writeFileSync(path.join(OUT, 'tokens.json'), `${JSON.stringify(t, null, 2)}\n`);

  const colors = {};
  for (const [n, p, css] of SEMANTIC) {
    const [grp, key] = n.split('/');
    colors[grp] = colors[grp] ?? {};
    colors[grp][key] = css ? `var(${css})` : primitiveHex(p);
  }

  const preset = {
    theme: {
      extend: {
        colors,
        borderRadius: Object.fromEntries(RADIUS.map(([k, v]) => [k, `${v}px`])),
        spacing: Object.fromEntries(SPACE.map(([k, v]) => [k, `${v}px`])),
        boxShadow: Object.fromEntries(
          SHADOW.map(([n, , layers]) => [
            n,
            layers.map(([x, y, b, s, c]) => `${x}px ${y}px ${b}px ${s}px ${c}`).join(', '),
          ]),
        ),
        fontFamily: { sans: ['Poppins', 'system-ui', 'sans-serif'] },
        fontSize: Object.fromEntries(
          TYPE.map(([n, w, sz, lh]) => [n.replace('/', '-'), [`${sz}px`, { lineHeight: String(lh / 100), fontWeight: String(w) }]]),
        ),
      },
    },
  };

  fs.writeFileSync(
    path.join(OUT, 'tailwind.preset.js'),
    '/* Generated by design-system/scripts/build_tokens.mjs — do not edit by hand.\n' +
      ' * Semantic-only Tailwind preset: bg-bg-surface, text-text-primary, bg-action-primary, rounded-pill, shadow-md …\n' +
      ' * Colours resolve to the CSS variables in tokens.css, so include that file first. */\n' +
      `module.exports = ${JSON.stringify(preset, null, 2)};\n`,
  );

  const src = path.join(ROOT, '..', 'frontend', 'wizklub-testimonials', 'src', 'styles', 'tokens.css');
  const health = path.join(ROOT, '..', 'frontend', 'wizklub-testimonials', 'src', 'pages', 'health.css');
  const css = fs.readFileSync(src, 'utf8');
  const healthMatch = fs.readFileSync(health, 'utf8').match(/:root\s*\{[^}]*\}/);
  if (!healthMatch) throw new Error('Could not find :root block in health.css');

  fs.writeFileSync(
    path.join(OUT, 'tokens.css'),
    '/* Copied from frontend/wizklub-testimonials/src/styles/tokens.css + health RAG variables (pages/health.css).\n' +
      ' * Regenerate with: node design-system/scripts/build_tokens.mjs\n */\n' +
      `${css}\n/* Health RAG (student / batch / school) */\n${healthMatch[0]}\n`,
  );

  console.log('tokens.json, tailwind.preset.js, tokens.css written to', OUT);
  console.log(
    `${PRIMITIVES.length} primitives, ${SEMANTIC.length} semantic colours, ${SPACE.length} space, ` +
      `${RADIUS.length} radius, ${LAYOUT.length} layout, ${TYPE.length} type, ${SHADOW.length} shadows`,
  );
}

main();
