import type { AppSettings, Prisma } from "@prisma/client";
import prisma from "../db.server";

export type ShippingAddress = {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

export function parseShippingAddress(value: Prisma.JsonValue): ShippingAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as ShippingAddress;
}

const REQUIRED_ADDRESS_FIELDS: Array<keyof ShippingAddress> = [
  "address1",
  "city",
  "zip",
  "country",
];

export function isShippingAddressComplete(
  address: ShippingAddress | null | undefined,
): boolean {
  if (!address) return false;
  return REQUIRED_ADDRESS_FIELDS.every((field) => {
    const value = address[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function normalizePreemptiveOrderPrefix(
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim().toUpperCase();
  if (!trimmed) return null;
  return trimmed;
}

export function isValidPreemptiveOrderPrefix(
  value: string | null | undefined,
): boolean {
  const normalized = normalizePreemptiveOrderPrefix(value);
  if (!normalized) return false;
  return /^[A-Z]{2}$/.test(normalized);
}

export async function getOrCreateAppSettings(shop: string): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export type AppSettingsUpdate = {
  kornitxRefId?: string;
  b2bCustomerId?: string;
  inventoryLocationId?: string;
  usePrimaryInventoryLocation?: boolean;
  dailyFullFeedEnabled?: boolean;
  dailyFullFeedTime?: string;
  deltaIntervalMinutes?: number;
  preemptiveOrderPrefix?: string | null;
  requirePreemptivePrefix?: boolean;
};

export async function updateAppSettings(
  shop: string,
  input: AppSettingsUpdate,
): Promise<AppSettings> {
  return prisma.appSettings.upsert({
    where: { shop },
    create: { shop, ...input },
    update: input,
  });
}
