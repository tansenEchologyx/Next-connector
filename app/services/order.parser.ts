export class KornitxParseError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "KornitxParseError";
  }
}

export type ParsedKornitxItem = {
  itemId: string;
  ean: string;
  quantity: number;
  promiseDate: string;
  orderExternalRef: string;
};

export type ParsedKornitxOrder = {
  kornitxId: string;
  brand: string;
  destination: string;
  currency: string;
  dateTimeStamp: Date;
  orderShape: "single" | "batched";
  items: ParsedKornitxItem[];
};

type RawItem = {
  ItemID?: unknown;
  EAN?: unknown;
  Quantity?: unknown;
  PromiseDate?: unknown;
  OrderExternalRef?: unknown;
};

type RawOrder = {
  ID?: unknown;
  Brand?: unknown;
  Destination?: unknown;
  DateTimeStamp?: unknown;
  Currency?: unknown;
  OrderExternalRef?: unknown;
  Items?: unknown;
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new KornitxParseError(100, `Missing or invalid ${field}`);
  }
  return value.trim();
}

function requireId(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") {
    throw new KornitxParseError(100, `Missing or invalid ${field}`);
  }
  return String(value);
}

function parseDateTimeStamp(value: unknown): Date {
  const raw = requireString(value, "DateTimeStamp");
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new KornitxParseError(100, "Invalid DateTimeStamp");
  }
  return parsed;
}

function detectOrderShape(order: RawOrder, items: RawItem[]): "single" | "batched" {
  if (items.length > 1) return "batched";
  if (items.some((item) => item.OrderExternalRef)) return "batched";
  if (order.OrderExternalRef) return "single";
  return "single";
}

function parseItem(
  item: RawItem,
  order: RawOrder,
  orderShape: "single" | "batched",
): ParsedKornitxItem {
  const orderExternalRef =
    orderShape === "single"
      ? requireString(order.OrderExternalRef, "OrderExternalRef")
      : requireString(item.OrderExternalRef, "OrderExternalRef");

  const quantity = Number(item.Quantity);
  if (!Number.isInteger(quantity) || quantity !== 1) {
    throw new KornitxParseError(
      100,
      "Quantity must be 1 for Label Plus orders",
    );
  }

  return {
    itemId: requireId(item.ItemID, "ItemID"),
    ean: requireString(item.EAN, "EAN"),
    quantity,
    promiseDate: requireString(item.PromiseDate, "PromiseDate"),
    orderExternalRef,
  };
}

function parseOrder(raw: RawOrder): ParsedKornitxOrder {
  if (!raw || typeof raw !== "object") {
    throw new KornitxParseError(100, "Invalid order object");
  }

  if (!Array.isArray(raw.Items) || raw.Items.length === 0) {
    throw new KornitxParseError(100, "Orders must include at least one item");
  }

  const items = raw.Items as RawItem[];
  const orderShape = detectOrderShape(raw, items);
  const parsedItems = items.map((item) => parseItem(item, raw, orderShape));
  const currency = requireString(raw.Currency, "Currency");

  if (currency !== "GBP") {
    throw new KornitxParseError(100, "Currency must be GBP");
  }

  return {
    kornitxId: requireId(raw.ID, "ID"),
    brand: requireString(raw.Brand, "Brand"),
    destination: requireString(raw.Destination, "Destination"),
    currency,
    dateTimeStamp: parseDateTimeStamp(raw.DateTimeStamp),
    orderShape,
    items: parsedItems,
  };
}

export function parseKornitxOrderPayload(body: unknown): ParsedKornitxOrder[] {
  if (!body || typeof body !== "object") {
    throw new KornitxParseError(100, "Invalid JSON payload");
  }

  const orders = (body as { Orders?: unknown }).Orders;
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new KornitxParseError(100, "Payload must include a non-empty Orders array");
  }

  return orders.map((order) => parseOrder(order as RawOrder));
}
