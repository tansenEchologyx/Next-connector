import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  listRecentOrders,
  retryFailedOrder,
} from "../models/kornitx-orders.server";
import { authenticate } from "../shopify.server";

function statusTone(status: string): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "created":
      return "success";
    case "failed":
      return "critical";
    case "processing":
      return "warning";
    default:
      return "info";
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const orders = await listRecentOrders(100);
  return { orders };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const orderId = Number(formData.get("orderId"));

  if (intent === "retry" && Number.isFinite(orderId)) {
    await retryFailedOrder(session.shop, orderId);
    return { ok: true as const, message: "Order queued for retry" };
  }

  return { ok: false as const, message: "Unknown action" };
};

export default function OrdersPage() {
  const { orders } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state !== "idle";

  useEffect(() => {
    if (actionData?.ok && actionData.message) {
      shopify.toast.show(actionData.message);
    }
  }, [actionData, shopify]);

  return (
    <s-page heading="KornitX orders">
      <s-section heading="Recent orders">
        {orders.length === 0 ? (
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text>
              No KornitX orders yet. They will appear here after the inbound
              webhook receives payloads.
            </s-text>
          </s-box>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">KornitX ID</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Shape</s-table-header>
              <s-table-header>Items</s-table-header>
              <s-table-header>Shopify order</s-table-header>
              <s-table-header>Received</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>{order.kornitxId}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(order.status)}>
                      {order.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{order.orderShape}</s-table-cell>
                  <s-table-cell>{order.items.length}</s-table-cell>
                  <s-table-cell>{order.shopifyOrderId ?? "—"}</s-table-cell>
                  <s-table-cell>
                    {new Date(order.orderReceivedAt).toLocaleString()}
                  </s-table-cell>
                  <s-table-cell>
                    {order.status === "failed" ? (
                      <Form method="post">
                        <input type="hidden" name="intent" value="retry" />
                        <input type="hidden" name="orderId" value={order.id} />
                        <s-button
                          type="submit"
                          variant="tertiary"
                          {...(isSubmitting ? { loading: true } : {})}
                        >
                          Retry
                        </s-button>
                      </Form>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {orders.some((order) => order.failureReason) && (
        <s-section heading="Failure details">
          <s-stack direction="block" gap="base">
            {orders
              .filter((order) => order.failureReason)
              .map((order) => (
                <s-box
                  key={order.id}
                  padding="base"
                  background="subdued"
                  borderRadius="base"
                >
                  <s-text type="strong">{order.kornitxId}</s-text>
                  <s-paragraph>{order.failureReason}</s-paragraph>
                </s-box>
              ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
