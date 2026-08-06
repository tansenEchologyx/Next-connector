import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { saveInboundOrders } from "../models/kornitx-inbound.server";
import { writeEventLog } from "../models/event-log.server";
import { resolveDefaultShop } from "../models/shop.server";
import { verifyKornitxWebhookAuth } from "../services/kornitx-webhook-auth.server";
import {
  EVENT_LOG_CATEGORIES,
  EVENT_LOG_LEVELS,
} from "../../shared/event-log";
import {
  KornitxParseError,
  parseKornitxOrderPayload,
} from "../services/order.parser";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const loader = async (_args: LoaderFunctionArgs) => {
  return jsonResponse({ code: 0, message: "Method not allowed" }, 405);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return jsonResponse({ code: 0, message: "Method not allowed" }, 405);
  }

  const auth = verifyKornitxWebhookAuth(request);
  if (!auth.ok) {
    console.error(`[kornitx/orders] Auth failed: ${auth.message}`);
    try {
      const shop = await resolveDefaultShop();
      await writeEventLog({
        shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "kornitx_webhook_auth_failed",
        message: `KornitX orders webhook auth failed: ${auth.message}`,
      });
    } catch {
      // Shop not configured — skip event log
    }
    return jsonResponse({ code: auth.code, message: auth.message }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    try {
      const shop = await resolveDefaultShop();
      await writeEventLog({
        shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "kornitx_webhook_invalid_json",
        message: "KornitX orders webhook rejected invalid JSON.",
      });
    } catch {
      // Shop not configured
    }
    return jsonResponse({ code: 100, message: "Invalid JSON" }, 400);
  }

  try {
    const shop = await resolveDefaultShop();
    const orders = parseKornitxOrderPayload(body);
    const saved = await saveInboundOrders(shop, orders);

    console.log(
      `[kornitx/orders] Accepted ${saved.length} order(s): ${saved.map((order) => order.kornitxId).join(", ")}`,
    );

    return jsonResponse(
      {
        success: true,
        accepted: saved.map((order) => order.kornitxId),
      },
      200,
    );
  } catch (error) {
    if (error instanceof KornitxParseError) {
      console.error(`[kornitx/orders] Validation failed: ${error.message}`);
      try {
        const shop = await resolveDefaultShop();
        await writeEventLog({
          shop,
          level: EVENT_LOG_LEVELS.ERROR,
          category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
          eventName: "kornitx_webhook_validation_failed",
          message: `KornitX orders webhook validation failed: ${error.message}`,
        });
      } catch {
        // Shop not configured
      }
      return jsonResponse({ code: error.code, message: error.message }, 400);
    }

    console.error("[kornitx/orders] Unexpected error:", error);
    try {
      const shop = await resolveDefaultShop();
      await writeEventLog({
        shop,
        level: EVENT_LOG_LEVELS.ERROR,
        category: EVENT_LOG_CATEGORIES.ORDER_FROM_KORNITX,
        eventName: "kornitx_webhook_unexpected_error",
        message:
          error instanceof Error
            ? error.message
            : "Unexpected KornitX orders webhook error.",
      });
    } catch {
      // Shop not configured
    }
    return jsonResponse(
      {
        code: 0,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
};
