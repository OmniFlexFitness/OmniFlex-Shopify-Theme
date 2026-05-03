/**
 * Cloudflare Worker — Shopify webhooks → Webflow CMS upsert.
 *
 * Replaces the polling sync.mjs with near-real-time updates.
 *
 * Shopify webhook routing (configure in Shopify admin):
 *   POST /webhooks/products/create        → products/create
 *   POST /webhooks/products/update        → products/update
 *   POST /webhooks/products/delete        → products/delete
 *   POST /webhooks/inventory/update       → inventory_levels/update
 *
 * Bindings (wrangler.toml → vars / secrets):
 *   SHOPIFY_WEBHOOK_SECRET   secret  — used to verify HMAC on every request
 *   SHOPIFY_STORE            var
 *   SHOPIFY_ADMIN_TOKEN      secret  — needed for inventory webhook fan-out lookup
 *   SHOPIFY_API_VERSION      var
 *   WEBFLOW_TOKEN            secret
 *   WEBFLOW_COLLECTION_ID    var
 *   WEBFLOW_SITE_ID          var (optional, enables publish)
 *
 * Inventory webhooks deliver inventory_item_id, not product_id, so we must
 * look up the variant → product through the Admin API before upserting.
 *
 * Idempotency: each upsert keys on `shopify-id`. Replays of the same webhook
 * are safe — the Webflow PATCH is a no-op when fieldData is unchanged.
 */

const WEBFLOW_API = 'https://api.webflow.com/v2';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    const url = new URL(request.url);
    const topic = url.pathname.replace(/^\/webhooks\//, '');
    const raw = await request.text();

    if (!(await verifyHmac(raw, request.headers.get('X-Shopify-Hmac-Sha256'), env.SHOPIFY_WEBHOOK_SECRET))) {
      return new Response('invalid hmac', { status: 401 });
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    // Acknowledge fast; Shopify retries on >5s. Real work runs in waitUntil.
    ctx.waitUntil(
      handle(topic, payload, env).catch((e) => console.error('handler failed', topic, e)),
    );
    return new Response('ok', { status: 200 });
  },
};

// --------------------------------------------------------------------------
// HMAC verification — constant-time
// --------------------------------------------------------------------------

async function verifyHmac(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// --------------------------------------------------------------------------
// Topic dispatch
// --------------------------------------------------------------------------

async function handle(topic, payload, env) {
  switch (topic) {
    case 'products/create':
    case 'products/update':
      return upsertProduct(payload, env);
    case 'products/delete':
      return deleteProduct(payload.id, env);
    case 'inventory/update':
    case 'inventory_levels/update':
      return upsertProductByInventoryItem(payload.inventory_item_id, env);
    default:
      console.warn('unknown topic', topic);
  }
}

// --------------------------------------------------------------------------
// Shopify Admin API (only used when we need to resolve variant→product)
// --------------------------------------------------------------------------

async function shopifyAdmin(env, query, variables) {
  const res = await fetch(
    `https://${env.SHOPIFY_STORE}/admin/api/${env.SHOPIFY_API_VERSION || '2025-01'}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!res.ok) throw new Error(`shopify admin ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const Q_PRODUCT_BY_INVENTORY_ITEM = `
  query($id: ID!) {
    inventoryItem(id: $id) {
      variant { product { id handle title descriptionHtml totalInventory
        featuredImage { url altText }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      } }
    }
  }
`;

async function upsertProductByInventoryItem(invId, env) {
  const gid = `gid://shopify/InventoryItem/${invId}`;
  const data = await shopifyAdmin(env, Q_PRODUCT_BY_INVENTORY_ITEM, { id: gid });
  const product = data.inventoryItem?.variant?.product;
  if (!product) return;
  return upsertProduct(adminProductToWebhookShape(product), env);
}

function adminProductToWebhookShape(p) {
  // Match the fields used by webhook payloads (REST shape) so upsertProduct
  // can take either as input.
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    body_html: p.descriptionHtml,
    image: p.featuredImage,
    inventoryTotal: p.totalInventory,
    minPrice: p.priceRangeV2?.minVariantPrice,
  };
}

// --------------------------------------------------------------------------
// Webflow upsert
// --------------------------------------------------------------------------

async function findWebflowItem(shopifyId, env) {
  // Webflow CMS v2 supports filtering items by fieldData on list endpoint.
  // Fall back to a paginated scan if filter is unavailable for the field type.
  const url =
    `${WEBFLOW_API}/collections/${env.WEBFLOW_COLLECTION_ID}/items` +
    `?fieldData.shopify-id=${encodeURIComponent(shopifyId)}&limit=1`;
  const res = await wfFetch(url, env);
  return res?.items?.[0] ?? null;
}

function productToFieldData(p) {
  // Accepts either Shopify webhook (REST) or admin-graphql shape.
  const id = p.admin_graphql_api_id ?? p.id;
  const price = p.minPrice?.amount ?? p.variants?.[0]?.price ?? null;
  const currency = p.minPrice?.currencyCode ?? p.currency ?? null;
  const image = p.image?.url ?? p.image?.src ?? null;
  return {
    name: p.title,
    slug: p.handle,
    'shopify-id': typeof id === 'number' ? `gid://shopify/Product/${id}` : id,
    handle: p.handle,
    description: p.body_html ?? p.descriptionHtml ?? '',
    price: price !== null ? parseFloat(price) : null,
    currency,
    'featured-image': image ? { url: image, alt: p.image?.alt ?? p.title } : null,
    'in-stock': (p.inventoryTotal ?? p.total_inventory ?? 0) > 0,
  };
}

async function upsertProduct(p, env) {
  const fieldData = productToFieldData(p);
  const existing = await findWebflowItem(fieldData['shopify-id'], env);
  let itemId;
  if (existing) {
    await wfFetch(`${WEBFLOW_API}/collections/${env.WEBFLOW_COLLECTION_ID}/items/${existing.id}`, env, {
      method: 'PATCH',
      body: JSON.stringify({ fieldData }),
    });
    itemId = existing.id;
  } else {
    const created = await wfFetch(`${WEBFLOW_API}/collections/${env.WEBFLOW_COLLECTION_ID}/items`, env, {
      method: 'POST',
      body: JSON.stringify({ fieldData }),
    });
    itemId = created.id;
  }
  if (env.WEBFLOW_SITE_ID && itemId) {
    await wfFetch(`${WEBFLOW_API}/collections/${env.WEBFLOW_COLLECTION_ID}/items/publish`, env, {
      method: 'POST',
      body: JSON.stringify({ itemIds: [itemId] }),
    });
  }
}

async function deleteProduct(shopifyNumericId, env) {
  const gid = `gid://shopify/Product/${shopifyNumericId}`;
  const existing = await findWebflowItem(gid, env);
  if (!existing) return;
  await wfFetch(
    `${WEBFLOW_API}/collections/${env.WEBFLOW_COLLECTION_ID}/items/${existing.id}`,
    env,
    { method: 'DELETE' },
  );
}

async function wfFetch(url, env, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.WEBFLOW_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`webflow ${init.method || 'GET'} → ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}
