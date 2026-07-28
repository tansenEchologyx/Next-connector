# Learn — Next Connector

A beginner-friendly guide to **how the code works today**. Read this to understand files, functions, data, and flows.

_Last updated: orders list page with filters, pagination, issues, and send-fulfillment tracking._

---

## The big picture (story)

Imagine three actors:

1. **KornitX** — sends orders and wants stock updates and shipping statuses
2. **Shopify** — where products, inventory, and orders live
3. **Next Connector** — our app in the middle

Right now the app has:

- A **web app** (runs with `shopify app dev`) — admin UI plus the KornitX inbound webhook
- A **database** (PostgreSQL) remembering orders, settings, and job logs
- **Workers** (run with `npm run worker:run-jobs`) that process the **SyncJob** queue

The web app and workers **share the same database**.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  shopify app    │     │   PostgreSQL     │     │ npm run     │
│  dev (Amplify   │────▶│   (Docker)       │◀────│ worker:*    │
│  later)         │     │                  │     │ (ECS later) │
└────────┬────────┘     └──────────────────┘     └─────────────┘
         │
         │  POST /webhooks/kornitx/orders
         ▼
    KornitX OMS
```

---

## Folder map (what lives where)

```
next-connector/
├── app/                    ← Shopify web app (React Router)
│   ├── db.server.ts        ← Prisma client for web routes
│   ├── shopify.server.ts   ← Shopify auth + sessions
│   ├── models/             ← Database helpers for admin pages + inbound orders
│   ├── services/           ← Shopify GraphQL, order parser, webhook auth
│   └── routes/             ← Pages and webhooks
│       ├── app._index.tsx           ← Dashboard
│       ├── app.settings.tsx         ← KornitX + order defaults
│       ├── app.inventory.tsx        ← Tracked product checkboxes
│       ├── app.orders.tsx           ← KornitX order log + retry
│       ├── webhooks.kornitx.orders.tsx
│       ├── webhooks.orders.fulfilled.tsx
│       ├── webhooks.orders.cancelled.tsx
│       └── webhooks.inventory.levels_update.tsx
├── shared/                 ← Job types + retry backoff helpers
│   ├── sync-job-types.ts
│   ├── retry.ts
│   ├── inventory-sync.ts   ← INVENTORY_SYNC_INTERVAL_SECONDS
│   └── fulfillment-sync.ts ← FULFILLMENT_DELAY_SECONDS
├── workers/                ← Background jobs (run separately)
│   ├── run-jobs.ts         ← unified worker (process_order + send_fulfillment)
│   ├── stock-delta.ts      ← legacy stub (inventory TBD)
│   ├── stock-full-feed.ts
│   ├── shipping-status.ts  ← legacy stub
│   └── lib/
│       ├── sync-jobs.ts            ← claim / complete / backoff
│       ├── handlers/               ← per job type
│       ├── kornitx-shipping.ts     ← PUT dispatch/cancel to KornitX
│       ├── shopify-session.ts
│       ├── shopify-graphql.ts
│       ├── create-shopify-order.ts
│       └── process-kornitx-order.ts
├── prisma/
│   └── schema.prisma       ← Database table definitions
├── docker-compose.yml      ← Starts local PostgreSQL
├── .env                    ← Secrets (not in git) — copy from .env.example
└── package.json            ← npm scripts including worker:* and db:*
```

---

## Database tables (Prisma)

Prisma turns `schema.prisma` into TypeScript types and SQL tables.

| Table | What it stores |
|-------|----------------|
| `Session` | Shopify login sessions (required by Shopify app template) |
| `AppSettings` | One row per shop: KornitX Ref ID and B2B customer (editable in `/app/settings`) |
| `TrackedProduct` | Products you checkbox for inventory sync (EAN/barcode) — saved from `/app/inventory` |
| `InventorySyncState` | Legacy per-tracked-product sync flags (from inventory UI) |
| `InventoryDelta` | One row per shop+EAN with latest qty; `status = unsent` until a future sync worker sends it |
| `KornitxOrder` | One row per KornitX batch order (`kornitxId` unique) |
| `KornitxOrderItem` | Line items inside a KornitX order |
| `ShippingStatusEvent` | “Tell KornitX this order shipped/cancelled” queue |
| `SyncJob` | Work queue: `process_order` or `send_fulfillment`, with retry backoff |
| `JobRun` | Log line every time a worker starts/finishes |

### Order status flow

```
received → processing → created
                    └→ failed
