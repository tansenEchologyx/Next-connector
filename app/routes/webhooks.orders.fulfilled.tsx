import type { ActionFunctionArgs } from "react-router";

import { handleOrderFulfillmentWebhook } from "../services/order-fulfillment-webhook.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);

  console.log(`[orders/fulfilled] Received ${topic} for ${shop}`);

  const result = await handleOrderFulfillmentWebhook(
    shop,
    payload as Record<string, unknown>,
    topic,
  );

  console.log(
    `[orders/fulfilled] Created ${result.created} shipping event(s) (${result.reason})`,
  );

  return new Response();
};
