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
