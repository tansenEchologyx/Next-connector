import {
  isConfigurationError,
  isConfigurationErrorMessage,
} from "./configuration-error";

const RETRY_DEFAULTS = {
  baseMs: 5 * 60_000,
  maxMs: 6 * 60 * 60_000,
  maxAttempts: 8,
  jitterRatio: 0.2,
};

// const RETRY_DEFAULTS = {
//   baseMs: 5_000,        // 5 seconds (was 5 * 60_000)
//   maxMs: 60_000,        // 60 seconds cap (was 6 hours)
//   maxAttempts: 8,
//   jitterRatio: 0.2,
// };

export function getDefaultMaxAttempts(): number {
  return RETRY_DEFAULTS.maxAttempts;
}

export function computeNextRetryAt(
  attempt: number,
  now = Date.now(),
): Date {
  const exp = RETRY_DEFAULTS.baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exp, RETRY_DEFAULTS.maxMs);
  const jitter = capped * RETRY_DEFAULTS.jitterRatio * Math.random();
  return new Date(now + capped + jitter);
}

function parseHttpStatus(message: string): number | null {
  const match = message.match(/HTTP (\d{3})/);
  return match ? Number(match[1]) : null;
}

export function isRetryableError(error: unknown): boolean {
  if (isConfigurationError(error)) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (isConfigurationErrorMessage(message)) return false;
  if (lower.includes("no shopify variant found")) return false;
  if (lower.includes("no shopify primary location")) return false;
  if (lower.includes("50000")) return false;
  if (lower.includes("incorrect refid")) return false;

  const status = parseHttpStatus(message);
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500) return true;
    if (status === 408) return true;
    if (status >= 400 && status < 500) return false;
  }

  if (lower.includes("50001")) return true;
  if (lower.includes("econnreset") || lower.includes("etimedout")) return true;
  if (lower.includes("network") || lower.includes("fetch failed")) return true;
  if (lower.includes("throttl")) return true;

  return true;
}
