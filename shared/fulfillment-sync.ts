/** 20 minutes — used when FULFILLMENT_DELAY_SECONDS is unset or invalid. */
export const DEFAULT_FULFILLMENT_DELAY_SECONDS = 20 * 60;

export function getFulfillmentDelaySeconds(): number {
  const raw = process.env.FULFILLMENT_DELAY_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_FULFILLMENT_DELAY_SECONDS;
  }

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    console.warn(
      `[fulfillment-sync] Invalid FULFILLMENT_DELAY_SECONDS="${raw}"; using ${DEFAULT_FULFILLMENT_DELAY_SECONDS}s`,
    );
    return DEFAULT_FULFILLMENT_DELAY_SECONDS;
  }

  return seconds;
}

export function getFulfillmentDelayMs(): number {
  return getFulfillmentDelaySeconds() * 1000;
}

export function computeFulfillmentRunAfter(
  orderReceivedAt: Date,
  now = Date.now(),
): Date {
  return new Date(Math.max(now, orderReceivedAt.getTime() + getFulfillmentDelayMs()));
}

export function isFulfillmentSendDue(
  orderReceivedAt: Date,
  now = Date.now(),
): boolean {
  return computeFulfillmentRunAfter(orderReceivedAt, now).getTime() <= now;
}
