import styles from "../event-log/event-log-page.module.css";

type FilterDateRangeFieldProps = {
  label: string;
  displayValue: string;
  popoverId: string;
};

export function FilterDateRangeField({
  label,
  displayValue,
  popoverId,
}: FilterDateRangeFieldProps) {
  return (
    <div className={styles.dateRangeField}>
      <s-text type="strong">{label}</s-text>
      <s-button
        commandFor={popoverId}
        command="--toggle"
        accessibilityLabel={`Open ${label} picker`}
        variant="secondary"
      >
        {displayValue}
      </s-button>
    </div>
  );
}
