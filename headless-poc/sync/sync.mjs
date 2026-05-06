#!/usr/bin/env node
/**
 * Shopify → Webflow CMS one-way sync.
 *
 * Required env:
 *   SHOPIFY_STORE              "omniflexfitness.myshopify.com"
 *   SHOPIFY_ADMIN_TOKEN        Admin API access token (read_products)
 *   SHOPIFY_API_VERSION        defaults to 2025-01
 *   WEBFLOW_TOKEN              Webflow site API token
 *   WEBFLOW_COLLECTION_ID      Target Webflow CMS collection ID
 *   WEBFLOW_SITE_ID            (optional) for publish
 *
 * Run modes:
 *   node sync.mjs               # one-shot sync
 *   node sync.mjs --watch 5     # poll every 5 minutes
 *   node sync.mjs --dry         # log changes without writing
 *
 * The Webflow CMS collection must include these slug-keyed fields:
 *   name              (PlainText, required)
 *   slug              (PlainText, required)
 *   shopify-id        (PlainText)         — primary key for upsert
 *   description       (RichText)
 *   price             (Number)
 *   currency          (PlainText)
 *   featured-image    (Image)
 *   in-stock          (Switch)
 *   handle            (PlainText)
 */

const env = (k, fallback) => {
  const v = process.env[k];
  if (v === undefined && fallback === undefined) {
    console.error(`missing env ${k}`);
    process.exit(1);
  }
  return v ?? fallback;
};

const SHOPIFY_STORE = env('SHOPIFY_STORE');
const SHOPIFY_ADMIN_TOKEN = env('SHOPIFY_ADMIN_TOKEN');
const SHOPIFY_API_VERSION = env('SHOPIFY_API_VERSION', '2025-01');
const WEBFLOW_TOKEN = env('WEBFLOW_TOKEN');
const WEBFLOW_COLLECTION_ID = env('WEBFLOW_COLLECTION_ID');
const WEBFLOW_SITE_ID = process.env.WEBFLOW_SITE_ID;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const watchIdx = argv.indexOf('--watch');
const WATCH_MIN = watchIdx >= 0 ? parseInt(argv[watchIdx + 1] || '10', 10) : 0;

const SHOPIFY_GQL = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
const WEBFLOW_API = 'https://api.webflow.com/v2';

// --------------------------------------------------------------------------
// Shopify Admin API
// --------------------------------------------------------------------------

async function shopifyGql(query, variables) {
  const res = await fetch(SHOPIFY_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`shopify ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const Q_PRODUCTS = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        totalInventory
        featuredImage { url altText }
        priceRangeV2 { minVariantPrice { amount currencyCode } }
      }
    }
  }
`;

async function* allShopifyProducts() {
  let cursor = null;
  while (true) {
    const { products } = await shopifyGql(Q_PRODUCTS, { cursor });
    for (const p of products.nodes) yield p;
    if (!products.pageInfo.hasNextPage) break;
    cursor = products.pageInfo.endCursor;
  }
}

// --------------------------------------------------------------------------
// Webflow CMS API v2
// --------------------------------------------------------------------------

async function webflow(path, init = {}) {
  const res = await fetch(`${WEBFLOW_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${WEBFLOW_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`webflow ${init.method || 'GET'} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

async function listAllWebflowItems() {
  const items = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await webflow(
      `/collections/${WEBFLOW_COLLECTION_ID}/items?limit=${limit}&offset=${offset}`,
    );
    items.push(...(data.items ?? []));
    offset += limit;
    if (offset >= (data.pagination?.total ?? items.length)) break;
  }
  return items;
}

function shopifyToWebflow(p) {
  return {
    fieldData: {
      name: p.title,
      slug: p.handle,
      'shopify-id': p.id,
      handle: p.handle,
      description: p.descriptionHtml ?? '',
      price: p.priceRangeV2?.minVariantPrice
        ? parseFloat(p.priceRangeV2.minVariantPrice.amount)
        : null,
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
      'featured-image': p.featuredImage?.url
        ? { url: p.featuredImage.url, alt: p.featuredImage.altText ?? p.title }
        : null,
      'in-stock': (p.totalInventory ?? 0) > 0,
    },
  };
}

async function createItem(body) {
  return webflow(`/collections/${WEBFLOW_COLLECTION_ID}/items`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function updateItem(itemId, body) {
  return webflow(`/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

async function deleteItem(itemId) {
  return webflow(`/collections/${WEBFLOW_COLLECTION_ID}/items/${itemId}`, {
    method: 'DELETE',
  });
}

async function publishItems(itemIds) {
  if (!WEBFLOW_SITE_ID || itemIds.length === 0) return;
  return webflow(`/collections/${WEBFLOW_COLLECTION_ID}/items/publish`, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}

// --------------------------------------------------------------------------
// Sync
// --------------------------------------------------------------------------

async function syncOnce() {
  console.log(`[sync] start ${new Date().toISOString()}${DRY ? ' (dry run)' : ''}`);

  const existing = await listAllWebflowItems();
  const byShopifyId = new Map();
  for (const item of existing) {
    const sid = item.fieldData?.['shopify-id'];
    if (sid) byShopifyId.set(sid, item);
  }
  console.log(`[sync] webflow items: ${existing.length}`);

  const seen = new Set();
  let created = 0;
  let updated = 0;
  const touched = [];

  for await (const p of allShopifyProducts()) {
    seen.add(p.id);
    const payload = shopifyToWebflow(p);
    const current = byShopifyId.get(p.id);
    if (!current) {
      console.log(`[sync] +create ${p.handle}`);
      if (!DRY) {
        const item = await createItem(payload);
        touched.push(item.id);
      }
      created++;
    } else {
      const stale = JSON.stringify(current.fieldData) !== JSON.stringify({ ...current.fieldData, ...payload.fieldData });
      if (stale) {
        console.log(`[sync] ~update ${p.handle}`);
        if (!DRY) {
          await updateItem(current.id, payload);
          touched.push(current.id);
        }
        updated++;
      }
    }
  }

  let removed = 0;
  for (const [sid, item] of byShopifyId) {
    if (!seen.has(sid)) {
      console.log(`[sync] -delete ${item.fieldData?.slug ?? item.id}`);
      if (!DRY) await deleteItem(item.id);
      removed++;
    }
  }

  if (!DRY && touched.length > 0 && WEBFLOW_SITE_ID) {
    console.log(`[sync] publishing ${touched.length} item(s)`);
    await publishItems(touched);
  }

  console.log(`[sync] done — created=${created} updated=${updated} removed=${removed}`);
}

if (WATCH_MIN > 0) {
  console.log(`[sync] watch mode every ${WATCH_MIN}m`);
  await syncOnce();
  setInterval(() => {
    syncOnce().catch((e) => console.error('[sync] error', e));
  }, WATCH_MIN * 60 * 1000);
} else {
  await syncOnce();
}
