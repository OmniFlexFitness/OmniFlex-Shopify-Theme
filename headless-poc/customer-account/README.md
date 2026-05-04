# Customer Account API integration

Customer login, "my account" greeting, and order history — all powered by Shopify's Customer Account API (the post-2024 replacement for Storefront API customer fields).

## Why this is its own module

- The Customer Account API is a **separate API endpoint** from the Storefront API and uses a separate auth model (OAuth 2.0 + PKCE).
- It is mandatory for any flow that depends on the customer's identity — including matching orders, addresses, or purchase history. The legacy Storefront customer fields are deprecated.
- It opens a popup-or-redirect to a Shopify-hosted login page (the same one Shop Pay uses), so customers reuse their existing Shop credentials. There is no password stored in the Webflow site.

## Required Shopify config

1. Shopify admin → **Settings** → **Customer accounts** → **Settings** → switch to **New customer accounts** if not already
2. Shopify admin → **Hydrogen → Customer Account API** OR via the [Headless Storefront app](https://apps.shopify.com/headless), enable **Customer Account API**
3. Configure the **Application URL** as `https://www.<your-webflow-site>` and the **Callback URI** as `https://www.<your-webflow-site>/account/callback`
4. Note the **Customer Account API client ID** (starts with `shp_`) and the **Shop ID** (numeric, in the URL when viewing settings, or via Admin API `shop { id }`)

## Webflow setup

1. Create three pages in Webflow:
   - `/account` — has elements with `data-of-account-login` and `data-of-account-orders` attributes
   - `/account/callback` — must contain a single element with `data-of-account-callback`. The OAuth redirect lands here.
   - (Optional) `/account/login` — a button with `data-of-account-login-btn` for explicit login entry points
2. Add to **Site Settings → Custom Code → Inside `<head>`** (in addition to the storefront tags):
   ```html
   <meta name="of-account-shop-id"      content="123456789">
   <meta name="of-account-client-id"    content="shp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx">
   <meta name="of-account-redirect-uri" content="https://www.<your-webflow-site>/account/callback">

   <script type="module"
     src="https://cdn.jsdelivr.net/gh/OmniFlexFitness/OmniFlex-Shopify-Theme@<sha>/headless-poc/customer-account/customer-account.js"></script>
   ```
3. Publish to a real domain. **The callback URI must match the publicly reachable URL exactly**, including protocol and any trailing slash. The Shopify webflow.io subdomain is fine for development; production should be on a custom domain so the callback matches.

## What's exposed

- `data-of-account-login` element → renders "Log in" or "Hi <first name>" + "Log out" depending on auth state
- `data-of-account-orders` element → renders the customer's last 25 orders (paginated via the Customer Account API)
- `window.OmniFlexAccount.login()` / `.logout()` / `.getToken()` / `.customerGql(query, vars)` for ad-hoc page scripts (e.g. checking auth state in a header)

## Security notes (read before production)

1. **Tokens are stored in `localStorage`.** This is acceptable for a CMS-only Webflow site because there is no server-side rendering and no backend that could put them in `httpOnly` cookies. **For higher security postures (regulated industries, PCI scope), proxy the OAuth callback through a Cloudflare Worker that issues an `httpOnly` session cookie and proxies subsequent Customer Account API requests.** This module does not do that.
2. **PKCE is mandatory** — Shopify's Customer Account API rejects the implicit flow. The module generates a fresh verifier per login and validates `state` to prevent CSRF.
3. **Tokens expire in ~1 hour.** The module currently does not auto-refresh; the customer is silently logged out and prompted to log in again. Refresh-token handling is a sensible v2 addition.
4. **Logout calls Shopify's `oauth/logout` endpoint** so Shop Pay-linked sessions are also cleared. Without this, signing out of Webflow would leave the customer signed into Shop Pay on shopify.com.

## Coexistence with the Storefront client

The two modules are independent — neither requires the other. The login button can sit on a Webflow page that has no products, and the storefront client can render PDPs without ever loading this module. Recommended pattern: include both site-wide so the header shows live cart count *and* live login state on every page.

## What's NOT included in this PoC

- Address book CRUD (the Customer Account API has full mutations; UI not built)
- Editing customer profile (first/last name, default address)
- Re-order from order detail
- Order cancellation / refund request
- Password reset / email verification flows (these are Shopify-hosted on the OAuth screens — no work needed)

These are all straightforward extensions of `customer-account.js` once the OAuth flow is verified end-to-end.
