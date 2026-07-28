import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import styles from "../components/orders/orders-page.module.css";
import {
  OrderActionConfirmModal,
  type OrderConfirmAction,
} from "../components/orders/order-action-confirm-modal";
import { OrderIssuesPopover } from "../components/orders/order-issues-popover";
import { OrderRowActions } from "../components/orders/order-row-actions";
import {
  creationStatusTone,
  formatCreationStatus,
  formatFulfillmentStatus,
  formatOrderDate,
  formatSendFulfillmentStatus,
  fulfillmentStatusTone,
  sendFulfillmentStatusTone,
} from "../components/orders/order-status-badges";
import {
  hasActiveOrderFilters,
  OrdersFilters,
} from "../components/orders/orders-filters";
import { OrdersTableEmptyState } from "../components/orders/orders-table-empty-state";
import {
  listOrders,
  parseOrderListFilters,
  resendFulfillmentForOrder,
  retryFailedOrder,
} from "../models/kornitx-orders.server";
import { formatShopifyOrderLabel } from "../../shared/order-display";
import { authenticate } from "../shopify.server";

function readPolarisValue(event: unknown): string {
  if (!event || typeof event !== "object") return "";
  const e = event as {
    currentTarget?: { value?: string } | null;
    target?: { value?: string } | null;
    detail?: { value?: string };
  };
  if (e.detail?.value != null) return String(e.detail.value);
  const el = e.currentTarget ?? e.target;
  if (el && typeof el.value === "string") return el.value;
  return "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseOrderListFilters(url.searchParams);
  return listOrders(filters);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const orderId = Number(formData.get("orderId"));

  if (!Number.isFinite(orderId)) {
    return { ok: false as const, message: "Invalid order" };
  }

  if (intent === "retry") {
    await retryFailedOrder(session.shop, orderId);
    return {
      ok: true as const,
      message: "Order creation queued — the worker will retry on the next cycle",
    };
  }

  if (intent === "resend-fulfillment") {
    await resendFulfillmentForOrder(session.shop, orderId);
    return {
      ok: true as const,
      message:
        "Fulfillment send queued — the worker will retry on the next cycle",
    };
  }

  return { ok: false as const, message: "Unknown action" };
};

export default function OrdersPage() {
  const { orders, page, pageSize, totalPages, filters } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const isSubmitting = navigation.state !== "idle";
  const isLoading = navigation.state === "loading";
  const [confirmAction, setConfirmAction] = useState<OrderConfirmAction | null>(
    null,
  );
  const pendingConfirmRef = useRef<OrderConfirmAction | null>(null);

  useEffect(() => {
    if (actionData?.ok && actionData.message) {
      shopify.toast.show(actionData.message);
      setConfirmAction(null);
      pendingConfirmRef.current = null;
    }
  }, [actionData, shopify]);

  const goToPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    submit(params, { method: "get", replace: true });
  };

  const handlePageSizeChange = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "10") {
      params.delete("pageSize");
    } else {
      params.set("pageSize", value);
    }
    params.delete("page");
    submit(params, { method: "get", replace: true });
  };

  const refreshList = () => {
    submit(searchParams, { method: "get", replace: true });
  };

  const viewAllOrders = () => {
    submit({}, { method: "get", replace: true });
  };

  const activeFilters = hasActiveOrderFilters(filters);

  const handleConfirmAction = () => {
    const action = pendingConfirmRef.current ?? confirmAction;
    if (!action) return;

    const formData = new FormData();
    formData.set(
      "intent",
      action.intent === "retry" ? "retry" : "resend-fulfillment",
    );
    formData.set("orderId", String(action.orderId));
    submit(formData, { method: "post" });
  };

  const handleRequestConfirm = (action: OrderConfirmAction) => {
    pendingConfirmRef.current = action;
    setConfirmAction(action);
  };

  const handleCancelConfirm = () => {
    pendingConfirmRef.current = null;
    setConfirmAction(null);
  };

  return (
    <s-page heading="Orders" inlineSize="large">
      <s-button slot="secondary-action" variant="secondary" onClick={refreshList}>
        Refresh
      </s-button>

      <div className={styles.page}>
        <div className={styles.filterCard}>
          <OrdersFilters filters={filters} />
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <s-table variant="auto" loading={isLoading}>
              <s-table-header-row>
                <s-table-header />
                <s-table-header listSlot="primary">KornitX ID</s-table-header>
                <s-table-header>Order creation status</s-table-header>
                <s-table-header>Shape</s-table-header>
                <s-table-header>Items</s-table-header>
                <s-table-header>Shopify order</s-table-header>
                <s-table-header>Received date</s-table-header>
                <s-table-header>Fulfillment status</s-table-header>
                <s-table-header>Send fulfillment</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {orders.length === 0 ? (
                  <OrdersTableEmptyState
                    hasActiveFilters={activeFilters}
                    onViewAllOrders={viewAllOrders}
                  />
                ) : (
                  orders.map((order) => (
                    <s-table-row key={order.id}>
                      <OrderIssuesPopover
                        orderId={order.id}
                        issues={order.activeIssues}
                      />
                      <s-table-cell>
                        <s-text type="strong">{order.kornitxId}</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge tone={creationStatusTone(order.status)}>
                          {formatCreationStatus(order.status)}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>{order.orderShape}</s-table-cell>
                      <s-table-cell>
                        {order.itemCount}{" "}
                        {order.itemCount === 1 ? "item" : "items"}
                      </s-table-cell>
                      <s-table-cell>
                        {formatShopifyOrderLabel(
                          order.shopifyOrderName,
                          order.shopifyOrderId,
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {formatOrderDate(order.orderReceivedAt)}
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge
                          tone={fulfillmentStatusTone(order.fulfillmentStatus)}
                        >
                          {formatFulfillmentStatus(order.fulfillmentStatus)}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge
                          tone={sendFulfillmentStatusTone(
                            order.sendFulfillmentStatus,
                          )}
                        >
                          {formatSendFulfillmentStatus(
                            order.sendFulfillmentStatus,
                          )}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        <div className={styles.actionsCell}>
                          <OrderRowActions
                            orderId={order.id}
                            kornitxId={order.kornitxId}
                            status={order.status}
                            canResendFulfillment={order.canResendFulfillment}
                            isSubmitting={isSubmitting}
                            onRequestConfirm={handleRequestConfirm}
                          />
                        </div>
                      </s-table-cell>
                    </s-table-row>
                  ))
                )}
              </s-table-body>
            </s-table>
          </div>

          <div className={styles.footer}>
            <div className={styles.pageSize}>
              <div className={styles.pageSizeSelect}>
                <s-select
                  label="Orders per page"
                  labelAccessibilityVisibility="exclusive"
                  value={String(pageSize)}
                  onChange={(event) =>
                    handlePageSizeChange(readPolarisValue(event))
                  }
                >
                  <s-option value="10">10</s-option>
                  <s-option value="25">25</s-option>
                  <s-option value="50">50</s-option>
                </s-select>
              </div>
              <span className={styles.pageSizeLabel}>orders per page</span>
            </div>

            <div className={styles.pagination}>
              <s-button
                variant="secondary"
                disabled={page <= 1 || isLoading ? true : undefined}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </s-button>
              <span className={styles.paginationStatus}>
                Page {page} of {totalPages}
              </span>
              <s-button
                variant="secondary"
                disabled={page >= totalPages || isLoading ? true : undefined}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </s-button>
            </div>
          </div>
        </div>
      </div>

      <OrderActionConfirmModal
        action={confirmAction}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelConfirm}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
