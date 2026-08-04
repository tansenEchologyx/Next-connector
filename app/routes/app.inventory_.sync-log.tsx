import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { InventorySectionTabs } from "../components/inventory/inventory-section-tabs";
import { SyncLogFilters } from "../components/inventory/sync-log-filters";
import { SyncLogIssuesPopover } from "../components/inventory/sync-log-issues-popover";
import {
  formatSyncRunDate,
  syncRunStatusTone,
} from "../components/inventory/sync-log-status-badges";
import styles from "../components/inventory/inventory-page.module.css";
import { listInventorySyncRuns } from "../models/inventory-sync-runs.server";
import {
  hasActiveInventorySyncLogFilters,
  parseInventorySyncLogFilters,
} from "../../shared/inventory-sync-log-filters";
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
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseInventorySyncLogFilters(url.searchParams);
  return listInventorySyncRuns(session.shop, filters);
};

export default function InventorySyncLogPage() {
  const { runs, page, pageSize, totalPages, filters, total } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const isLoading = navigation.state === "loading";
  const activeFilters = hasActiveInventorySyncLogFilters(filters);

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

  const viewAllRuns = () => {
    submit({}, { method: "get", replace: true });
  };

  return (
    <s-page heading="Inventory sync" inlineSize="large">
      <s-button slot="secondary-action" variant="secondary" onClick={refreshList}>
        Refresh
      </s-button>

      <div className={styles.page}>
        <InventorySectionTabs active="sync-log" />

        <s-paragraph>
          Each row is one send attempt to KornitX (delta or daily full feed).
          Open the issue indicator for error details and next retry time.
        </s-paragraph>

        <div className={styles.filterCard}>
          <SyncLogFilters filters={filters} />
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <s-table variant="auto" loading={isLoading}>
              <s-table-header-row>
                <s-table-header />
                <s-table-header listSlot="primary">Type</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Started</s-table-header>
                {/* <s-table-header>EANs attempted</s-table-header> */}
                <s-table-header>EANs marked sent</s-table-header>
                <s-table-header>Next retry</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {runs.length === 0 ? (
                  <s-table-row>
                    <s-table-cell />
                    <s-table-cell>
                      <div className={styles.emptyState}>
                        <s-stack direction="block" gap="base">
                          <s-text type="strong">
                            {activeFilters
                              ? "No sync runs match your filters"
                              : "No inventory sync runs yet"}
                          </s-text>
                          <s-paragraph color="subdued">
                            {activeFilters
                              ? "Try clearing filters, or wait for the next worker cycle."
                              : "Delta and full-feed sends will appear here after the worker runs."}
                          </s-paragraph>
                          {activeFilters ? (
                            <div className={styles.emptyStateActions}>
                              <s-button
                                variant="secondary"
                                onClick={viewAllRuns}
                              >
                                View all runs
                              </s-button>
                            </div>
                          ) : null}
                        </s-stack>
                      </div>
                    </s-table-cell>
                  </s-table-row>
                ) : (
                  runs.map((run) => (
                    <s-table-row key={run.id}>
                      <SyncLogIssuesPopover
                        runId={run.id}
                        issues={run.activeIssues}
                      />
                      <s-table-cell>
                        <s-text type="strong">{run.syncTypeLabel}</s-text>
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge tone={syncRunStatusTone(run.status)}>
                          {run.statusLabel}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        {formatSyncRunDate(run.startedAt)}
                      </s-table-cell>
                      {/* <s-table-cell>{run.eansAttempted}</s-table-cell> */}
                      <s-table-cell>{run.eansMarkedSent}</s-table-cell>
                      <s-table-cell>
                        {formatSyncRunDate(run.nextRetryAt)}
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
                  label="Runs per page"
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
              <span className={styles.pageSizeLabel}>
                runs per page
                {total > 0 ? ` · ${total} total` : ""}
              </span>
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
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
