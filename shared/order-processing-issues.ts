import { formatUkDateTime } from "./uk-time";

export function formatRetryDateTime(value: Date): string {
  return formatUkDateTime(value);
}

export function formatRetryOrdinal(attemptCount: number): string {
  const mod100 = attemptCount % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${attemptCount}th`;
  }

  switch (attemptCount % 10) {
    case 1:
      return `${attemptCount}st`;
    case 2:
      return `${attemptCount}nd`;
    case 3:
      return `${attemptCount}rd`;
    default:
      return `${attemptCount}th`;
  }
}

export function buildOrderCreationRetryWarningMessage(
  errorMessage: string,
  attemptCount: number,
  nextRunAt: Date,
): string {
  const retryLabel = formatRetryOrdinal(attemptCount);
  const retryAt = formatRetryDateTime(nextRunAt);
  return `Order creation failed: ${errorMessage}. ${retryLabel} retry at ${retryAt}.`;
}

export function buildFulfillmentSendRetryWarningMessage(
  errorMessage: string,
  attemptCount: number,
  nextRunAt: Date,
): string {
  const retryLabel = formatRetryOrdinal(attemptCount);
  const retryAt = formatRetryDateTime(nextRunAt);
  return `Fulfillment send to KornitX failed: ${errorMessage}. ${retryLabel} retry at ${retryAt}.`;
}
