#!/usr/bin/env python3
"""Builds tokens/tokens.json (W3C DTCG), tokens/tailwind.preset.js and tokens/tokens.css.

Single source for the machine-readable copy of the WizKlub design system. Values mirror
frontend/wizklub-testimonials/src/styles/tokens.css (code truth) and the Figma file
"WizKlub Design System" (ALYUYxBSYECsXW1jI0TPOC). Run: python3 design-system/scripts/build_tokens.py
"""
import json, os, re, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tokens')

# name, hex, css var, description
PRIMITIVES = [
    ('orange/band', '#F47D31', '--wk-band', 'App chrome band (desktop frame, login brand half).'),
    ('orange/frame', '#E8661E', '--wk-frame', 'Deeper chrome behind white menu text (3.31:1, bold/large only).'),
    ('orange/dome', '#F28C43', '--wk-dome', 'Lighter dome rising from the bottom of the chrome.'),
    ('orange/500', '#FF8C2B', '--wk-orange', 'Tangerine: primary CTA fill, progress, active fills. Text on it is NAVY.'),
    ('orange/400', '#FF9D47', '--wk-orange-hover', 'Primary CTA hover.'),
    ('orange/edge', '#D9661A', '--wk-orange-edge', '3px chunky bottom edge under primary buttons.'),
    ('orange/sun', '#FFB547', '--wk-sun', 'Accent highlight on dark promo.'),
    ('orange/700', '#B4430F', '--wk-orange-text', 'Orange TEXT/ICONS on white (5.1:1 AA).'),
    ('orange/800', '#8F3409', '--wk-orange-text-hover', 'Orange text hover.'),
    ('orange/900', '#6E2807', '--brand-pressed', 'Orange text pressed.'),
    ('orange/100', '#FFE7CF', '--wk-peach', 'Peach tint: avatars, soft fills.'),
    ('orange/200', '#FFD1A8', '--wk-peach-2', 'Stronger peach.'),
    ('orange/50', '#FFF7EE', '--wk-cream', 'Cream: page background, hover surfaces.'),
    ('navy/900', '#02344F', '--wk-navy', 'Logo navy: ALL main text, text on orange (5.6:1).'),
    ('navy/700', '#0B4A6B', '--wk-navy-2', 'Navy gradient stop.'),
    ('neutral/white', '#FFFFFF', None, 'White.'),
    ('neutral/50', '#F2F2F2', '--surface-muted', 'Muted surface.'),
    ('neutral/100', '#EEF0F2', '--h-n-bg', 'Not-measured background.'),
    ('neutral/150', '#E6E7E8', '--border-light', 'Hairlines, progress track.'),
    ('neutral/200', '#CECFD0', '--border', 'Default border.'),
    ('neutral/250', '#C9CED3', '--h-bar-n', 'Not-measured bar.'),
    ('neutral/500', '#85878A', '--border-control', 'Control borders (3:1 non-text).'),
    ('neutral/600', '#6C6E72', '--text-muted', 'Muted text.'),
    ('neutral/650', '#52565C', '--gray-badge', 'Neutral badge text.'),
    ('neutral/700', '#4A5B68', '--text-secondary', 'Secondary text.'),
    ('green/700', '#04742D', '--green', 'Success / Green band text.'),
    ('green/400', '#35C759', '--green-bright', 'Green bars.'),
    ('green/100', '#D6F4DE', '--green-light', 'Success / Green band background.'),
    ('amber/700', '#8A5500', '--amber', 'Warning / Amber band text.'),
    ('amber/400', '#FFB020', '--h-bar-a', 'Amber bars.'),
    ('amber/100', '#FFEECC', '--amber-light', 'Warning / Amber band background.'),
    ('red/700', '#B42323', '--red', 'Danger / Red band text.'),
    ('red/400', '#F03E3E', '--h-bar-r', 'Red bars.'),
    ('red/50', '#FEF0F0', '--red-light', 'Danger / Red band background.'),
    ('blue/700', '#0062CC', '--blue', 'Info text.'),
    ('blue/50', '#E6F2FF', '--blue-light', 'Blue tile background.'),
    ('purple/700', '#5B2FD6', '--tint-purple-ink', 'Purple ink.'),
    ('purple/50', '#EDE3FF', '--tint-purple', 'Purple tile background.'),
    ('gold/700', '#8A5500', '--tint-gold-ink', 'Gold ink.'),
    ('gold/50', '#FFF3CC', '--tint-gold', 'Gold tile background.'),
]

