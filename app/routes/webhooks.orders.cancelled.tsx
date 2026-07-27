import type { ActionFunctionArgs } from "react-router";

import { handleOrderCancelledWebhook } from "../services/order-fulfillment-webhook.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`[orders/cancelled] Received ${topic} for ${shop}`);

  const result = await handleOrderCancelledWebhook(
    shop,
    payload as Record<string, unknown>,
  );

  console.log(
    `[orders/cancelled] Created ${result.created} shipping event(s) (${result.reason})`,
  );

  return new Response();
};
