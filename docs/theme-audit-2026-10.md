# OmniFlex Shopify Theme — Deep Audit (2026-10-15)

Time-boxed inventory feeding the cyber-pastel reskin and the week-1 headless decision gate. Baseline: Dawn 12.0.0 (`Dawn-12.0.0.zip` in repo root).

## Scale vs Dawn baseline

| Surface | Dawn 12.0.0 | OmniFlex current | Delta |
|---------|-------------|------------------|-------|
| Sections | 53 | 69 | +16 custom |
| Snippets | 69 | 38 | −31 (consolidated / removed) |
| Assets | 114 | 210 | +96 |
| Locales | — | 57 files | Markets + schema pairs |
| Templates | — | 22 top-level + metaobject supplement pages | Custom marketing + PDP variants |

## OmniFlex-custom sections (not in Dawn)

- `neon-cursor-hero.liquid` + `section-neon-cursor-hero.css` / `neon-cursor-hero.js`
- `scroll-3d-showcase.liquid` + CSS/JS
- `floating-3d.liquid` + CSS/JS
- `scroll-video.liquid` + CSS/JS
- `gradient-marquee.liquid` + CSS/JS
- `scrolling-text-divider.liquid` (cyber divider) + CSS
- `video-banner.liquid`, `video-slideshow.liquid` (heavily customized)

## Design tokens found in CSS (hex)

Neon noir core (keep as base):

| Token role | Hex | Where |
|------------|-----|-------|
| Ink / void | `#07041f` | neon hero, scroll-3d |
| Neon cyan | `#0aeaed` | neon hero, scroll-3d |
| Neon magenta | `#fa0dfd` | neon hero, scroll-3d |
| Deep purple | `#210f61` | neon hero |
| Hot pink (generic glow default) | `#ff2d55` | cyber-divider CSS + schema defaults |
| Electric blue accents | `#00a3ff`, `#63b5ff`, `#6cb0ff`, `#72d5ff` | misc |

Cyber pastel candidates already present (soften layer):

| Hex | Notes |
|-----|-------|
| `#b9b0ff`, `#d6b9ff`, `#7f9cf5` | lavender / periwinkle |
| `#8bffc9` | mint |
| `#c9d6ff`, `#d6e4ff`, `#e6f0ff`, `#f2f5ff` | ice blues |
| `#a0a8c3` | mute steel |

**Decision applied in reskin:** introduce `assets/omniflex-tokens.css` as the single source for neon noir + cyber pastel; neon sections read from `--of-*` tokens; divider glow tracks element text/primary color instead of a generic pink.

## Glow bug class

`assets/section-scrolling-text-divider.css` defaulted `--cd-glow-color: #ff2d55` independent of `--cd-text-color` / `--cd-bg`. Schema `glow_color` default was the same pink. Result: white (or custom) text with mismatched pink glow — same defect class called out for OmniTask UX.

**Fix:** glow derives from `text_color` (element primary for the text glow); CSS fallback is `var(--cd-text-color)`.

## Performance / asset notes

Largest theme assets (repo, not CDN-compressed):

| Asset | ~KB |
|-------|-----|
| `sparkle.gif` | 175 |
| `base.css` | 82 |
| `global.js` | 44 |
| `iwb-shaders.js` | 35 |
| `section-main-product.css` | 33 |
| `scroll-3d-showcase.js` | 17.5 |
| `neon-cursor-hero.js` | 13.4 |

Recommendations (not blocking reskin): compress/replace `sparkle.gif`; code-split 3D/shader JS behind section presence; Lighthouse against a Shopify preview theme after reskin.

## Price ($60 → $45)

No `$60` / `60.00` hardcoded in theme Liquid/JSON as product price. Product price lives in **Shopify Admin**.  
Hardcoded marketing price found: `templates/index.json` → `custom_price: "$99.00"` (featured block). Verify in theme editor whether that block is live; update or remove if it refers to Zenith.

Locale string scan: no stale `$60` product copy found in `locales/*` during this audit.

## Headless / Webflow gate (from prior docs)

- [docs/webflow-integration-investigation.md](webflow-integration-investigation.md) recommends **Option B / B1** (Webflow marketing + Shopify commerce, edge stitch).
- [headless-poc/repo-strategy.md](../headless-poc/repo-strategy.md) says split `headless-poc/` into `omniflex-storefront-headless` only after staging is real.
- **Gate after reskin ships:** stay on Liquid (if cyber-pastel + 3D sections are enough) vs start Webflow hybrid. Do not split the PoC repo before that call.

## Dev-flow constraint

Shopify GitHub integration auto-commits `main` from the online editor. All engineering work stays on `feature/*` branches with unpublished preview themes. Never hand-edit the live published theme in the online editor for engineering changes.
