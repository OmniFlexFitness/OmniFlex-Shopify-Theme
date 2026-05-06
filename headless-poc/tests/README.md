# End-to-end tests

Playwright suite that exercises the headless storefront against a live staging Webflow site. Tests are skipped if `BASE_URL` is not set, so the suite is safe to run in CI without staging access.

## Run locally

```bash
cd headless-poc/tests
npm install
npm run install:browsers           # one-time, ~300MB
BASE_URL=https://omniflex.webflow.io \
  PRODUCT_HANDLE=oversized-tee \
  npm test
```

## What's covered

- **PDP renders** — product title, price, and add-to-cart button appear from the Storefront API
- **Add to cart + persistence** — line appears in the drawer, count badge updates, survives a page reload (localStorage cart ID)
- **Checkout redirect** — drawer's checkout link points at a Shopify-hosted checkout origin
- **PLP renders** — at least one product card on a collection page
- **JSON-LD** — structured data is injected on PDP and parses as a `Product` schema

## What's NOT covered (deliberate)

- Actual order completion. The Bogus Gateway test order is best done manually first; automating it requires Shopify staging-store API tokens and a stable test-card flow.
- Customer Account API login flow. The OAuth callback is hard to automate without exposing a test customer's credentials. Cover this with a manual checklist on each release.
- Visual regression. Add `@playwright/test`'s `toHaveScreenshot()` once the design is locked.

## CI

Add a GitHub Actions workflow once a staging URL is stable:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: cd headless-poc/tests && npm install
- run: cd headless-poc/tests && npm run install:browsers
- run: cd headless-poc/tests && npm test
  env:
    BASE_URL: ${{ secrets.STAGING_BASE_URL }}
    PRODUCT_HANDLE: ${{ secrets.STAGING_PRODUCT_HANDLE }}
```