# semantic name, primitive, css var, figma scopes, description
SEMANTIC = [
    ('bg/page', 'orange/50', '--bg', 'fill', 'Page background behind cards.'),
    ('bg/surface', 'neutral/white', '--surface', 'fill', 'Cards, panels, desktop content panel, inputs.'),
    ('bg/surface-muted', 'neutral/50', '--surface-muted', 'fill', 'Stat tiles inside cards, disabled button fill.'),
    ('bg/surface-hover', 'orange/50', '--surface-hover', 'fill', 'Hover on rows and secondary buttons.'),
    ('bg/chrome', 'orange/band', '--wk-band', 'fill', 'Desktop chrome + login brand half; pair with bg/chrome-dome.'),
    ('bg/chrome-frame', 'orange/frame', '--wk-frame', 'fill', 'Desktop frame/menu where WHITE menu labels sit.'),
    ('bg/chrome-dome', 'orange/dome', '--wk-dome', 'fill', 'Dome ellipse (150% x 88% at 50% 100%) over bg/chrome.'),
    ('bg/promo', 'navy/900', '--wk-promo', 'fill', 'Dark promo/hero card (linear 120deg navy/900 -> navy/700).'),
    ('bg/brand-soft', 'orange/100', '--brand-light', 'fill', 'Peach soft fill: avatar, icon tiles, active bottom-nav item.'),
    ('action/primary', 'orange/500', '--wk-orange', 'fill', 'Primary button fill. Label MUST be text/on-brand (navy).'),
    ('action/primary-hover', 'orange/400', '--wk-orange-hover', 'fill', 'Primary button hover.'),
    ('action/primary-edge', 'orange/edge', '--wk-orange-edge', 'fill', '3px bottom edge of primary buttons.'),
    ('action/secondary-border', 'navy/900', '--wk-navy', 'stroke', 'Secondary button border; also Selected chip fill.'),
    ('action/danger', 'red/700', '--red', 'fill', 'Destructive button fill (white label).'),
    ('text/primary', 'navy/900', '--text-primary', 'text', 'Headings and body. Navy, never black.'),
    ('text/secondary', 'neutral/700', '--text-secondary', 'text', 'Supporting text, subtitles.'),
    ('text/muted', 'neutral/600', '--text-muted', 'text', 'Hints, timestamps, inactive nav.'),
    ('text/on-brand', 'navy/900', '--on-brand', 'text', 'Text/icons ON orange. Never white on bright orange.'),
    ('text/brand', 'orange/700', '--brand', 'text', 'Orange links/accent text on white.'),
    ('text/brand-hover', 'orange/800', '--brand-hover', 'text', 'Hover for text/brand.'),
    ('text/on-dark', 'neutral/white', None, 'text', 'Text on navy promo and white menu labels on bg/chrome-frame.'),
    ('text/danger', 'red/700', '--red', 'text', 'Error messages.'),
    ('icon/primary', 'navy/900', '--wk-navy', 'icon', 'Default icon colour.'),
    ('icon/brand', 'orange/700', '--brand', 'icon', 'Accent icons on white.'),
    ('border/default', 'neutral/200', '--border', 'stroke', 'Borders when needed (cards use Shadow/md instead).'),
    ('border/light', 'neutral/150', '--border-light', 'stroke', 'Hairline dividers, top bar bottom border.'),
    ('border/control', 'neutral/500', '--border-control', 'stroke', 'Inputs, chips, tab pills.'),
    ('border/focus', 'navy/900', '--focus-ring', 'stroke', 'Focus ring (3px at 45%).'),
    ('status/success-fg', 'green/700', '--tag-success', 'text', 'Success tag text.'),
    ('status/success-bg', 'green/100', '--tag-success-light', 'fill', 'Success tag background.'),
    ('status/warning-fg', 'amber/700', '--tag-warning', 'text', 'Warning tag text.'),
    ('status/warning-bg', 'amber/100', '--tag-warning-light', 'fill', 'Warning tag background.'),
    ('status/danger-fg', 'red/700', '--tag-danger', 'text', 'Danger tag text.'),
    ('status/danger-bg', 'red/50', '--tag-danger-light', 'fill', 'Danger tag background.'),
    ('status/info-fg', 'blue/700', '--blue', 'text', 'Info tag text.'),
    ('status/info-bg', 'blue/50', '--blue-light', 'fill', 'Info tag background.'),
    ('status/neutral-fg', 'neutral/650', '--gray-badge', 'text', 'Neutral tag text.'),
    ('status/neutral-bg', 'neutral/50', '--gray-badge-light', 'fill', 'Neutral tag background.'),
    ('health/green-fg', 'green/700', '--h-g', 'icon', 'Health Green (G) text + dot. Bands = counts of students, never averages.'),
    ('health/green-bg', 'green/100', '--h-g-bg', 'fill', 'Health Green background.'),
    ('health/green-bar', 'green/400', '--h-bar-g', 'fill', 'Green segment in distribution bars.'),
    ('health/amber-fg', 'amber/700', '--h-a', 'icon', 'Health Amber (A) text + dot.'),
    ('health/amber-bg', 'amber/100', '--h-a-bg', 'fill', 'Health Amber background.'),
    ('health/amber-bar', 'amber/400', '--h-bar-a', 'fill', 'Amber segment.'),
    ('health/red-fg', 'red/700', '--h-r', 'icon', 'Health Red (R) text + dot.'),
    ('health/red-bg', 'red/50', '--h-r-bg', 'fill', 'Health Red background.'),
    ('health/red-bar', 'red/400', '--h-bar-r', 'fill', 'Red segment.'),
    ('health/none-fg', 'neutral/650', '--h-n', 'icon', 'Health Not measured (N) text + dot.'),
    ('health/none-bg', 'neutral/100', '--h-n-bg', 'fill', 'Not measured background.'),
    ('health/none-bar', 'neutral/250', '--h-bar-n', 'fill', 'Not measured segment.'),
    ('tint/orange-bg', 'orange/100', '--tint-orange', 'fill', 'Icon tile / quick link (orange).'),
    ('tint/orange-fg', 'orange/700', '--tint-orange-ink', 'icon', 'Ink on tint/orange-bg.'),
    ('tint/blue-bg', 'blue/50', '--tint-blue', 'fill', 'Icon tile (blue).'),
    ('tint/blue-fg', 'blue/700', '--tint-blue-ink', 'icon', 'Ink on tint/blue-bg.'),
    ('tint/green-bg', 'green/100', '--tint-green', 'fill', 'Icon tile (green).'),
    ('tint/green-fg', 'green/700', '--green', 'icon', 'Ink on tint/green-bg.'),
    ('tint/purple-bg', 'purple/50', '--tint-purple', 'fill', 'Icon tile (purple).'),
    ('tint/purple-fg', 'purple/700', '--tint-purple-ink', 'icon', 'Ink on tint/purple-bg.'),
    ('tint/gold-bg', 'gold/50', '--tint-gold', 'fill', 'Icon tile (gold).'),
    ('tint/gold-fg', 'gold/700', '--tint-gold-ink', 'icon', 'Ink on tint/gold-bg.'),
    ('progress/track', 'neutral/150', '--progress-bg', 'fill', 'Progress track.'),
    ('progress/fill', 'orange/500', '--wk-orange', 'fill', 'Progress fill (100% = health/green-bar).'),
]
SPACE = [('0', 0), ('1', 4), ('2', 8), ('3', 12), ('4', 16), ('5', 20), ('6', 24), ('8', 32), ('10', 40), ('12', 48)]
RADIUS = [('sm', 8, '--radius-sm', 'Thumbnails, small tiles.'), ('control', 12, None, 'Inputs and search (NOT pills).'),
          ('md', 16, '--radius-md', 'Cards, stat cards.'), ('lg', 24, '--radius-lg', 'Desktop content panel, sheets.'),
          ('pill', 9999, '--radius-pill', 'Everything you tap: buttons, chips, tabs, badges, nav items.')]
