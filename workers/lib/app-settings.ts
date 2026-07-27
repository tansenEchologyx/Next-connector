import type { AppSettings } from "@prisma/client";

import { prisma } from "./prisma";

export async function loadAppSettings(shop: string): Promise<AppSettings | null> {
  return prisma.appSettings.findUnique({ where: { shop } });
}

export function validateOrderSettings(
  settings: AppSettings | null,
): string | null {
  if (!settings) {
    return "App settings not found — configure /app/settings first";
  }
  if (
    !settings.b2bCustomerId ||
    !settings.b2bCustomerId.startsWith("gid://shopify/Customer/")
  ) {
    return "B2B customer is not configured in /app/settings";
  }
  return null;
}
