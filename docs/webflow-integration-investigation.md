# Webflow Frontend + Shopify Backend — Feasibility Investigation

Investigation of rebuilding the OmniFlex storefront on Webflow while keeping commerce on Shopify. Written against the current theme version (Dawn 12.0.0).

## TL;DR

A Webflow rebuild is **technically feasible but architecturally lossy**. The current theme is a heavily customized Shopify Dawn 12 build (~21K lines of Liquid, ~28K lines of JS/CSS, 60+ sections, custom 3D/video work, metaobject‑driven supplement pages, localization across 28 locales, customer account flows). Webflow is a strong page builder and CMS, but it is **not a headless Shopify rendering engine** — there is no first‑class Storefront API binding, no Liquid runtime, and no native equivalent for metaobjects, variant pickers, multi‑currency, customer accounts, or Shopify checkout extensibility.

**Recommended path** if the goal is "Webflow look & feel without losing Shopify": **Hybrid (Option B)** — Webflow for marketing/content pages on `www`, Shopify for `/products`, `/cart`, `/account`, `/checkout`. It is the only option that does not strand existing Shopify data and customer flows.

A full headless rebuild on Webflow (Option C) is possible but requires a third‑party sync layer, custom JS for cart/PDP, and is the most expensive path for the least functional gain. A pure headless rebuild without Webflow (Hydrogen/Next.js + Shopify Storefront API) is the standard industry pattern and worth weighing against any Webflow plan.

---

## 1. What we actually have today

| Surface | Implementation | Shopify dependency |
|---|---|---|
| Homepage | `templates/index.json` driving sections (video banner, video slideshow, scroll‑3D, etc.) | Low — content only |
| Marketing pages | `page.3d-landing`, `page.about-us`, `page.canvas-page`, `page.contact`, `page.default-omniflex-page` | Low — content only |
| Product listing | `main-collection-product-grid` + `facets` snippet | Medium — collection data, filters |
| Product detail | `main-product` + variant picker, swatches, sizing chart, buy buttons, related products, metafield‑driven labels | **High** — variants, inventory, metafields, line item properties |
| Supplement pages | `metaobject/supplement_page.*` templates | **High** — Shopify metaobjects |
| Cart | `cart-drawer`, `main-cart-items`, `main-cart-footer`, AJAX cart JS | **High** — Cart API |
| Checkout | Shopify-hosted | **Hard dependency** |
| Customer accounts | `templates/customers/*` (account, login, register, addresses, order, reset, activate) | **Hard dependency** — Shopify Customer Accounts |
| Search | `main-search`, `predictive-search` | Medium — Search & Discovery API |
| Localization | `locales/*` (28 base + schema files) | High — Shopify Markets |
| 3D / scroll‑video / neon cursor | Custom JS + Liquid | Low — bundle as Webflow embeds |

**Lines of code in scope for a rewrite** (rough): ~21K Liquid + ~28K CSS/JS + ~60 sections + ~36 snippets. Anything that consumes `product.metafields`, `cart`, `customer`, `shop.locale`, `recommendations`, or metaobjects is a non‑trivial port.

---

## 2. The four real architecture options