LAYOUT = [('page-gutter', 16, 32, '--page-gutter'), ('header-height', 56, 56, '--header-height'), ('bottom-nav-height', 64, 0, '--nav-height'),
          ('sidebar-width', 0, 256, '--sidebar-width'), ('content-max', 1180, 1180, '--content-max'), ('touch-min', 44, 44, None)]
# name, weight, size, line-height %, letter-spacing em, uppercase, code
TYPE = [
    ('display/welcome', 500, 36, 130, 0, False, '.auth-panel__title'),
    ('title/page-desktop', 600, 28, 130, 0, False, '.page-header__title (>=1024px)'),
    ('title/page-mobile', 600, 22, 140, 0, False, '.page-header__title'),
    ('title/hero', 500, 24, 130, 0, False, '.dash-hero__title'),
    ('title/section', 500, 18, 140, 0, False, '.section-title'),
    ('number/stat', 600, 28, 120, 0, False, '.stat-card__value'),
    ('body/large', 400, 16, 150, 0, False, 'lead paragraphs, mobile form values'),
    ('body/default', 400, 14, 150, 0, False, 'body and table text'),
    ('label/default', 500, 14, 140, 0, False, 'labels, chip labels, list titles'),
    ('label/button', 600, 16, 100, 0, False, '.btn-primary'),
    ('label/button-small', 600, 14, 100, 0, False, 'compact buttons'),
    ('caption/default', 400, 12, 140, 0, False, 'meta text'),
    ('caption/badge', 600, 12, 140, 0, False, '.badge, .hband'),
    ('overline/nav-group', 600, 12, 140, 0.1, True, '.sidebar-nav__group-label'),
]
SHADOW = [
    ('sm', '--shadow-sm', [(0, 1, 4, 0, '#00000029')], 'Chips, small floating controls.'),
    ('md', '--shadow-md', [(0, 1, 12, 0, '#00000029')], 'DEFAULT for every card (cards have no border).'),
    ('lg', '--shadow-lg', [(0, 10, 15, -3, '#0000001A'), (0, 4, 6, -4, '#0000001A')], 'Menus, popovers, sheets.'),
    ('brand-edge', '--shadow-brand', [(0, 3, 0, 0, '#D9661A')], '3px orange edge under PRIMARY buttons only.'),
    ('focus-ring', '--focus-ring', [(0, 0, 0, 3, '#02344F73')], 'Keyboard focus on every control.'),
]


