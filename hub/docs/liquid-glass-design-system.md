# DigiWP Liquid Glass — design system (platform 0.5.0)

Owner request, 2026-11-12: redesign the panel as liquid glass. This file is the
spec for `hub/src/styles/liquid-glass.css`, which loads last (after
`panel.css`).

## What changes and what does not

Liquid Glass changes the **material** of surfaces only: translucency, blur,
rims, specular sheen and depth.

These stay exactly as they were, and tests pin them:

| Kept | Where it lives |
|------|----------------|
| Brand green `#15803d` (light) / `#30d56b` (dark) | `panel.css` |
| Status colours (healthy/warning/critical/checking) and authority colours | `digiwp.css` |
| Layout, spacing, radii, type (Yekan Bakh variable font) | `panel.css`, `digiwp.css` |
| Theme switch, collapse, progress line, focus rings | `PanelFrame.jsx`, `panel.css` |

A glass redesign must never be used to move meaning. Green still means
healthy, amber still means attention.

## Tokens (`--lg-*`)

Declared on `:root` (light) and re-declared on
`.panel-frame[data-panel-theme="dark"]` and `[data-theme="ink"]` (dark), so a
dialog rendered inside the panel inherits the right theme.

| Token | Role |
|-------|------|
| `--lg-backdrop-base`, `--lg-field-1…4` | The light fields painted behind the panel. Glass needs something behind it. |
| `--lg-fill-1` / `-2` / `-3` | Glass tint for content / chrome / overlay. |
| `--lg-fill-hover`, `--lg-fill-inset` | Hovered glass; recessed wells (inputs, chips, table heads). |
| `--lg-rim` | Top specular line (`inset 0 1px 0`). |
| `--lg-rim-soft` | 1px body border. |
| `--lg-edge` | Outer hairline that separates glass from glass. |
| `--lg-sheen` | Diagonal highlight gradient on every glass surface. |
| `--lg-shadow-1…3` | Depth per thickness. |
| `--lg-blur-1…3` | `backdrop-filter` per thickness (18 / 28 / 36 px). |
| `--lg-gel-top` / `-bottom` / `-glow` | The green gel of primary buttons and the active nav marker. |
| `--lg-ease`, `--lg-fast`, `--lg-med` | Motion. |

Custom properties inherit their computed value: any token built from
`var(--gd-primary)` is re-declared in the dark block, or dark mode would
inherit light-theme green.

## Thickness

| Thickness | Recipe | Used by |
|-----------|--------|---------|
| Content (1) | fill-1, blur 18px, shadow-1 | `.dwp-card`, `.gd-card`, `.gd-metric`, `.panel-quick-link`, `.gd-table` |
| Chrome (2) | fill-2, blur 28px, shadow-2 | sidebar, topbar, marketing nav |
| Overlay (3) | fill-3, blur 36px, shadow-3 | `.gd-dialog`, `.gd-toast`, authority tooltip |

Every glass surface gets the same three edges: `--lg-rim-soft` border,
`inset 0 1px 0 var(--lg-rim)`, `0 0 0 .5px var(--lg-edge)`.

## Components

| Component | Glass treatment |
|-----------|-----------------|
| Sidebar active item | Lensed pill (`fill-hover` + rim) with a 6×22px green marker and glow, replacing the flat gradient + bar. |
| Primary button | Green gel: vertical gradient, inner top highlight, inner bottom shade, soft green glow. Press scales to .98. |
| Secondary button | Clear glass (`fill-hover`, rim). |
| Ghost button | Transparent until hover (`fill-inset`). |
| Inputs, selects, textareas | Recessed wells (`fill-inset`, inner shadow); focus lifts to `fill-hover` with the existing focus ring. |
| Topbar controls, toolbar buttons, version chip | Small glass chips. |
| First metric | Brand-tinted glass (9% primary), keeps its primary border. |
| Badges, alerts | Colour unchanged; rim highlight; alerts get blur. |
| Mobile drawer scrim, dialog overlay | Frost (blur) instead of a flat dark wash. |

## Accessibility gates

At the end of `liquid-glass.css`, in this order:

1. **No `backdrop-filter` support**: fills become the solid `--gd-bg-*`
   surfaces. Translucency without blur reads as dirt.
2. **`prefers-reduced-transparency: reduce`**: solid fills, no blur, plain
   backdrop.
3. **`prefers-contrast: more`**: solid fills, `--gd-border-strong` borders,
   no sheen. Pinned in `hub/test/liquid-glass.spec.js`.
4. **`prefers-reduced-motion: reduce`**: no page-enter blur/lift, no press
   scale (`panel.css` already disables the rest).

Contrast: light fills sit at 56–82% white over a pale backdrop, and dark
fills at 52–86% over `#0b100e`. Body text keeps the panel's existing text
tokens, so contrast is the same as on solid surfaces.

The viewport follows the theme (`:root:has(.panel-frame[data-panel-theme="dark"])
{ color-scheme: dark }`), so the native scrollbar is not a white stripe on
dark glass.

## Do / don't

| Do | Don't |
|----|-------|
| Put glass on a backdrop: the panel paints one, other pages need their own. | Stack more than two glass layers; each blur multiplies GPU cost. |
| Use one of the three thicknesses. | Invent a new blur radius or fill alpha for one component. |
| Keep status colour in the content (badge, icon). | Tint a whole card amber or red to show status. |
| Add new surfaces to the selector lists of one thickness. | Hardcode `rgba(255,255,255,…)` in a page stylesheet. |

## Verification (2026-11-12)

- `npm run lint`, production build.
- `npx playwright test`: 38/38. These are the 30 existing cases plus 8 new
  ones in `liquid-glass.spec.js`:
  - glass on light and dark;
  - brand colour unchanged;
  - dark scrollbar;
  - solid fallback under more contrast;
  - public `/pricing`;
  - no overflow at 320/375px in English and Persian.
- Screenshots were inspected for the dashboard and a site page in light and
  dark at 1440px, and for the mobile dashboard at 375px.
