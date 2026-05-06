import { test, expect } from '@playwright/test';

const PRODUCT_HANDLE = process.env.PRODUCT_HANDLE;

test.describe('headless cart flow', () => {
  test.skip(!process.env.BASE_URL, 'BASE_URL not set — skipping live tests');

  test('PDP renders product from Storefront API', async ({ page }) => {
    test.skip(!PRODUCT_HANDLE, 'PRODUCT_HANDLE not set');
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await expect(page.locator('.of-product__title')).toBeVisible();
    await expect(page.locator('.of-product__price')).not.toBeEmpty();
    await expect(page.locator('.of-product__add')).toBeVisible();
  });

  test('add to cart populates the drawer and persists', async ({ page, context }) => {
    test.skip(!PRODUCT_HANDLE, 'PRODUCT_HANDLE not set');

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.locator('.of-product__add:not([disabled])').click();

    // Drawer should open and contain at least one line
    await expect(page.locator('.of-drawer[aria-hidden="false"]')).toBeVisible();
    await expect(page.locator('.of-drawer__line')).toHaveCount(1);

    // Cart count badge updates
    await expect(page.locator('[data-of-cart-count]').first()).toHaveText(/[1-9]/);

    // Reload preserves the cart via localStorage
    await page.reload();
    await expect(page.locator('[data-of-cart-count]').first()).toHaveText(/[1-9]/);
  });

  test('checkout link redirects to Shopify-hosted checkout', async ({ page }) => {
    test.skip(!PRODUCT_HANDLE, 'PRODUCT_HANDLE not set');

    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.locator('.of-product__add:not([disabled])').click();
    const checkout = page.locator('.of-drawer__checkout');
    await expect(checkout).toHaveAttribute('href', /\.myshopify\.com|\.shopifypreview\.com|\/checkouts\//);
  });

  test('PLP renders synced products', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('.of-collection__card, [data-of-add-to-cart]')).not.toHaveCount(0);
  });

  test('JSON-LD is injected on PDP for SEO', async ({ page }) => {
    test.skip(!PRODUCT_HANDLE, 'PRODUCT_HANDLE not set');
    await page.goto(`/products/${PRODUCT_HANDLE}`);
    await page.waitForSelector('script[data-of-jsonld="product"]');
    const ld = await page.locator('script[data-of-jsonld="product"]').textContent();
    const parsed = JSON.parse(ld);
    expect(parsed['@type']).toBe('Product');
    expect(parsed.name).toBeTruthy();
    expect(parsed.offers).toBeTruthy();
  });
});