### Option A — Webflow for everything, Shopify Buy Button SDK for cart
Webflow renders all pages. Add‑to‑cart is the [Shopify Buy Button JS SDK](https://shopify.dev/docs/api/storefront/latest) injected as a custom `<script>`. Checkout pops out to Shopify's hosted checkout.

- ✅ Cheapest Shopify plan possible (Lite / Starter, ~$5–9/mo) since you don't need a theme
- ✅ All Webflow Interactions, CMS, Designer benefits
- ❌ **You lose customer accounts UI** — the Buy Button SDK does not render order history, addresses, or login. Customers would need to be redirected to Shopify's account pages on a different domain.
- ❌ **You lose Shop Pay one‑click, dynamic checkout buttons, Apple/Google Pay smart buttons** unless you also load Shopify's full storefront on at least the cart route.
- ❌ Cart drawer must be rewritten in vanilla JS against the Storefront API (Buy Button's drawer is not very themable)
- ❌ Variant pickers, swatches, related products, sizing chart, line item properties — all rebuilt by hand
- ❌ Metaobjects: no SDK support — must be fetched via Storefront API (custom JS) or duplicated in Webflow CMS
- ❌ Localization: Shopify Markets only applies at checkout. Webflow has localization (paid add‑on, ~$9–$29/mo per locale) but it does not sync to Shopify. Multi‑currency requires reading `Shop.paymentSettings.enabledPresentmentCurrencies` via Storefront API.
- ❌ SEO: collection/product pages are client-rendered → poor crawl unless you statically pre‑generate from Webflow CMS

### Option B — Hybrid: Webflow on `www`, Shopify on `shop` (RECOMMENDED)
Webflow handles the homepage, About, founder, 3D landing, blog/editorial — anything that's "marketing." Shopify keeps `/products/*`, `/collections/*`, `/cart`, `/checkout`, `/account/*` on a separate subdomain or path.

- ✅ Zero Shopify regression — variants, metaobjects, metafields, customer accounts, Markets, subscriptions, Shop Pay all keep working
- ✅ Content team gets Webflow Designer + Editor for marketing iteration speed
- ✅ Product/marketing teams can decouple deploy cycles
- ✅ SEO friendly on both halves
- ⚠️ Two CDNs, two analytics setups, two cookie domains → cross‑domain identity stitching for GA4/Shopify Customer Events. **Mitigated by sub‑option B1 below**, which collapses everything onto a single first‑party cookie domain via an edge proxy and is the recommended way to preserve attribution and SEO equity.
- ⚠️ Shared header/footer must either be duplicated across both platforms or stitched together at the edge (see below) — pure embed via iframe/script is brittle and not recommended
- ⚠️ Auth nav: "logged in as…" widget on `www` would need a small JS shim that calls Shopify Customer Account API
- 💲 Webflow CMS or Business plan ($29–$49/mo) + existing Shopify plan

#### Sub-option B1 — Reverse proxy / edge stitching (preferred for shared chrome)
A reverse proxy at the edge (Cloudflare Workers, Fly.io, Vercel rewrites, AWS Lambda@Edge) routes paths to either Webflow or Shopify origins under a single apex domain. Marketing routes (`/`, `/about`, `/founder`, `/blog/*`) proxy to Webflow; commerce routes (`/products/*`, `/collections/*`, `/cart`, `/checkout`, `/account/*`) proxy to Shopify. The Worker can also inject a single source-of-truth header/footer fragment into both responses (HTMLRewriter on Cloudflare, similar APIs elsewhere), eliminating the duplicate-chrome maintenance burden.

- ✅ Single apex domain → no cross‑cookie/auth gymnastics, GA4/Shop Pay/Customer Events behave normally
- ✅ One header/footer source of truth (hosted as a Webflow CMS item or a Worker-served fragment), injected into Shopify pages at the edge
- ✅ SEO‑clean: no client‑side redirects, search engines see a single coherent site
- ⚠️ Adds an edge service to operate (~$5–$25/mo on Cloudflare Workers for typical traffic) and a deploy step for Worker logic
- ⚠️ Shopify checkout cannot be proxied — `/checkout` must redirect to `*.myshopify.com` (or the configured checkout domain) for PCI/Shop Pay reasons

This is the more robust variant of Option B and the pattern used by most marketing-led DTC brands who want Webflow's design without splitting cookie domains. **Recommend defaulting to B1** unless ops capacity for an edge worker is a concern, in which case fall back to subdomain split with a duplicated header.

This path is what most premium DTC brands run when they want Webflow's design polish behind a Shopify backend.

### Option C — Webflow as headless frontend, Shopify as commerce API
Use a sync tool ([Udesly](https://udesly.com/), [Foxy.io](https://foxy.io/), [Webify](https://webify.app/), [Shoplift/Shoppy](https://shoplift.app/), or a custom worker) to mirror Shopify products into Webflow CMS Collections. Cart is custom JS over the Storefront API. Checkout still hands off to Shopify.

- ✅ Single Webflow domain, Webflow Designer everywhere
- ✅ CMS-templated PDP/PLP with Webflow's design system
- ❌ **All commerce UI is custom JS you maintain forever** — variant selection, inventory, swatches, related products, predictive search, facets, cart drawer
- ❌ Sync lag: product/inventory updates are not real-time. Out‑of‑stock states will drift unless you also call the Storefront API at runtime.
- ❌ Webflow CMS limits: 10,000 items on Business, 20 reference fields per collection, 30 fields per item. Variant explosions (color × size × etc.) hit these ceilings fast. **Combined with localization, this becomes a hard blocker:** if the sync mirrors one CMS item per product per locale, 28 locales × ~360 products exhausts the 10K cap. Even the Enterprise tier (typically 30K items) only buys headroom for ~1K SKUs at this locale count. For a global multi-region catalog, **Option C is effectively non‑viable on Webflow's CMS today.**
- ❌ Metaobjects: must be flattened into separate Webflow CMS collections per metaobject definition, with manual schema mapping
- ❌ Customer accounts: same problem as Option A — redirect to Shopify
- ❌ Localization: as Option A
- ❌ Shopify app ecosystem (reviews, upsell, subscriptions, bundles) mostly stops working — apps inject into Liquid/theme app extensions
- 💲 Webflow Business + sync tool (typically $20–$200/mo) + Shopify

### Option D — Drop Webflow, go fully headless
For completeness: Hydrogen (React, Shopify-native, Oxygen hosting included free with Shopify) or Next.js + Storefront API. This is what most of the "Shopify but custom frontend" market actually does. Trades visual editing for engineering velocity and 100% feature parity. Worth comparing dollar‑for‑dollar against Option C — Hydrogen is free, Webflow + sync tool is not.

---

## 3. Where Webflow specifically falls short for this site

| Feature in current theme | Webflow native? | Workaround |
|---|---|---|
| Variant pickers / swatches | No | Custom JS on Storefront API; or use Shopify-rendered iframe |
| Metaobject‑driven supplement pages | No | Mirror to Webflow CMS via sync, or fetch via Storefront API at runtime |
| Customer accounts (login/orders/addresses) | No | Redirect to Shopify subdomain |
| Multi-currency / Shopify Markets | No | Webflow Localization (separate $) — does not auto‑sync rates |
| 28 locales translation files | Partial | Webflow Localization is per-page, not key‑value; content must be rebuilt per locale |
| Cart drawer w/ line item properties, gift recipient, discounts | No | Custom JS |
| Predictive search + facets | No | Custom (Algolia / Searchanise / Shopify Search & Discovery via Storefront API) |
| Subscriptions / selling plans | No | Only renderable via Shopify checkout — must keep Shopify on PDP or use app's hosted widget |
| Shop Pay / Dynamic checkout buttons | No | Buy Button SDK approximates; loses Shop Pay autofill on non-Shopify domain |
| Metafields rendered in PDP (clothing‑features, sizing) | No | Sync layer or runtime fetch |
| Theme editor / merchandiser drag‑drop | Partial | Webflow Editor exists but is content‑only, not Shopify‑section equivalent |
| Custom 3D / scroll‑video / neon cursor JS | Yes (custom embed) | Port as Webflow custom code components |
| App ecosystem (reviews, upsell, etc.) | No | Most break; need apps with embeddable JS widgets |

---

## 4. Effort estimate (rough, for Option B Hybrid)

| Workstream | Effort |
|---|---|
| Webflow design system (typography, colors, components) | 2–3 weeks |
| Marketing page rebuild (home, about, founder, 3D landing, canvas, contact) | 3–5 weeks |
| Custom interactions port (3D showcase, neon cursor, scroll video, gradient marquee) | 2–3 weeks |
| Shared header/footer parity across Webflow + Shopify | 1–2 weeks |
| Cross‑domain analytics, consent, and auth state | 1 week |
| Shopify theme cleanup (strip marketing‑only sections) | 1 week |
| QA, SEO redirects, launch | 1–2 weeks |
| **Total** | **~11–17 weeks** with one designer + one engineer |

**This is a best‑case estimate** that assumes the 28‑locale rebuild is *not* part of the initial scope (i.e., launch in English, layer locales in later, or keep localization on Shopify). Webflow Localization is per‑page rather than key‑value, so re‑translating and QA'ing 60+ section equivalents across all 28 locales is itself a multi‑month workstream that would roughly double the timeline if pulled into v1. Recommend treating localization as a separate, post‑launch phase — or as another reason to keep the localized commerce surfaces on Shopify (Option B / B1).

Option C adds ~6–10 weeks for the commerce sync layer and custom PDP/PLP/cart.
Option A is ~Option C + customer account redirect work, but with a flat Webflow learning curve.

---

## 5. Risks and gotchas specific to this codebase

1. **Metaobjects are not portable.** `templates/metaobject/supplement_page.*` is a Shopify-only construct. Any non-hybrid option requires either keeping `/metaobjects/*` URLs on Shopify or rebuilding them as Webflow CMS collections (one per metaobject type), losing the merchandiser UX in the Shopify admin.
2. **Localization scope is large.** 28 base locales plus schema files. Webflow Localization charges per locale and bills annually; 28 locales is likely cost-prohibitive (~$250+/mo at list pricing) and would require re-translating content in Webflow.
3. **Customer account templates are non-trivial.** `customers/order.json` renders historical orders, refunds, fulfillment status — none of which is exposable outside Shopify without the Customer Account API and a custom React/JS app. Hybrid (Option B) avoids this by leaving `/account/*` on Shopify.
4. **Theme app extensions break.** Any Shopify app injecting blocks via app embeds (reviews, upsells, A/B testing, klaviyo forms, etc.) needs to be re-evaluated. Many vendors offer Webflow embeds, but not all.
5. **Discount UX.** Automatic discounts and Shopify Functions only render at checkout — they will work. But cart-page badges showing "you saved $X" are theme-rendered today and won't appear in a Webflow cart UI without custom code.
6. **SEO migration.** Existing collection/product URLs use Shopify's standard path structure (`/products/<handle>`, `/collections/<handle>`). Hybrid (B/B1) keeps these stable; Option C requires a full 301 redirect plan. Even under Hybrid, any restructuring of marketing pages on the apex domain (homepage, about, blog) still needs its own 301 map — don't assume "Hybrid = no redirects."
7. **Performance.** Shopify CDN + Liquid SSR is fast. Webflow + client‑side cart calls add round trips and tank Lighthouse on PDP. Plan for skeleton states.

---

## 6. Recommendation

1. **If the goal is faster marketing iteration and design polish:** Option B (Hybrid). Lowest risk, highest preservation of existing investment, production‑proven pattern.
2. **If the goal is "everything in Webflow":** Option C is the only way, but evaluate Hydrogen (Option D) first — it's free, Shopify‑native, and most teams that try Webflow‑as‑headless eventually migrate to a real headless framework.
3. **Avoid Option A** unless OmniFlex is willing to accept downgraded checkout + no in-site customer accounts.

Suggested next step: scope a 2‑week spike on Option B with one Webflow page (e.g., the About/Founder page) and a shared header rebuild, to validate cross‑domain analytics, design fidelity, and content workflow before committing to a full migration.

---

## Appendix — Source material consulted

- Repo: `sections/`, `snippets/`, `templates/`, `assets/`, `locales/`, `config/`, `layout/`
- Theme base: Shopify Dawn 12.0.0 (`Dawn-12.0.0.zip` in repo root)
- Custom templates: `templates/page.*.json`, `templates/product.*.json`, `templates/metaobject/supplement_page.*.json`
- Shopify dependencies surfaced via grep for `metaobject`, `metafield`, `customer`, `cart`, `selling_plan`
