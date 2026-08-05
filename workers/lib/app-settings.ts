import type { AppSettings } from "@prisma/client";

import {
  CONFIG_ERROR_CODES,
  CONFIG_ERROR_MESSAGES,
  configurationError,
} from "../../shared/configuration-error";
import { isValidPreemptiveOrderPrefix } from "../../app/models/app-settings.server";
import { isInventoryLocationConfigured } from "../../shared/inventory-location";
import { loadKornitxApiCredentials } from "../../shared/kornitx-credentials";
import { prisma } from "./prisma";

export async function loadAppSettings(shop: string): Promise<AppSettings | null> {
  return prisma.appSettings.findUnique({ where: { shop } });
}

/**
 * Validates settings required to create a Shopify order from a KornitX payload.
 * Shipping address is optional (taken from the B2B customer when present).
 */
export function validateOrderSettings(
  settings: AppSettings | null,
): string | null {
  if (!settings) {
    return CONFIG_ERROR_MESSAGES[CONFIG_ERROR_CODES.APP_SETTINGS_MISSING];
  }
  if (
    !settings.b2bCustomerId ||
    !settings.b2bCustomerId.startsWith("gid://shopify/Customer/")
  ) {
    return CONFIG_ERROR_MESSAGES[CONFIG_ERROR_CODES.B2B_CUSTOMER];
  }
  if (settings.requirePreemptivePrefix) {
    if (!isValidPreemptiveOrderPrefix(settings.preemptiveOrderPrefix)) {
      return CONFIG_ERROR_MESSAGES[CONFIG_ERROR_CODES.PREEMPTIVE_PREFIX];
    }
  }
  return null;
}

export function assertOrderSettings(settings: AppSettings | null): AppSettings {
  const error = validateOrderSettings(settings);
  if (error || !settings) {
    if (error === CONFIG_ERROR_MESSAGES[CONFIG_ERROR_CODES.B2B_CUSTOMER]) {
      throw configurationError(CONFIG_ERROR_CODES.B2B_CUSTOMER);
    }
    if (error === CONFIG_ERROR_MESSAGES[CONFIG_ERROR_CODES.PREEMPTIVE_PREFIX]) {
      throw configurationError(CONFIG_ERROR_CODES.PREEMPTIVE_PREFIX);
    }
    throw configurationError(CONFIG_ERROR_CODES.APP_SETTINGS_MISSING);
  }
  return settings;
}

/** Fail-fast for outbound KornitX Stock / Shipping API credentials. */
export function assertKornitxCredentials(settings: AppSettings | null): void {
  loadKornitxApiCredentials(settings);
}

/** Fail-fast for inventory location (delta + full feed). */
export function assertInventoryLocationConfigured(
  settings: AppSettings | null,
): void {
  if (!settings) {
    throw configurationError(CONFIG_ERROR_CODES.APP_SETTINGS_MISSING);
  }
  if (!isInventoryLocationConfigured(settings)) {
    throw configurationError(CONFIG_ERROR_CODES.INVENTORY_LOCATION);
  }
}

/** Credentials + location — used by inventory delta and full feed. */
export function assertInventoryOutboundSettings(
  settings: AppSettings | null,
): void {
  assertKornitxCredentials(settings);
  assertInventoryLocationConfigured(settings);
}
