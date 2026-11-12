# Theme Check baseline

Snapshot of every Theme Check **error** on `main` before Theme Check becomes a
blocking CI gate. Today the `Theme Check` step in
`.github/workflows/theme-check.yml` runs with `continue-on-error: true`, so new
Liquid errors are reported but never block a merge.

## How this was captured

- Date: 2026-11-12, branch `chore/ci-hardening` (theme files identical to `main` at `5a54b9d`)
- Tool: Shopify CLI 5.0.1, config `.theme-check.yml` (MatchingTranslations disabled, `headless-poc/**` ignored)
- Command:

```bash
shopify theme check --fail-level error --output json
```

- Result: `valid: false`, **19 errors**, 63 warnings, 0 info. Exit code 1.
- Line numbers are the `startRow` values Theme Check reports; spot-checked against the source.

To refresh the numbers, rerun the command above and compare `errorCount`.

## Errors by check

| Check | Errors | Files | Real defect? |
|---|---:|---|---|
| UnknownFilter | 4 | `sections/about-founder.liquid`, `sections/obsidian-markdown.liquid`, `snippets/obsidian-markdown-renderer.liquid` (2) | Yes. `to_string` and `markdownify` are not Shopify Liquid filters; `placeholder_svg` should be `placeholder_svg_tag`. |
| ParserBlockingScript | 3 | `sections/custom-slideshow-banner.liquid` (2), `sections/interactive-banner.liquid` (1) | Yes (performance). jQuery 3.6.0, Slick 1.8.1 and `iwb-shaders.js` block HTML parsing. |
| ValidSchemaName | 3 | `sections/floating-3d.liquid`, `sections/gradient-marquee.liquid`, `sections/scroll-3d-showcase.liquid` | Yes. Section names exceed the 25-character limit. |
| LiquidSyntaxError | 2 | `sections/rotating-featured-product.liquid` (2) | Yes. Liquid has no parentheses in `if`, so `and (a or b)` does not evaluate as written. |
| LiquidHTMLSyntaxError | 2 | `sections/rotating-featured-product.liquid` (2) | Same two lines as above (one root cause, two checks). |
| ValidSchemaTranslations | 2 | `sections/featured-product.liquid` (2) | Yes. Two `t:` keys are missing from `locales/en.default.schema.json`. |
| ImgWidthAndHeight | 1 | `sections/rotating-featured-product.liquid` | Yes (layout shift / CLS). |
| ValidSchema | 1 | `sections/neon-cursor-hero.liquid` | Yes. Range `step` 0.05 is not a multiple of 0.1. |
| MissingAsset | 1 | `sections/about-founder.liquid` | Yes. `assets/section-image-with-text.css` does not exist, so every page with this section requests a 404. |
| **Total** | **19** | 9 files | |

## Every error

| Check | File | Line | Message |
|---|---|---:|---|
| ImgWidthAndHeight | `sections/rotating-featured-product.liquid` | 228 | Missing width and height attributes on img tag |
| LiquidHTMLSyntaxError | `sections/rotating-featured-product.liquid` | 48 | Syntax is not supported |
| LiquidHTMLSyntaxError | `sections/rotating-featured-product.liquid` | 173 | Syntax is not supported |
| LiquidSyntaxError | `sections/rotating-featured-product.liquid` | 48 | Syntax error in 'if' tag |
| LiquidSyntaxError | `sections/rotating-featured-product.liquid` | 173 | Syntax error in 'if' tag |
| MissingAsset | `sections/about-founder.liquid` | 1 | 'assets/section-image-with-text.css' does not exist |
| ParserBlockingScript | `sections/custom-slideshow-banner.liquid` | 194 | Avoid parser blocking scripts by adding `defer` or `async` on this tag |
| ParserBlockingScript | `sections/custom-slideshow-banner.liquid` | 195 | Avoid parser blocking scripts by adding `defer` or `async` on this tag |
| ParserBlockingScript | `sections/interactive-banner.liquid` | 10 | Avoid parser blocking scripts by adding `defer` or `async` on this tag |
| UnknownFilter | `sections/about-founder.liquid` | 27 | Unknown filter 'placeholder_svg' used. |
| UnknownFilter | `sections/obsidian-markdown.liquid` | 16 | Unknown filter 'to_string' used. |
| UnknownFilter | `snippets/obsidian-markdown-renderer.liquid` | 6 | Unknown filter 'to_string' used. |
| UnknownFilter | `snippets/obsidian-markdown-renderer.liquid` | 16 | Unknown filter 'markdownify' used. |
| ValidSchema | `sections/neon-cursor-hero.liquid` | 335 | Value is not divisible by 0.1. |
| ValidSchemaName | `sections/floating-3d.liquid` | 150 | Schema name 'OmniFlex 3D - Floating Objects' is too long (max 25 characters) |
| ValidSchemaName | `sections/gradient-marquee.liquid` | 205 | Schema name 'OmniFlex 3D - Gradient Marquee' is too long (max 25 characters) |
| ValidSchemaName | `sections/scroll-3d-showcase.liquid` | 202 | Schema name 'OmniFlex 3D - Scroll Showcase' is too long (max 25 characters) |
| ValidSchemaTranslations | `sections/featured-product.liquid` | 743 | 't:sections.main-product.blocks.icon_with_text.settings.content.label' does not have a matching entry in 'locales/en.default.schema.json' |
| ValidSchemaTranslations | `sections/featured-product.liquid` | 744 | 't:sections.main-product.blocks.icon_with_text.settings.content.info' does not have a matching entry in 'locales/en.default.schema.json' |

