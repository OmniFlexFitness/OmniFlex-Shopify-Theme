# Local preview

Static HTML harness that simulates a Webflow site with the headless script mounted, so you can iterate on the appearance and behavior **without paying for Webflow yet**. The same `data-of-*` markup conventions you'll use in Webflow Designer work here verbatim.

## What's in here

| Page | Demonstrates |
|---|---|
| `index.html`       | Header with cart toggle, links to the other pages. Stand-in for the Webflow homepage. |
| `product.html`     | PDP — variant picker, price, add-to-cart, JSON-LD injection. Handle is editable in-page. |
| `collection.html`  | PLP — script-rendered grid for a Shopify collection handle. |
| `search.html`      | Predictive search input with live Storefront API results. |

The cart drawer is shared across all pages (it's injected once into `<body>` by the script).

## Prerequisites

You need a **Shopify Storefront API public access token**. Same token used in the Webflow setup — see `../webflow-setup.md` § 1. The token is designed to be public; it's safe in client code. Just don't commit it to a public repo.

You do **not** need a Webflow account, an Admin API token, or the sync script for the local preview. It talks directly to Shopify.

## Run it

The pages reference `../omniflex-headless.js` and `../omniflex-headless.css` by relative path, so the document root must be `headless-poc/`. Any static HTTP server works; pick whichever you have:

```bash
# Option 1 — Python (already installed on macOS/Linux)
cd headless-poc
python3 -m http.server 8000

# Option 2 — Node
cd headless-poc
npx --yes serve -l 8000 .

# Option 3 — PHP (if you have it lying around)
cd headless-poc
php -S localhost:8000
```

Then open <http://localhost:8000/local-preview/>.

> **Don't open the HTML files with `file://`** — fetch() and ES modules are blocked by the browser under `file://` for CORS reasons. You'll see "Storefront API 0" or "Failed to fetch" in the console.

## Configure the token

Two ways. Pick one.

### A. Quick: edit the meta tags in each HTML file

Open `index.html`, `product.html`, `collection.html`, `search.html` and replace:

```html
<meta name="of-shop"  content="REPLACE_WITH_YOUR.myshopify.com">
<meta name="of-token" content="REPLACE_WITH_PUBLIC_STOREFRONT_TOKEN">
```

### B. Cleaner: use `config.local.js` (gitignored)

```bash
cp config.local.example.js config.local.js
# edit config.local.js with your shop + token
```

This file is already in `.gitignore`, so accidental commits are blocked. The HTML pages load it via `<script src="./config.local.js" onerror="void 0">` — a 404 is silently ignored if you skip this step.

## What you should see

1. Visit <http://localhost:8000/local-preview/> → header with cart, three navigation cards
2. Click **Product page** → enter a real product handle from your store → click **Load** → variant picker and price render
3. Click **Add to cart** → cart drawer slides in from the right with the line item
4. The header **Cart 1** badge updates live
5. Reload the page → cart count is preserved (localStorage)
6. Click the drawer's **Checkout** link → opens `*.myshopify.com/checkouts/<id>` in a new tab (your real Shopify-hosted checkout)
7. Visit **Search**, type a query → live predictive search results

If any step fails, open DevTools → Console. Common failures:
- **`Storefront API 401`**: wrong token, or token belongs to a different store
- **`Storefront API 403`**: the Storefront app is missing a scope — go back to `../webflow-setup.md` § 1
- **CORS error**: you opened the HTML via `file://`. Run a server.
- **`product` returns null**: the handle in the input doesn't exist in your store

## Hot-reload

The simple HTTP servers above don't auto-refresh on file edits. If you want hot reload, use `npx --yes browser-sync start --server . --files "**/*.{js,css,html}"` from `headless-poc/` — but it's not necessary for casual iteration since `Cmd-R` after a save is fine.

## Mapping local preview → Webflow

When the local pages look right, recreate them in Webflow:

| Local element | Webflow equivalent |
|---|---|
| `<a data-of-cart-toggle>` in `demo-header` | A Link Block in the Webflow header with the `data-of-cart-toggle` custom attribute |
| `<div data-of-product="...">` on `product.html` | A Div Block on the Products CMS Template Page with `data-of-product` bound to the **Slug** field |
| `<div data-of-collection="...">` on `collection.html` | Either an embed (script-rendered) or a Webflow CMS Collection List bound to the synced Products collection |
| `<div data-of-search>` on `search.html` | An HTML Embed in the Webflow header |

The script does not care whether the markup came from Webflow or from these local files — it scans for `data-of-*` attributes either way. That's what makes this preview faithful.

## Limits of the local preview

- **No Webflow Designer styles**: this harness uses a tiny `demo.css` for chrome (header, banner). Once you build the design in Webflow, the actual styles will come from there.
- **No customer accounts**: the OAuth callback URL must be a real public URL Shopify can redirect to. Use `ngrok http 8000` if you need to test the OAuth flow locally — set the `of-account-redirect-uri` meta to the ngrok URL and add it to the Shopify Customer Account API allowed redirect URIs.
- **No CMS sync**: the polling sync (`sync/sync.mjs`) and the webhook worker only matter once you have a real Webflow site. They're irrelevant for this local harness.
