# Headless Webflow + Shopify — Proof of Concept

A working scaffold that demonstrates Option C from `docs/webflow-integration-investigation.md`: Webflow as the rendering frontend, Shopify as the commerce backend, talking via the Shopify Storefront API, with a one‑way sync that mirrors the product catalog into Webflow CMS so Webflow Designer can build CMS‑templated pages.

## Architecture

```
                            ┌────────────────────────────────────┐
                            │           Webflow site              │
                            │                                     │
   designer-built pages ──> │  CMS-templated PDP / PLP            │
                            │  (uses Webflow CMS items as layout) │
                            │                                     │
                            │  + omniflex-headless.js (mounted)   │
                            └────────┬────────────────────────────┘
                                     │  live cart, variant lookup,
                                     │  inventory via fetch() →
                                     ▼
                            ┌────────────────────────────────────┐
                            │   Shopify Storefront API (public)   │
                            │   shopify.com/api/<v>/graphql.json  │
                            └────────────────────────────────────┘
                                     ▲                           ▲
                                     │ checkoutUrl redirect       │ Admin API
                                     │                           │ (private)
   customers ────────────────────────┘                           │
                                                                 │
                            ┌────────────────────────────────────┴───┐
                            │  sync.mjs (Node / Cloudflare Worker)    │
                            │  Shopify products → Webflow CMS items   │
                            │  (cron, webhook-driven, or manual)      │
                            └─────────────────────────────────────────┘
```

## What's in the box

| File | Purpose |
|---|---|
| `omniflex-headless.js` | Single ES module loaded by Webflow. Auto-mounts on `data-of-*` attributes for PDP, PLP, cart drawer, add-to-cart. Exposes a `window.OmniFlex` API for ad-hoc page-level scripts. |
| `omniflex-headless.css` | Minimal default styles. Class names are namespaced `of-*` so Webflow CSS can override. |
| `webflow-embeds/site-wide-head.html` | The script + style tags + config `<meta>`s to paste into Webflow's site-wide custom code. |
| `webflow-embeds/pdp-template.html` | Snippet for the Webflow Products CMS Template Page. |
| `webflow-embeds/plp-template.html` | Two PLP variants — CMS-bound or script-rendered. |
| `webflow-embeds/cart-icon.html` | Cart toggle attributes for the header. |
| `sync/sync.mjs` | Node 20+ script that mirrors Shopify products into a Webflow CMS Collection. |
| `sync/.env.example` | Required env vars for the sync. |
| `webflow-setup.md` | Step-by-step setup walkthrough. |

## Quickstart

1. Read `webflow-setup.md` once end-to-end before clicking anything.
2. Create the Shopify Storefront and Admin API tokens.
3. Create the Webflow site + Products CMS collection with the field schema in §3 of the setup guide.
4. Paste `webflow-embeds/site-wide-head.html` into Webflow's site-wide custom code, with your shop domain and Storefront token filled in.
5. Run the sync:
   ```bash
   cd headless-poc/sync
   cp .env.example .env  # fill in tokens
   npm run sync:dry       # preview changes
   npm run sync           # write to Webflow
   ```
6. Add `data-of-product="{{ Slug }}"` to a div on the Products CMS template page and publish.
7. Add a header cart link with `data-of-cart-toggle` and a `<span data-of-cart-count>`.
8. Open the staging URL, add a product to cart, click checkout, complete a Bogus-Gateway test order.

## What's intentionally out of scope (for now)

| Concern | Plan |
|---|---|
| Customer accounts (login/orders) | Redirect to Shopify on a separate route. The Customer Account API requires its own OAuth dance and a custom React-ish app to render. |
| Multi-currency / Markets | Storefront API supports `@inContext(country: ...)` directives. Add country detection + presentment-currency handling once the single-locale flow is solid. |
| Predictive search / facets | Replace with Algolia / Searchanise / Shopify Search & Discovery extension. |
| Subscriptions / selling plans | Renders only at Shopify checkout — works as long as the redirect to `checkoutUrl` is preserved. The drawer does not yet show selling-plan UI. |
| Webhook-driven sync | Today the sync polls. Migrate to Shopify webhooks (`products/update`, `inventory_levels/update`) hitting a Cloudflare Worker for near-real-time. |
| Cart line item properties / gift recipient | Not yet wired in `addLine`. The Storefront API supports `attributes` on `CartLineInput` — easy add. |
| Build pipeline / minification | Script ships as readable ES2022 from the repo. For production, bundle + pin to a commit SHA on jsDelivr. |

## Known limits and gotchas

1. **Live inventory is fetched at PDP load**, not from Webflow CMS. The synced `in-stock` field is a coarse boolean useful only for filtering in PLP queries.
2. **Webflow CMS caps at 10K items**. With 28 locales × N products this becomes a hard ceiling — this PoC syncs a single locale; multi-locale would require either a separate Webflow site per locale or storing all locales in one item with locale-keyed fields.
3. **Checkout always redirects to Shopify** (`*.myshopify.com/checkout` or your configured checkout domain). This is not optional with the Storefront API and is a feature, not a bug — Shopify Functions, Shop Pay, fraud rules, and tax all live there.
4. **The script is unminified** and served from jsDelivr against a branch. **Pin to a commit SHA** before any production traffic, otherwise a future commit on the branch will silently change the production storefront.
5. **No SSR**: pages are crawled by Googlebot client-side. Shopify metadata for SEO (price, availability via `Product` JSON-LD) needs to be emitted by the script as a `<script type="application/ld+json">` injection. Not yet wired.
6. **No tests**: this is a PoC. A production rollout needs Playwright tests at minimum on the add-to-cart and checkout-redirect paths, plus a sync dry-run smoke test in CI.

## Validating end-to-end

I (Claude) cannot validate this against a real Webflow site or real Shopify store from this session — the code is unrun. Before declaring the PoC working you'll need to:

- [ ] Sync runs without errors against a live Webflow CMS collection
- [ ] PDP loads a real Shopify product on a Webflow staging URL
- [ ] Variant selection updates price and add-to-cart variant ID
- [ ] Add to cart populates the drawer and persists across page reload
- [ ] Checkout link redirects to Shopify's hosted checkout with the cart contents intact
- [ ] A Bogus-Gateway test order completes and appears in Shopify orders

Once those check out, the next iteration is wiring the rest of the catalog (search, account redirect, multi-currency) and replacing polling sync with webhooks.
