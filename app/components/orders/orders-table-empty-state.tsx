import styles from "./orders-page.module.css";

type OrdersTableEmptyStateProps = {
  hasActiveFilters: boolean;
  onViewAllOrders: () => void;
};

export function OrdersTableEmptyState({
  hasActiveFilters,
  onViewAllOrders,
}: OrdersTableEmptyStateProps) {
  return (
    <s-table-row>
      <s-table-cell {...({ colSpan: 10 } as Record<string, unknown>)}>
        <div className={styles.emptyState}>
          <s-text>
            {hasActiveFilters
              ? "No orders found matching your criteria."
              : "No KornitX orders yet. They will appear here after the inbound webhook receives payloads."}
          </s-text>
          {hasActiveFilters && (
            <div className={styles.emptyStateActions}>
              <s-button type="button" variant="tertiary" onClick={onViewAllOrders}>
                View all orders
              </s-button>
            </div>
          )}
        </div>
      </s-table-cell>
    </s-table-row>
  );
}
