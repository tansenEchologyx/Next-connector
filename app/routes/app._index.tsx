import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { getOrCreateAppSettings } from "../models/app-settings.server";
import { countUnsentInventoryDeltas } from "../models/inventory-delta.server";
import { getOrderStatusCounts } from "../models/kornitx-orders.server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [settings, orderCounts, pendingSyncCount, trackedCount, recentJobRuns] =
    await Promise.all([
      getOrCreateAppSettings(session.shop),
      getOrderStatusCounts(),
      countUnsentInventoryDeltas(session.shop),
      prisma.trackedProduct.count({
        where: { shop: session.shop, enabled: true },
      }),
      prisma.jobRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 5,
      }),
    ]);

  const settingsComplete = Boolean(
    settings.b2bCustomerId.startsWith("gid://shopify/Customer/"),
  );

  return {
    orderCounts,
    pendingSyncCount,
    trackedCount,
    recentJobRuns,
    settingsComplete,
  };
};

function jobTone(status: string): "success" | "warning" | "critical" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "critical";
    case "running":
      return "warning";
    default:
      return "info";
  }
}

export default function DashboardPage() {
  const {
    orderCounts,
    pendingSyncCount,
    trackedCount,
    recentJobRuns,
    settingsComplete,
  } = useLoaderData<typeof loader>();

  const received = orderCounts.received ?? 0;
  const processing = orderCounts.processing ?? 0;
  const created = orderCounts.created ?? 0;
  const failed = orderCounts.failed ?? 0;

  return (
    <s-page heading="Next Connector">
      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text type="strong">Queued orders</s-text>
            <s-heading>{received + processing}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text type="strong">Created in Shopify</s-text>
            <s-heading>{created}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text type="strong">Failed orders</s-text>
            <s-heading>{failed}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text type="strong">Tracked variants</s-text>
            <s-heading>{trackedCount}</s-heading>
          </s-box>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-text type="strong">Pending stock sync</s-text>
            <s-heading>{pendingSyncCount}</s-heading>
          </s-box>
        </s-stack>
      </s-section>

      {!settingsComplete && (
        <s-banner heading="Finish setup" tone="warning">
          <s-paragraph>
            Configure the B2B customer on the{" "}
            <s-link href="/app/settings">Settings</s-link> page before processing
            orders.
          </s-paragraph>
        </s-banner>
      )}

      {failed > 0 && (
        <s-banner heading="Failed orders need attention" tone="critical">
          <s-paragraph>
            {failed} order(s) failed processing. Review them on the{" "}
            <s-link href="/app/orders">Orders</s-link> page and retry when
            ready.
          </s-paragraph>
        </s-banner>
      )}

      <s-section heading="Recent worker runs">
        {recentJobRuns.length === 0 ? (
          <s-paragraph tone="neutral" color="subdued">
            No worker runs logged yet. Run a worker locally with{" "}
            <s-text type="strong">npm run worker:run-jobs</s-text> after
            starting the database.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Job</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Started</s-table-header>
              <s-table-header>Finished</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentJobRuns.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.jobName}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={jobTone(job.status)}>{job.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {new Date(job.startedAt).toLocaleString()}
                  </s-table-cell>
                  <s-table-cell>
                    {job.finishedAt
                      ? new Date(job.finishedAt).toLocaleString()
                      : "—"}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick links">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/settings">Settings</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/inventory">Inventory sync</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/orders">KornitX orders</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
