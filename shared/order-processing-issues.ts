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

/** Terminal config failure — merchant must fix settings then click Retry. */
export function buildOrderCreationConfigFailureMessage(
  errorMessage: string,
): string {
  return `Order creation failed: ${errorMessage}. Fix the setting, then click Retry.`;
}

export function buildFulfillmentConfigFailureMessage(
  errorMessage: string,
): string {
  return `Fulfillment status could not be sent to KornitX: ${errorMessage}. Fix the setting, then click Resend.`;
}

export function buildInventorySyncRetryMessage(
  syncLabel: string,
  errorMessage: string,
  attemptCount: number,
  nextRunAt: Date,
): string {
  const retryLabel = formatRetryOrdinal(attemptCount);
  const retryAt = formatRetryDateTime(nextRunAt);
  return `${syncLabel} failed: ${errorMessage}. ${retryLabel} retry at ${retryAt}.`;
}

export function buildInventorySyncPartialFailureMessage(
  syncLabel: string,
  errorMessage: string,
  nextRunAt: Date,
): string {
  const retryAt = formatRetryDateTime(nextRunAt);
  return `${syncLabel} partially failed: ${errorMessage}. Remaining EANs retry at ${retryAt}.`;
}

/** Terminal config failure — merchant must fix settings; inventory re-enqueues on next cycle. */
export function buildInventoryConfigFailureMessage(
  syncLabel: string,
  errorMessage: string,
): string {
  return `${syncLabel} failed: ${errorMessage}. Fix the setting — inventory sync will retry on the next cycle after settings are saved.`;
}
