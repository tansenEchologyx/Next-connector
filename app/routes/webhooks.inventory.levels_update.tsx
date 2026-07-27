import type { ActionFunctionArgs } from "react-router";

import { handleInventoryLevelsUpdate } from "../services/inventory-webhook.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`[inventory/levels_update] Received ${topic} for ${shop}`);

  const result = await handleInventoryLevelsUpdate(
    shop,
    payload as Record<string, unknown>,
  );

  if (result.stored) {
    console.log(
      `[inventory/levels_update] Stored unsent delta for EAN ${result.ean} qty=${result.quantity}`,
    );
  }

  return new Response();
};