def ext(css=None, figma=None, **more):
    e = {}
    if css: e['css'] = f'var({css})'
    if figma: e['figma'] = figma
    e.update(more)
    return {'com.wizklub': e} if e else {}


def put(tree, path, node):
    parts = path.split('/')
    for p in parts[:-1]:
        tree = tree.setdefault(p, {})
    tree[parts[-1]] = node


def main():
    os.makedirs(OUT, exist_ok=True)
    t = {'$description': 'WizKlub Design System tokens (W3C DTCG format). Use SEMANTIC tokens (color.*); primitives are for aliasing only. '
                         'Code truth: frontend/wizklub-testimonials/src/styles/tokens.css. Figma: WizKlub Design System (ALYUYxBSYECsXW1jI0TPOC).'}
    prim = {'$description': 'Raw brand values. Hidden in Figma. Do not use directly in UI.'}
    for n, h, css, d in PRIMITIVES:
        put(prim, n, {'$type': 'color', '$value': h, '$description': d, '$extensions': ext(css, f'Primitives/{n}')})
    t['primitive'] = prim
    col = {'$description': 'Semantic colours. The ONLY colours UI should use.'}
    for n, p, css, scope, d in SEMANTIC:
        hexv = next(h for pn, h, _, _ in PRIMITIVES if pn == p)
        put(col, n, {'$type': 'color', '$value': '{primitive.' + p.replace('/', '.') + '}', '$description': d,
                     '$extensions': ext(css, f'Color/{n}', resolved=hexv, use=scope)})
    t['color'] = col
    t['space'] = {k: {'$type': 'dimension', '$value': f'{v}px', '$description': f'4px grid step {k}', '$extensions': ext(figma=f'Spacing & Radius/space/{k}')} for k, v in SPACE}
    t['radius'] = {k: {'$type': 'dimension', '$value': f'{v}px', '$description': d, '$extensions': ext(css, f'Spacing & Radius/radius/{k}')} for k, v, css, d in RADIUS}
    t['layout'] = {k: {'$type': 'dimension', '$value': f'{m}px', '$description': f'Mobile {m}px / Desktop {dk}px (breakpoint 1024px)',
                       '$extensions': ext(css, f'Layout/{k}', desktop=f'{dk}px')} for k, m, dk, css in LAYOUT}
    t['font'] = {'family': {'$type': 'fontFamily', '$value': ['Poppins', 'system-ui', 'sans-serif'], '$description': 'Only family. Weights 400/500/600.', '$extensions': ext('--font')}}
    typo = {}
    for n, w, sz, lh, ls, up, code in TYPE:
        put(typo, n, {'$type': 'typography', '$value': {'fontFamily': '{font.family}', 'fontWeight': w, 'fontSize': f'{sz}px', 'lineHeight': lh / 100,
                                                     'letterSpacing': f'{ls}em'}, '$description': f'Code: {code}' + (' · uppercase' if up else ''),
                      '$extensions': ext(figma='Text style ' + n.replace('/', '/').title(), textTransform='uppercase' if up else 'none')})
    t['typography'] = typo
    t['shadow'] = {n: {'$type': 'shadow', '$value': [{'offsetX': f'{x}px', 'offsetY': f'{y}px', 'blur': f'{b}px', 'spread': f'{s}px', 'color': c} for x, y, b, s, c in layers],
                       '$description': d, '$extensions': ext(css)} for n, css, layers, d in SHADOW}
    with open(os.path.join(OUT, 'tokens.json'), 'w') as f:
        json.dump(t, f, indent=2)

    # Tailwind preset: semantic names only
    colors = {}
    for n, p, css, _, _ in SEMANTIC:
        grp, key = n.split('/')
        colors.setdefault(grp, {})[key] = f'var({css})' if css else next(h for pn, h, _, _ in PRIMITIVES if pn == p)
    preset = {'theme': {'extend': {
        'colors': colors,
        'borderRadius': {k: f'{v}px' for k, v, _, _ in RADIUS},
        'spacing': {k: f'{v}px' for k, v in SPACE},
        'boxShadow': {n: ', '.join(f'{x}px {y}px {b}px {s}px {c}' for x, y, b, s, c in layers) for n, _, layers, _ in SHADOW},
        'fontFamily': {'sans': ['Poppins', 'system-ui', 'sans-serif']},
        'fontSize': {n.replace('/', '-'): [f'{sz}px', {'lineHeight': str(lh / 100), 'fontWeight': str(w)}] for n, w, sz, lh, _, _, _ in TYPE},
    }}}
    with open(os.path.join(OUT, 'tailwind.preset.js'), 'w') as f:
        f.write('/* Generated by design-system/scripts/build_tokens.py — do not edit by hand.\n'
                ' * Semantic-only Tailwind preset: bg-bg-surface, text-text-primary, bg-action-primary, rounded-pill, shadow-md …\n'
                ' * Colours resolve to the CSS variables in tokens.css, so include that file first. */\n')
        f.write('module.exports = ' + json.dumps(preset, indent=2) + ';\n')

    # tokens.css: the code-truth file + health variables
    src = os.path.join(ROOT, '..', 'frontend', 'wizklub-testimonials', 'src', 'styles', 'tokens.css')
    health = os.path.join(ROOT, '..', 'frontend', 'wizklub-testimonials', 'src', 'pages', 'health.css')
    css = open(src).read()
    hv = re.search(r':root\s*\{[^}]*\}', open(health).read()).group(0)
    with open(os.path.join(OUT, 'tokens.css'), 'w') as f:
        f.write('/* Copied from frontend/wizklub-testimonials/src/styles/tokens.css + health RAG variables (pages/health.css).\n'
                ' * Regenerate with design-system/scripts/build_tokens.py. */\n')
        f.write(css + '\n/* Health RAG (student / batch / school) */\n' + hv + '\n')
    print('tokens.json, tailwind.preset.js, tokens.css written to', OUT)
    print(f'{len(PRIMITIVES)} primitives, {len(SEMANTIC)} semantic colours, {len(SPACE)} space, {len(RADIUS)} radius, {len(LAYOUT)} layout, {len(TYPE)} type, {len(SHADOW)} shadows')


if __name__ == '__main__':
    main()
