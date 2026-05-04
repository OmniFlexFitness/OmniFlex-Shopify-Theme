# Webflow Setup Walkthrough

End‑to‑end steps to wire a Webflow site to Shopify using this PoC. Allow ~2 hours the first time.

## 0. Prerequisites

- A Shopify store where you are an admin (e.g. `omniflexfitness.myshopify.com`)
- A Webflow site (free Starter plan is fine for setup; a paid CMS plan is required to publish CMS-templated pages)
- Node.js ≥ 20 locally for the sync script

## 1. Create a Shopify Storefront API token (public)

This token is **safe to put in client-side HTML** — it's the public token Shopify designs for headless storefronts.

1. In Shopify admin → **Settings** → **Apps and sales channels** → **Develop apps** → **Create an app**
2. Name it `Webflow Headless Storefront`
3. Configure **Storefront API access** with these scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_read_product_tags`
   - `unauthenticated_write_checkouts`
   - `unauthenticated_read_checkouts`
   - `unauthenticated_write_customers` (only if you plan to add a customer login flow)
4. **Install app** → copy the **Storefront API access token** (starts with `shpat_...` for older keys or a newer prefix for current ones)

## 2. Create a Shopify Admin API token (private)

This is for the sync script only. **Never put this in client code.**

1. Same app from step 1 → **Configuration** → **Admin API integration**
2. Scopes: `read_products`, `read_inventory`, `read_product_listings`
3. Reveal and copy the **Admin API access token**

## 3. Create the Webflow site + CMS collection

1. In Webflow, create a new site (or use an existing one)
2. **CMS** → **Create new collection** → name it `Products`
3. Add these fields **(field slugs must match exactly)**:
   | Field name      | Type       | Slug             | Required |
   |---|---|---|---|
   | Name            | Plain text | `name`           | yes |
   | Slug            | Plain text | `slug`           | yes |
   | Shopify ID      | Plain text | `shopify-id`     | yes |
   | Handle          | Plain text | `handle`         | no  |
   | Description     | Rich text  | `description`    | no  |
   | Price           | Number     | `price`          | no  |
   | Currency        | Plain text | `currency`       | no  |
   | Featured image  | Image      | `featured-image` | no  |
   | In stock        | Switch     | `in-stock`       | no  |
4. Create the **Template Page** for this collection. It will be the PDP. Drop in the contents of `webflow-embeds/pdp-template.html` as an HTML embed and bind the `data-of-product` attribute to the CMS slug.

## 4. Generate a Webflow API token

1. Webflow → **Workspace settings** → **Integrations** → **API access** → **Generate API token**
2. Permissions: `CMS: read+write`, `Sites: read+write` (the `Sites` scope is only needed if you want the sync script to publish items live; otherwise read-only is fine and items will save as drafts).
3. Note the **Site ID** (in Webflow project settings) and the **Collection ID** (Designer → CMS panel → collection settings).

## 5. Configure the static script

Edit `webflow-embeds/site-wide-head.html`:
- Set the `of-shop` meta to your `*.myshopify.com` domain
- Set the `of-token` meta to the **Storefront API public token** (from step 1)
- Confirm the `<script>` and `<link>` URLs point at the right branch/commit. **Production should pin to a commit SHA**, not a branch.

Paste the file's contents into:
**Webflow → Site Settings → Custom Code → Inside `<head>` tag**

Save. Publish to staging.

## 6. Add cart UI to the site

1. In the Webflow Designer header, drag in a **Link Block** for the cart icon
2. Add custom attributes to the link: `data-of-cart-toggle` (no value) and a child `<span>` with attribute `data-of-cart-count`
3. Reference: `webflow-embeds/cart-icon.html`

The drawer itself is injected into the DOM at runtime — you don't need to design it in Webflow. Once the basic flow works, you can override the `.of-drawer__*` styles in your global CSS in Webflow to match the brand.

## 7. Wire up PDP

On the CMS Template Page for **Products**:
1. Drag a **Div Block** where the product UI should appear
2. Open custom attributes → add `data-of-product` with value bound to the CMS field **Slug** (use the Webflow field-binding picker, not a literal)
3. Publish to staging

Open `https://yoursite.webflow.io/products/<some-handle>` — the script should fetch the live Shopify product and render the variant picker.

## 8. Wire up PLP

Choose ONE approach:

**A. Use Webflow CMS Collection List** (recommended, fully Webflow-designed):
- Drag a Collection List bound to `Products`
- Inside each card add a button with attributes `data-of-add-to-cart` + `data-of-handle="{{ Slug }}"`
- Bind name, image, price to the CMS fields synced by the script

**B. Script-rendered grid** (quick start):
- Drop an embed: `<div data-of-collection="all" data-of-limit="24"></div>`

## 9. Run the sync

```bash
cd headless-poc/sync
cp .env.example .env
# fill in tokens
npm run sync:dry      # preview changes
npm run sync          # one-shot sync
npm run sync:watch    # poll every 5 minutes
```

For production, deploy as a Cloudflare Worker on a Cron Trigger (every 10–15 min) or a Render/Railway cron job. Webhook-driven sync (Shopify product/update webhook → sync handler) is the next iteration.

## 10. Test the full flow

1. Visit a PDP on staging → pick a variant → **Add to cart**
2. Cart drawer opens, line item appears
3. **Checkout** → redirects to `*.myshopify.com/checkout` (Shopify-hosted)
4. Complete a test order with a Bogus Gateway payment

If steps 1–4 all succeed, the headless loop is working end-to-end.

## Common issues

- **CORS error in browser console**: check the Storefront token is correct and the app from step 1 is installed.
- **`product` returns null**: the handle in `data-of-product` does not match a Shopify handle. Webflow field binding must point at the synced `slug` field, which the sync script copies from `product.handle`.
- **Sync script 401**: regenerate the Webflow token with `CMS: read+write`.
- **Sync runs but PDP renders "Product not found"**: the storefront token in the `<meta>` is wrong, or the Shopify app from step 1 wasn't given the `unauthenticated_read_product_listings` scope.
- **Variants out of stock when they shouldn't be**: live inventory comes from Storefront API, not the synced CMS items. The CMS `in-stock` field is a coarse "any inventory > 0" flag for use in PLP filtering only.
