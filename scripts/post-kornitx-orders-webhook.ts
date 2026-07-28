import "dotenv/config";

const suffix = Date.now().toString().slice(-6);

const payload = {
  Orders: [
    {
      ID: `WH-SINGLE-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      OrderExternalRef: `EXT-SINGLE-${suffix}`,
      Items: [
        {
          ItemID: `ITEM-S1-${suffix}`,
          EAN: "sku-4",
          Quantity: 1,
          PromiseDate: "2026-07-30",
        },
      ],
    },
    {
      ID: `WH-BATCH-A-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      Items: [
        {
          ItemID: `ITEM-BA1-${suffix}`,
          EAN: "sku-managed-1",
          Quantity: 1,
          PromiseDate: "2026-07-30",
          OrderExternalRef: `EXT-BA1-${suffix}`,
        },
        {
          ItemID: `ITEM-BA2-${suffix}`,
          EAN: "sku-hosted-1",
          Quantity: 1,
          PromiseDate: "2026-07-31",
          OrderExternalRef: `EXT-BA2-${suffix}`,
        },
      ],
    },
    {
      ID: `WH-BATCH-B-${suffix}`,
      Brand: "Chinti & Parker Ltd",
      Destination: "NextRDC",
      DateTimeStamp: new Date().toISOString(),
      Currency: "GBP",
      Items: [
        {
          ItemID: `ITEM-BB1-${suffix}`,
          EAN: "sku-2",
          Quantity: 1,
          PromiseDate: "2026-08-01",
          OrderExternalRef: `EXT-BB1-${suffix}`,
        },
        {
          ItemID: `ITEM-BB2-${suffix}`,
          EAN: "sku-1-a",
          Quantity: 1,
          PromiseDate: "2026-08-02",
          OrderExternalRef: `EXT-BB2-${suffix}`,
        },
      ],
    },
  ],
};

function resolveBaseUrl(): string {
  const fromArg = process.argv[2]?.trim();
  if (fromArg) return fromArg.replace(/\/$/, "");

  const fromEnv = process.env.SHOPIFY_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  throw new Error(
    "Missing webhook base URL. Pass it as the first argument or set SHOPIFY_APP_URL in .env (e.g. your shopify app dev tunnel URL).",
  );
}

function resolveAuthHeader(): string {
  const user = process.env.KORNITX_WEBHOOK_BASIC_USER?.trim();
  const pass = process.env.KORNITX_WEBHOOK_BASIC_PASSWORD?.trim();
  if (user && pass) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
  }

  const token = process.env.KORNITX_WEBHOOK_OAUTH_TOKEN?.trim();
  if (token) {
    return `Bearer ${token}`;
  }

  throw new Error(
    "Webhook auth is not configured. Set KORNITX_WEBHOOK_BASIC_USER/PASSWORD or KORNITX_WEBHOOK_OAUTH_TOKEN in .env.",
  );
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const url = `${baseUrl}/webhooks/kornitx/orders`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: resolveAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  console.log(`POST ${url}`);
  console.log(`HTTP ${response.status}`);
  console.log(body);

  if (!response.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