## Warnings (not blocking at `--fail-level error`)

Listed for context only. They do not fail the job at the current fail level.

| Check | Count | Files |
|---|---:|---:|
| OrphanedSnippet | 38 | 38 |
| RemoteAsset | 6 | 3 |
| UndefinedObject | 5 | 4 |
| UnusedAssign | 4 | 4 |
| DeprecatedFilter | 4 | 2 |
| DeprecatedFontsOnSectionsAndBlocks | 3 | 1 |
| VariableName | 2 | 2 |
| LiquidComplexity | 1 | 1 |
| **Total** | **63** | |

## Plan to make Theme Check blocking

All 19 errors point at real defects, so the plan is to **fix all of them and
disable none**. Disabling a check would hide the same class of bug in new code.

### Step 1: fix PR `fix(theme): clear Theme Check baseline errors`

Constraints: do not edit `config/settings_data.json`, `templates/*.json` or
`sections/*-group.json` (owned by the Shopify GitHub integration). Every fix
below stays inside `sections/`, `snippets/`, `assets/` or `locales/*.schema.json`.

| Check | Fix | Storefront risk |
|---|---|---|
| LiquidSyntaxError / LiquidHTMLSyntaxError | Split `rotation_mode == 'scroll' and (has_model or has_rotation)` into an `assign` (for example `assign has_motion = false`, then set it true if either flag is set) and test `rotation_mode == 'scroll' and has_motion`. | Changes behavior on purpose: the scroll container currently renders under the wrong condition. Verify on a preview theme. |
| UnknownFilter | Remove `to_string` (no-op on strings). Replace `markdownify` with a real approach (render rich text from a `richtext` setting, or pre-render HTML into a metafield). Change `placeholder_svg` to `placeholder_svg_tag`. | `markdownify` currently outputs nothing useful, so the Obsidian markdown section needs a product decision on the replacement. |
| MissingAsset | Point `about-founder.liquid` at `component-image-with-text.css` (exists) or drop the tag. | Low. Removes a 404. |
| ValidSchemaName | Shorten to 25 characters or fewer, for example `3D Floating Objects`, `3D Gradient Marquee`, `3D Scroll Showcase`. ASCII only. | Editor label only. Saved section data is keyed by type, not name. |
| ValidSchema | Change `cursor_light_intensity` `step` from 0.05 to 0.1. The only saved value (`templates/page.3d-landing.json`, 1.0) is already a multiple of 0.1, so no template edit is needed. | Low. Merchants lose 0.05 granularity. |
| ValidSchemaTranslations | Add `sections.main-product.blocks.icon_with_text.settings.content.label` and `.info` to `locales/en.default.schema.json` (copy wording from upstream Dawn 15.4.1). | None. Editor text only. |
| ImgWidthAndHeight | Add `width` and `height` from `image.width` / `image.height`. | Low. Reduces CLS. |
| ParserBlockingScript | Add `defer` to `iwb-shaders.js`, jQuery and Slick, and make the inline init code wait for `DOMContentLoaded`. Longer term, replace Slick + jQuery with the native Dawn slideshow. | Medium. Inline scripts that call `$` or `slick` immediately will break if not wrapped. Test both sections on a preview theme. |

Done when `shopify theme check --fail-level error` exits 0 locally and in CI.

### Step 2: make the gate blocking (same PR or a one-line follow-up)

1. In `.github/workflows/theme-check.yml`, delete `continue-on-error: true` from
   the `Theme Check` step and drop "(advisory ...)" from the step name.
2. In GitHub branch protection for `main`, mark the `Shopify Theme Check` job as
   a required status check.
3. Update this file: record the date the gate went live and set the baseline to 0.

### Optional step 3: tighten later

Once errors stay at 0, consider `--fail-level warning` after clearing the 63
warnings above. `OrphanedSnippet` (38) is the bulk; most are Dawn snippets the
fork no longer renders and can be deleted or kept with a documented ignore.
