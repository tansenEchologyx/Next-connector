import styles from "./inventory-page.module.css";

type InventorySectionTabsProps = {
  active: "products" | "sync-log";
};

export function InventorySectionTabs({ active }: InventorySectionTabsProps) {
  return (
    <div className={styles.sectionTabs} role="tablist" aria-label="Inventory sections">
      <div
        className={
          active === "products"
            ? `${styles.sectionTab} ${styles.sectionTabActive}`
            : styles.sectionTab
        }
      >
        <s-link href="/app/inventory">Products</s-link>
      </div>
      <div
        className={
          active === "sync-log"
            ? `${styles.sectionTab} ${styles.sectionTabActive}`
            : styles.sectionTab
        }
      >
        <s-link href="/app/inventory/sync-log">Sync log</s-link>
      </div>
    </div>
  );
}
