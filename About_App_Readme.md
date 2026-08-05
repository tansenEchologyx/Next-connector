# About App — Next Connector

Documentation of **features built so far** in the Next Connector Shopify app (KornitX / Next Label Plus integration).

_Last updated: Removed JobRun / Dashboard / legacy InventorySyncState — operational UI is Orders + Inventory Sync log._

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
  - **AppSettings** — per-shop settings including inventory location, primary-location toggle, **inventory delta interval minutes**, daily full-feed schedule (UK time), `lastDailyFullFeedAt`, `lastInventorySyncAt`, `preemptiveOrderPrefix`, and `requirePreemptivePrefix`
  - **TrackedProduct** — products selected for inventory sync
  - **InventoryDelta** — unsent inventory changes per EAN (from inventory webhook)
  - **InventorySyncRun** — append-only history of each delta / full-feed send attempt (status, EAN counts, error, next retry)
  - **InventorySyncIssue** — open shop-scoped warnings/errors for inventory sync (delta or full feed); retry messages include next retry time
  - **KornitxOrder** / **KornitxOrderItem** — inbound KornitX orders (`shopifyOrderName` when created; `shopifyFulfillmentStatus` from Shopify webhooks: unfulfilled / partial / fulfilled / cancelled)
  - **KornitxOrderIssue** — active warnings/errors per order (order processing, fulfillment send); retryable failures surface as warnings with the next retry time
  - **ShippingStatusEvent** — fulfillment events queued for KornitX
  - **SyncJob** — unified work queue (`process_order`, `send_fulfillment`, `send_inventory_delta`, `send_inventory_full_feed`)

### 3. Admin UI (Polaris Web Components)

- Shopify admin **top loading bar** (`shopify.loading`) while React Router is navigating or submitting — covers nav between any app pages and form saves (Inventory, Settings, etc.)

| Route | Purpose |
|-------|---------|
| `/app` | Redirects to `/app/orders` |
| `/app/orders` | Full-width paginated KornitX order list — times in **UK timezone**; search/filters (including Shopify fulfillment status), issues, **Retry** on any order-creation failure (auto-retry pending or exhausted), fulfillment Resend |
| `/app/inventory` | Full-width paginated product table with checkboxes — **all shop barcoded variants**; qty/availability at configured location; search + availability + tracking filters; page size 10/25/50; optional **Show tracked first** (default off; reorder after Save when on); **header checkbox** selects/deselects the full catalog; draft selection persists across search/filter/pagination until Save or leaving the page; **Products / Sync log** tabs |
| `/app/inventory/sync-log` | Inventory sync run history — update-in-place for backoff retries (Failed + Next retry); terminal Failed clears Next retry; delta partial is a separate historical row; status badges (success / partial / failed / deferred / skipped); issue popover; filters by type/status/sort |
| `/app/settings` | Full-width page — KornitX Ref ID, B2B customer, **Next Label Plus orders** (pre-emptive prefix + require toggle), **Inventory sync** (delta interval minutes, location, use-primary toggle, daily full-feed enable + UK time), inbound webhook URL |

### 4. Webhooks

| Endpoint | Source | What it does |
|----------|--------|--------------|
| `POST /webhooks/kornitx/orders` | KornitX | Saves order + enqueues `process_order` SyncJob |
| `POST /webhooks/orders/fulfilled` | Shopify | Stores Shopify fulfillment status; creates `dispatched` events only for newly fulfilled lines; coalesced `send_fulfillment` job (`FULFILLMENT_DELAY_SECONDS` after order received) |
| `POST /webhooks/orders/partially_fulfilled` | Shopify | Same handler as fulfilled — needed because Shopify does **not** fire `orders/fulfilled` for partial fulfillments; later fulfillments only queue unsent ItemIDs |
| `POST /webhooks/orders/cancelled` | Shopify | Stores cancelled status; creates `cancelled` events only for lines **not** already dispatched; coalesced `send_fulfillment` job |
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
   - **`send_inventory_delta`** — KornitX stock PUT for unsent `InventoryDelta` rows in batches of 100 (respects **Settings → Inventory delta interval** minutes since `lastInventorySyncAt`). Each successful batch is marked `sent` immediately (optimistic `quantity` + `updatedAt` check). On partial batch failure, earlier batches stay marked sent, `lastInventorySyncAt` advances, leftovers retry at the next interval — not exponential backoff — and a **partial** `InventorySyncRun` + open WARNING issue are recorded. Qty **0** is sent when stock drops to zero. Auto-retry failures update one `InventorySyncRun` in place as **failed** with **Next retry** set; success flips that row to success; terminal failure clears Next retry.
   - **`send_inventory_full_feed`** — once per UK day (when enabled): GraphQL-fetch live qty for **all** enabled `TrackedProduct` rows at the effective location, PUT to KornitX in batches of 100. Every tracked EAN is included; out-of-stock items send **`quantity_available: 0`** (never omitted). Failures use exponential backoff; partial batch failure stores remaining EANs in the job payload for retry. Same run/issue observability as delta.
6. Marks each job **`processing`** while in flight (safe for multiple worker instances later)
7. Retryable errors use exponential backoff on the SyncJob (`nextRunAt`, up to 8 attempts). Order-creation failures also show a manual **Retry** button while backoff is running and after attempts are exhausted — Retry **upserts** the same `process_order` job (no duplicate queue rows; skips reset if already `processing`). **Configuration errors** (missing B2B customer, required prefix when required, inventory location, Ref ID, API key) fail **immediately** with no backoff — order/fulfillment need a manual Retry/Resend; inventory jobs self-heal on the next cycle after settings are fixed

Cycle stats are logged to the worker console only (no `JobRun` table).

**Before order processing:** B2B customer in `/app/settings`. Optional: pre-emptive prefix (required only when “Require prefix” is on). KornitX **EAN = Shopify variant barcode**. Created Shopify orders use name `NXT-{kornitxId}` and tags `NXTLabel`, `NXT-`, plus `next-live` / `next-preemptive` from the prefix (for Torque filtering vs web orders). If the B2B customer has a default Shopify address it is attached; otherwise the order is created without a shipping address.

**Before outbound KornitX calls:** KornitX Ref ID in Settings + `KORNITX_API_KEY` in `.env`. Inventory delta/full feed also need a configured inventory location (selected or Use primary).

Optional `.env`: `WORKER_SHOP`, `WORKER_POLL_INTERVAL_MS`, `FULFILLMENT_DELAY_SECONDS` (default `1200` = 20 min), `KORNITX_STOCK_URL`, `KORNITX_ORDER_STATUS_BASE_URL`. Inventory delta interval is set in **Settings** (`deltaIntervalMinutes`, default 30).

**Local mock (Beeceptor):** set `KORNITX_STOCK_URL` and `KORNITX_ORDER_STATUS_BASE_URL` (Beeceptor host) in `.env`. Shipping uses doc paths: `PUT /order/:id/status` (single `{ status: 8|128 }`) and `PUT /order-item/status` (batched `[{ id, data: { status: 3|7 } }]`). **Production:** use real stock URL and `KORNITX_ORDER_STATUS_BASE_URL=https://api-sl-2-2.custom-gateway.net`.

### 6. Legacy CLI workers (stubs)

| Command | Purpose |
|---------|---------|
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
