# About App — Next Connector

Documentation of **features built so far** in the Next Connector Shopify app (KornitX / Next Label Plus integration).

_Last updated: daily full inventory feed (Phase 2) + UK timezone display._

---

## What this app is

Next Connector links **Shopify** with **KornitX** (Next Label Plus) so that:

- KornitX can push Next platform orders into Shopify
- Selected product inventory can be synced to KornitX
- Order fulfillment/cancellation can be reported back to KornitX

This file lists only what is **implemented today**.

---

## Features built so far

### 1. Shopify embedded app

- React Router 7 app (Shopify official template base)
- Installed on dev store via `shopify app dev`
- Polaris Web Components admin UI
- OAuth and session storage via Prisma
- Scopes include `read_products`, `read_inventory`, `read_locations`, `write_orders`, `read_orders`, `read_customers`, `read_fulfillments`

### 2. PostgreSQL database (Prisma)

- Local PostgreSQL via Docker Compose (port 5433)
- Models:
  - **Session** — Shopify OAuth sessions
  - **AppSettings** — per-shop settings including inventory location, primary-location toggle, daily full-feed schedule (UK time), `lastDailyFullFeedAt`, and `lastInventorySyncAt` (delta interval is env-only)
  - **TrackedProduct** — products selected for inventory sync
  - **InventorySyncState** — legacy per-product sync state (from inventory UI)
  - **InventoryDelta** — unsent inventory changes per EAN (from inventory webhook)
  - **KornitxOrder** / **KornitxOrderItem** — inbound KornitX orders (`shopifyOrderName` stored when Shopify order is created)
  - **KornitxOrderIssue** — active warnings/errors per order (order processing, fulfillment send); retryable failures surface as warnings with the next retry time
  - **ShippingStatusEvent** — fulfillment events queued for KornitX
  - **SyncJob** — unified work queue (`process_order`, `send_fulfillment`, `send_inventory_delta`, `send_inventory_full_feed`)
  - **JobRun** — log of each worker poll cycle

### 3. Admin UI (Polaris Web Components)

| Route | Purpose |
|-------|---------|
| `/app` | Dashboard — order counts, unsent inventory deltas, recent worker runs, setup warnings |
| `/app/settings` | KornitX Ref ID, B2B customer, **Inventory sync** (location, use-primary toggle, daily full-feed enable + UK time) |
| `/app/inventory` | Product table with checkboxes — **all shop barcoded variants**; qty/availability at configured location; search + availability + tracking filters |
| `/app/orders` | Paginated KornitX order list — times in **UK timezone**; search/filters, issues, fulfillment actions |

### 4. Webhooks

| Endpoint | Source | What it does |
|----------|--------|--------------|
| `POST /webhooks/kornitx/orders` | KornitX | Saves order + enqueues `process_order` SyncJob |
| `POST /webhooks/orders/fulfilled` | Shopify | Saves dispatch event(s) + one coalesced `send_fulfillment` job per order (`FULFILLMENT_DELAY_SECONDS` after order received) |
| `POST /webhooks/orders/cancelled` | Shopify | Saves cancel event(s) + one coalesced `send_fulfillment` job per order (`FULFILLMENT_DELAY_SECONDS` after order received) |
| `POST /webhooks/inventory/levels_update` | Shopify | Upserts unsent `InventoryDelta` + coalesced `send_inventory_delta` job |

KornitX inbound auth is configured in `.env` (`KORNITX_WEBHOOK_BASIC_*` or `KORNITX_WEBHOOK_OAUTH_TOKEN`).

### 5. Unified background worker (`run-jobs`)

**Command:** `npm run worker:run-jobs` (alias: `npm run worker:process-orders`)

**Long-running process** — polls the SyncJob table on an interval (default **5 minutes**, `WORKER_POLL_INTERVAL_MS` in `.env`). Each poll cycle:

1. Backfills missing `process_order` jobs for `received` orders
2. Enqueues due **`send_inventory_full_feed`** jobs when daily full feed is enabled and today's UK schedule has passed
3. Reclaims stale `processing` SyncJobs (worker crash recovery)
4. Claims **one job at a time** in priority order, processes it, then claims the next until the queue is empty
5. Job types (in order):
   - **`process_order`** — Shopify `orderCreate`
   - **`send_fulfillment`** — KornitX shipping status PUT (batched orders: one API call with all unsent line items)
   - **`send_inventory_delta`** — KornitX stock PUT for unsent `InventoryDelta` rows in batches of 100 (respects `INVENTORY_SYNC_INTERVAL_SECONDS` since `lastInventorySyncAt`). Each successful batch is marked `sent` immediately (optimistic `quantity` + `updatedAt` check). On partial batch failure, earlier batches stay marked sent, `lastInventorySyncAt` advances, and leftovers retry at the next interval — not exponential backoff. Qty **0** is sent when stock drops to zero.
   - **`send_inventory_full_feed`** — once per UK day (when enabled): GraphQL-fetch live qty for **all** enabled `TrackedProduct` rows at the effective location, PUT to KornitX in batches of 100. Every tracked EAN is included; out-of-stock items send **`quantity_available: 0`** (never omitted). Failures use exponential backoff; partial batch failure stores remaining EANs in the job payload for retry.
6. Marks each job **`processing`** while in flight (safe for multiple worker instances later)
7. Retryable errors use exponential backoff on the SyncJob (`nextRunAt`, up to 8 attempts)
8. Writes a **JobRun** summary per cycle

**Before order processing:** B2B customer in `/app/settings`. KornitX **EAN = Shopify variant barcode**.

**Before outbound KornitX calls:** KornitX Ref ID in Settings + `KORNITX_API_KEY` in `.env`.

Optional `.env`: `WORKER_SHOP`, `WORKER_POLL_INTERVAL_MS`, `INVENTORY_SYNC_INTERVAL_SECONDS` (default `1800`), `FULFILLMENT_DELAY_SECONDS` (default `1200` = 20 min), `KORNITX_STOCK_URL`, `KORNITX_SHIPPING_URL`, `KORNITX_ORDER_STATUS_BASE_URL`.

**Local mock (Beeceptor):** set `KORNITX_STOCK_URL` and `KORNITX_SHIPPING_URL` in `.env`. **Production:** use real stock URL, clear `KORNITX_SHIPPING_URL`, set `KORNITX_ORDER_STATUS_BASE_URL`.

### 6. Legacy CLI workers (stubs)

| Command | Purpose |
|---------|---------|
| `npm run worker:stock-delta` | Superseded by `run-jobs` |
| `npm run worker:stock-full-feed` | One-shot: enqueue due daily full-feed SyncJobs (sending still via `run-jobs`) |
| `npm run worker:shipping-status` | Superseded by `run-jobs` |

### 7. Database helper scripts

| Command | Purpose |
|---------|---------|
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:down` | Stop PostgreSQL container |
| `npm run db:reset` | Remove volume and recreate database |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run simulate:kornitx-orders` | Insert 3 sample KornitX orders (1 single, 2 batched) for local testing |

### 8. Configuration

- `.env.example` — database, Shopify, KornitX, webhook auth, worker poll interval
- `shopify.app.toml` — app scopes and Shopify webhook subscriptions

---

## Not built yet

- Amplify / ECS deployment

See `.cursor/plans/kornitx_connector_final_59011c58.plan.md` for the full roadmap.
