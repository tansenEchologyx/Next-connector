/**
 * Thrown when a required app setting / credential is missing.
 * These errors are never auto-retried — the merchant must fix settings
 * (and for order jobs, click Retry).
 */
export class ConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigurationError";
    this.code = code;
  }
}

export const CONFIG_ERROR_CODES = {
  APP_SETTINGS_MISSING: "app_settings_missing",
  B2B_CUSTOMER: "b2b_customer",
  PREEMPTIVE_PREFIX: "preemptive_prefix",
  SHIPPING_ADDRESS_SETTINGS: "shipping_address_settings",
  SHIPPING_ADDRESS_CUSTOMER: "shipping_address_customer",
  KORNITX_REF_ID: "kornitx_ref_id",
  KORNITX_API_KEY: "kornitx_api_key",
  INVENTORY_LOCATION: "inventory_location",
} as const;

export const CONFIG_ERROR_MESSAGES = {
  [CONFIG_ERROR_CODES.APP_SETTINGS_MISSING]:
    "App settings not found — configure /app/settings first",
  [CONFIG_ERROR_CODES.B2B_CUSTOMER]:
    "B2B customer is not selected in Settings",
  [CONFIG_ERROR_CODES.PREEMPTIVE_PREFIX]:
    "Pre-emptive order prefix is not configured in Settings",
  [CONFIG_ERROR_CODES.SHIPPING_ADDRESS_SETTINGS]:
    "Shipping address is not configured in Settings",
  [CONFIG_ERROR_CODES.SHIPPING_ADDRESS_CUSTOMER]:
    "B2B customer has no saved shipping address",
  [CONFIG_ERROR_CODES.KORNITX_REF_ID]:
    "KornitX Ref ID is not configured in Settings",
  [CONFIG_ERROR_CODES.KORNITX_API_KEY]: "KornitX API key is not configured",
  [CONFIG_ERROR_CODES.INVENTORY_LOCATION]:
    "Inventory location is not configured in Settings",
} as const;

export type ConfigErrorCode =
  (typeof CONFIG_ERROR_CODES)[keyof typeof CONFIG_ERROR_CODES];

export function isConfigurationError(
  error: unknown,
): error is ConfigurationError {
  return error instanceof ConfigurationError;
}

/** True when the error message matches a known permanent config failure. */
export function isConfigurationErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return Object.values(CONFIG_ERROR_MESSAGES).some((known) =>
    lower.includes(known.toLowerCase()),
  );
}

export function configurationError(
  code: ConfigErrorCode,
  message?: string,
): ConfigurationError {
  return new ConfigurationError(
    code,
    message ?? CONFIG_ERROR_MESSAGES[code],
  );
}
