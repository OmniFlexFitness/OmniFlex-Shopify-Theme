# Webhook-driven sync (Cloudflare Worker)

Replaces the polling `sync.mjs` with near-real-time updates. Shopify fires a webhook on every relevant product/inventory change; the Worker validates the HMAC and upserts a single item to Webflow CMS.

## Why a Worker

- **Free for typical traffic** (100K requests/day on the Workers free tier — far above webhook volume for any single store)
- **No always-on infra** — replaces a Render/Railway cron worker
- **Sub-100ms HMAC verification + ack**, with the actual Webflow write running in `ctx.waitUntil` so Shopify never sees latency from the slower side of the integration

## Deploy

```bash
cd headless-poc/sync/worker
npm install -g wrangler          # one-time
wrangler login

# Set vars in wrangler.toml (collection ID, store, site ID)
# Then push secrets:
wrangler secret put SHOPIFY_WEBHOOK_SECRET   # see step 2 below
wrangler secret put SHOPIFY_ADMIN_TOKEN      # same Admin token as the polling sync
wrangler secret put WEBFLOW_TOKEN

wrangler deploy
```

The Worker prints its public URL on first deploy, e.g. `https://omniflex-shopify-webhook-sync.<account>.workers.dev`.

## Register webhooks in Shopify

Shopify admin → **Settings** → **Notifications** → **Webhooks** → **Create webhook** for each topic, all pointing at distinct paths on the Worker URL:

| Topic | Path | Format |
|---|---|---|
| `Product creation` | `/webhooks/products/create` | JSON |
| `Product update` | `/webhooks/products/update` | JSON |
| `Product deletion` | `/webhooks/products/delete` | JSON |
| `Inventory level update` | `/webhooks/inventory_levels/update` | JSON |

Shopify will display a single "webhook signing secret" at the top of the page after the first webhook is created. Copy that value into `wrangler secret put SHOPIFY_WEBHOOK_SECRET` — the Worker uses it to verify HMAC on every request.

## What gets synced

Each topic maps to a single Webflow CMS write:

- `products/create` & `products/update` → **PATCH or POST** the matching CMS item by `shopify-id`
- `products/delete` → **DELETE** the matching item
- `inventory_levels/update` → look up the variant's product via Admin API, then upsert (this is the only topic that requires a round trip to Shopify, because inventory webhooks deliver `inventory_item_id`, not `product_id`)

## Idempotency and replay safety

- All upserts key on `shopify-id` (the Shopify GID), so duplicate webhook deliveries are no-ops.
- HMAC verification rejects replay attacks across stores. Replays *of the same webhook* from Shopify are intentional and harmless.
- The Worker returns 200 immediately after HMAC verification; the actual Webflow API call runs in `waitUntil`. If Webflow is down, Shopify will not retry — accept this trade for fast acks. For stricter durability, replace `waitUntil` with a Queue producer and a consumer Worker.

## Coexistence with the polling script

Both can run simultaneously without conflict (the upsert is idempotent on `shopify-id`). Recommend keeping `sync.mjs --dry` in CI as a periodic reconciliation check — if it finds drift, the webhook delivery missed something.

## Tearing it down

```bash
wrangler delete
```

Then disable the corresponding webhooks in Shopify admin.