```

- **received** — KornitX webhook saved the order; `process_order` SyncJob enqueued
- **processing** — `run-jobs` worker is creating the Shopify order
- **created** — Shopify order exists
- **failed** — terminal failure after retries exhausted (retry from `/app/orders` re-enqueues SyncJob)

---

## Web app entry points

### `app/db.server.ts`

Creates a single **PrismaClient** instance for the web server so we do not open too many database connections.

```typescript
const prisma = global.prismaGlobal ?? new PrismaClient();
export default prisma;
```

Used by `shopify.server.ts` for session storage.

### `app/shopify.server.ts`

Configures the Shopify app:

- API keys from environment
- **PrismaSessionStorage** — saves OAuth tokens in `Session` table
- Exports `authenticate` used by every `/app/*` route

When a merchant opens the app, `authenticate.admin(request)` checks they are logged in.

---

## Admin UI routes

Navigation is defined in `app/routes/app.tsx` (`<s-app-nav>` links).

### `/app` — Dashboard (`app/routes/app._index.tsx`)

**Loader** loads:

- Order counts grouped by status (`getOrderStatusCounts`)
- How many tracked variants are enabled
- How many `InventorySyncState` rows have `needsSync = true`
- Last 5 `JobRun` rows
- Whether required settings are filled in

**UI:** Metric boxes, setup/failure banners, recent worker run table.

---

### `/app/settings` — Settings (`app/routes/app.settings.tsx`)

**Loader:**

1. `getOrCreateAppSettings(session.shop)` — ensures one `AppSettings` row per shop
2. `fetchLocations(admin)` and `fetchCustomers(admin)` — dropdown options from Shopify

**Action:** Saves `kornitxRefId` and `b2bCustomerId`.

**Fields on the page:**

| Field | Database column | Used today? |
|-------|-----------------|-------------|
| KornitX Ref ID | `kornitxRefId` | Stored for future outbound stock/shipping API — **not read by workers yet** |
| B2B customer | `b2bCustomerId` | **Yes** — `run-jobs` → Shopify `orderCreate` |

Other columns still exist in the database (`deltaIntervalMinutes`, `inventoryLocationId`, etc.) for future phases but are **not** on the Settings page.

Inbound webhook auth is configured in **`.env`** only. Stock sync runs via **`npm run worker:stock-delta`** on a schedule (EventBridge in production), not from Settings.

**Helper file:** `app/models/app-settings.server.ts`

The aside panel shows the full KornitX webhook URL built from `SHOPIFY_APP_URL`.

---

## KornitX inbound webhook

**Route file:** `app/routes/webhooks.kornitx.orders.tsx`  
**URL:** `POST /webhooks/kornitx/orders`  
**Auth:** Not Shopify OAuth — uses KornitX credentials from `.env`.

### Story (step by step)

1. KornitX POSTs JSON with an `Orders` array (see KornitX integration spec).
2. `verifyKornitxWebhookAuth(request)` checks `Authorization` header:
   - **Basic:** `KORNITX_WEBHOOK_BASIC_USER` + `KORNITX_WEBHOOK_BASIC_PASSWORD`
   - **Bearer:** `KORNITX_WEBHOOK_OAUTH_TOKEN`
3. Body is parsed as JSON. Invalid JSON → **400** with code **100**.
4. `parseKornitxOrderPayload(body)` validates each order and item:
   - Mandatory fields: Brand, ID, Destination, DateTimeStamp, Currency (GBP), Items
   - Each item: ItemID, EAN, Quantity (=1), PromiseDate, OrderExternalRef
   - Detects **single** vs **batched** shape (see below)
5. `saveInboundOrders(shop, orders)` writes to PostgreSQL:
   - New order → `KornitxOrder` + `KornitxOrderItem` rows, `status=received`, **`process_order` SyncJob**
   - Duplicate `kornitxId` → return existing row (idempotent ack)
   - Previously **failed** order → reset to `received` and re-enqueue SyncJob
6. Returns **200** JSON: `{ success: true, accepted: ["12223344", ...] }`

The webhook **does not** call Shopify. It enqueues a `process_order` SyncJob processed by `npm run worker:run-jobs`.

### Single vs batched order shape

| Shape | When | OrderExternalRef location | Shipping API later |
|-------|------|---------------------------|-------------------|
| `single` | One item, ref on order | Order level | `PUT /order/:id/status` |
| `batched` | Multiple items, or ref per item | Item level | `PUT /order-item/status` |

**Parser file:** `app/services/order.parser.ts`  
**Auth file:** `app/services/kornitx-webhook-auth.server.ts`  
**Database save:** `app/models/kornitx-inbound.server.ts`

### Error responses

| HTTP | Code | When |
|------|------|------|
| 401 | 401 | Missing or wrong auth |
| 400 | 100 | Invalid JSON or validation failure |
| 500 | 0 | Unexpected server error |

### Example test (local dev)

After setting auth in `.env` and running `shopify app dev`:

```bash
curl -X POST "https://<tunnel-url>/webhooks/kornitx/orders" \
  -u "your-user:your-password" \
  -H "Content-Type: application/json" \
  -d '{
    "Orders": [{
      "ID": 12223344,
      "Brand": "Chinti & Parker Ltd",
      "Destination": "NextRDC",
      "DateTimeStamp": "2026-06-29T10:43:07+00:00",
      "Currency": "GBP",
      "OrderExternalRef": "AB1234567812345",
      "Items": [{
        "ItemID": 123456789,
        "EAN": "1234567890123",
        "Quantity": 1,
        "PromiseDate": "2026-06-30"
      }]
    }]
  }'
```

Check Prisma Studio or `/app/orders` to see the saved order.

For quick local testing without curl, run `npm run simulate:kornitx-orders`. It inserts three sample orders (one `single`, two `batched`) and enqueues `process_order` SyncJobs.

---

### `/app/inventory` — Tracked products (`app/routes/app.inventory.tsx`)

**Story:** Merchant checks which variants send stock to KornitX. Only variants **with a barcode (EAN)** appear.

**Loader:**

1. `fetchProductVariants(admin)` — all product variants from Shopify
2. `getTrackedVariantIds(shop)` — which variant IDs are currently enabled

**Action:**

1. Reads selected variant IDs from hidden form inputs
2. `syncTrackedProducts(shop, selectedVariants)` — upserts `TrackedProduct`, toggles `enabled`, creates `InventorySyncState` if missing

**Helper file:** `app/models/tracked-products.server.ts`

---

### `/app/orders` — KornitX order list (`app/routes/app.orders.tsx`)

**Loader:** reads URL search params via `parseOrderListFilters()`, then `listOrders(filters)` — paginated orders with items, shipping events, and active issues.

**Filters (URL params):** `q`, `status`, `shape`, `fulfillment`, `sendFulfillment`, `sort`, `page`, `pageSize`.

**Table columns:** issue indicator, KornitX ID, order creation status, shape, items, Shopify order name, received date, fulfillment status (Shopify-side), send fulfillment (KornitX sync: unsent / sent / failed), actions.

**Issue popover:** alert icon when the order has open `KornitxOrderIssue` rows (red for errors, amber for warnings only). Click to see ERROR/WARNING messages and timestamps. Issues clear when the underlying problem is resolved (order created, fulfillment sent, etc.). Retryable failures (Shopify/network for order creation, KornitX API for fulfillment send) open a **WARNING** such as `Order creation failed: … 2nd retry at 28/07/2026, 20:45:00.` or `Fulfillment send to KornitX failed: … 2nd retry at …`; terminal failures show **ERROR**.

**Actions:**
- **Retry** — failed order creation; opens a confirmation modal, then `retryFailedOrder` re-enqueues `process_order` for the worker’s next cycle
- **Resend** (send icon) — unsent/failed fulfillment send; opens a confirmation modal, then `resendFulfillmentForOrder` force-resets the order’s `send_fulfillment` SyncJob (`attemptCount` → 0, `nextRunAt` → now or order received + delay) even if the job is already `pending` from automatic retry backoff

**Display helpers:** `shared/order-display.ts` derives fulfillment status from shipping events and send-fulfillment status from unsent events + SyncJob state.

**Helper files:**
- `app/models/kornitx-orders.server.ts` — list, retry, resend
- `app/models/kornitx-order-issues.server.ts` — create/resolve issues
- `app/components/orders/*` — filters, badges, issue popover UI

---

### `app/services/shopify-admin.server.ts`

Shared Admin GraphQL helpers used by Settings and Inventory:

| Function | Returns |
|----------|---------|
| `fetchLocations(admin)` | Shopify location id + name |
| `fetchCustomers(admin)` | Customer id + display name |
| `fetchProductVariants(admin)` | Flat list of variants with SKU and barcode |

---

## Workers — how they run

Workers are **plain TypeScript files** executed with `tsx` (TypeScript runner).

Each worker follows the same pattern:

1. **loadEnv()** — read `.env` (gets `DATABASE_URL`)
2. **startJobRun()** — insert `JobRun` with status `running`
3. Do work (query/update tables)
4. **completeJobRun()** or **failJobRun()**
5. **disconnectPrisma()** — close DB connection and exit

### npm scripts → files

| You type | Runs |
|----------|------|
| `npm run worker:run-jobs` | `workers/run-jobs.ts` (unified SyncJob worker) |
| `npm run worker:process-orders` | Same as `worker:run-jobs` (alias) |
| `npm run worker:stock-delta` | `workers/stock-delta.ts` (legacy stub) |
| `npm run worker:stock-full-feed` | `workers/stock-full-feed.ts` |
| `npm run worker:shipping-status` | `workers/shipping-status.ts` (legacy stub) |

---

## Worker details

### `workers/lib/load-env.ts`

**Function:** `loadEnv()`

Loads variables from `.env` in the project root. Workers do not use Shopify CLI, so they need this to find `DATABASE_URL`.

---

### `workers/lib/prisma.ts`

**Exports:** `prisma`, `disconnectPrisma()`

Same idea as `app/db.server.ts` but for workers running in a separate process.

---

### `workers/lib/job-run.ts`

**Functions:**

| Function | What it does |
|----------|--------------|
| `startJobRun(jobName)` | Creates `JobRun` row, status `running` |
| `completeJobRun(id, metadata?)` | Sets status `completed`, saves JSON stats |
| `failJobRun(id, error)` | Sets status `failed`, saves error message |

**Variable `jobName`:** `run-jobs` (unified worker), plus legacy names for stub workers.

---

### `SyncJob` queue (`shared/sync-job-types.ts`, `workers/lib/sync-jobs.ts`)

Webhooks enqueue rows; `run-jobs` claims and processes them.

| `jobType` | Enqueued by | Handler |
|-----------|-------------|---------|
| `process_order` | KornitX inbound webhook, manual retry | Shopify `orderCreate` |
| `send_fulfillment` | Shopify fulfilled/cancelled webhooks (one coalesced job per KornitX order) | KornitX shipping PUT — batched orders send all unsent line items in one request |
| `send_inventory_delta` | Inventory webhook (one coalesced job per shop) | KornitX stock PUT |

**SyncJob fields:** `status` (`pending` → `processing` → `completed` or `failed`), `attemptCount`, `nextRunAt`, `runAfter`, `lastError`, `idempotencyKey`.

**Retry:** `shared/retry.ts` — exponential backoff (base 5 min, max 8 attempts). Validation errors (missing B2B customer, unknown EAN) fail immediately.

---

### `workers/lib/orders.ts`

**Functions:**

| Function | What it does |
|----------|--------------|
| `claimReceivedOrders(limit?)` | Legacy helper (unused by `run-jobs`) |
| `markOrderProcessing(orderId)` | Sets status `processing` when job starts |
| `markOrderReceivedForRetry(orderId, reason)` | Sets status `received` when job will retry |
| `markOrderCreated(...)` | Sets status `created`, saves Shopify order id + name, resolves order-processing issues |
| `markOrderFailed(orderId, reason)` | Terminal failure on order row; creates ERROR issue |

---

### `worker:run-jobs`

**File:** `workers/run-jobs.ts`

**Story:** Long-running worker that polls SyncJobs every 5 minutes (configurable). Processes one job at a time until the queue is empty for that cycle.

**Flow (each poll cycle):**

1. `backfillProcessOrderJobs()` — enqueue missing jobs for `received` orders
2. `reclaimStaleSyncJobs()` — reset jobs stuck in `processing` > 15 min
3. Loop: `claimNextDueSyncJob()` → `dispatchSyncJob()` until no due jobs
4. Priority: `process_order` → `send_fulfillment` → `send_inventory_delta`
5. **`send_inventory_delta`:** skips until `lastInventorySyncAt + INVENTORY_SYNC_INTERVAL_SECONDS`; PUTs unsent `InventoryDelta` rows in batches of 100
6. **`send_fulfillment`:** skips until `orderReceivedAt + FULFILLMENT_DELAY_SECONDS` (default 20 min); loads all unsent `ShippingStatusEvent` rows for the order and sends one PUT (batched: `PUT /order-item/status` with full item array). On retryable failure, upserts a WARNING issue; on terminal failure, upserts an ERROR issue. Success resolves fulfillment issues.
7. Writes `JobRun` metadata per cycle

**Run locally (runs until Ctrl+C):**

```bash
npm run worker:run-jobs
```

Optional `.env`: `WORKER_POLL_INTERVAL_MS=300000` (5 min default).

(`npm run worker:process-orders` is an alias to the same script.)

**Requirements before a order can be created:**

| Requirement | Where |
|-------------|--------|
| B2B customer selected (valid Customer GID) | `/app/settings` |
| KornitX EAN matches a Shopify variant barcode | Your Shopify products |
| App installed (offline session in DB) | Open app once in admin |

---

### `worker:stock-delta`

**File:** `workers/stock-delta.ts`

**Story:** Inventory changed on a tracked SKU. The **`inventory_levels/update`** webhook upserts **`InventoryDelta`** (`status = unsent`) and enqueues one coalesced **`send_inventory_delta`** SyncJob per shop (if none pending/processing).

**Sending:** handled by **`run-jobs`** when `INVENTORY_SYNC_INTERVAL_SECONDS` has elapsed since `AppSettings.lastInventorySyncAt` (default **1800** = 30 min).

---

### `worker:stock-full-feed`

**File:** `workers/stock-full-feed.ts`

**Story:** Once per day, send **all** tracked products’ stock to KornitX (spec requirement).

**Today:**

1. Loads all `TrackedProduct` where `enabled = true`
2. Updates sync baseline in database
3. Logs batch count

---

### `worker:shipping-status`

**File:** `workers/shipping-status.ts`

**Story:** Legacy stub — shipping to KornitX is handled by **`run-jobs`** (`send_fulfillment` SyncJobs) instead.

---

## Docker database

**File:** `docker-compose.yml`

Starts a container named `next-connector-db`:

- PostgreSQL 16
- User / password / database: `next_connector`
- Host port **5433** (so it does not clash with other Postgres on 5432)

**Connection string in `.env`:**

```
DATABASE_URL="postgresql://next_connector:next_connector@localhost:5433/next_connector"
```

---

## Environment variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Web app + workers | PostgreSQL connection |
| `SHOPIFY_API_KEY` | Web app | Set by Shopify CLI |
| `SHOPIFY_API_SECRET` | Web app | Set by Shopify CLI |
| `SCOPES` | Web app | API permissions |
| `SHOPIFY_APP_URL` | Web app | App URL during dev (also used for webhook URL display) |
| `KORNITX_WEBHOOK_BASIC_USER` | Inbound webhook | Basic auth username for KornitX POST |
| `KORNITX_WEBHOOK_BASIC_PASSWORD` | Inbound webhook | Basic auth password for KornitX POST |
| `KORNITX_WEBHOOK_OAUTH_TOKEN` | Inbound webhook | Bearer token (alternative to Basic) |
| `WORKER_SHOP` | Workers | Optional shop domain if multiple stores (defaults to AppSettings shop) |
| `INVENTORY_SYNC_INTERVAL_SECONDS` | Workers | Seconds between inventory delta sends to KornitX (default `1800` = 30 min; use `30` for testing) |
| `FULFILLMENT_DELAY_SECONDS` | Workers | Seconds after KornitX order received before shipping status is sent (default `1200` = 20 min; use `30` for testing) |
| `WORKER_POLL_INTERVAL_MS` | Workers | Poll interval for `run-jobs` (default 300000) |
| `KORNITX_REF_ID` | Workers | KornitX account code (or `mock-ref` for Beeceptor) |
| `KORNITX_API_KEY` | Workers | KornitX API key (or `mock-key` for Beeceptor) |
| `KORNITX_STOCK_URL` | Workers | Full URL for inventory PUT (mock or production stock API) |
| `KORNITX_SHIPPING_URL` | Workers | Mock: single shipment URL; production: leave unset |
| `KORNITX_ORDER_STATUS_BASE_URL` | Workers | Production shipping host when `KORNITX_SHIPPING_URL` is unset |

See `.env.example` — mock defaults use [Beeceptor](https://next-connector.free.beeceptor.com).

---

## Idempotency

| Source | How we avoid duplicates | Status |
|--------|-------------------------|--------|
| KornitX POST | Unique `kornitxId` on `KornitxOrder`; duplicate POST returns 200 | **Implemented** |
| Fulfillment webhook | Unique `(shopifyOrderId, shopifyLineItemId, status)` on `ShippingStatusEvent`; one coalesced `send_fulfillment` SyncJob per order | **Implemented** |
| Inventory webhook | Upsert `InventorySyncState` by tracked product (latest qty wins) | Planned |

---

## What to read next

When new features land, this file will gain sections for:

- Inventory and fulfillment Shopify webhooks
- `app/services/kornitx.client.ts` (outbound stock + shipping)

**Try the full order flow today:**

1. Select a **B2B customer** in `/app/settings`
2. Ensure a Shopify variant barcode matches the KornitX EAN you will POST
3. POST a test order to `/webhooks/kornitx/orders`
4. Run `npm run worker:run-jobs`
5. Check the new order in Shopify Admin and status `created` on `/app/orders`
