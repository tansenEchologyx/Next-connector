import type { AppSettings } from "@prisma/client";

export type InventoryLocationMode = "primary" | "selected";

export type EffectiveInventoryLocation = {
  mode: InventoryLocationMode;
  /** Set when mode is "selected"; null when nothing chosen yet. */
  locationId: string | null;
};

export function resolveEffectiveInventoryLocation(
  settings: Pick<
    AppSettings,
    "usePrimaryInventoryLocation" | "inventoryLocationId"
  >,
): EffectiveInventoryLocation {
  if (settings.usePrimaryInventoryLocation) {
    return { mode: "primary", locationId: null };
  }

  const locationId = settings.inventoryLocationId.trim();
  return {
    mode: "selected",
    locationId: locationId.length > 0 ? locationId : null,
  };
}

export function isInventoryLocationConfigured(
  settings: Pick<
    AppSettings,
    "usePrimaryInventoryLocation" | "inventoryLocationId"
  >,
): boolean {
  const effective = resolveEffectiveInventoryLocation(settings);
  return effective.mode === "primary" || effective.locationId !== null;
}
