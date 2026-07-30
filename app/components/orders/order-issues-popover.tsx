import {
  formatOrderDate,
  issueTypeLabel,
  issueTypeTone,
} from "./order-status-badges";

type ActiveIssue = {
  id: number;
  type: string;
  message: string;
  createdAt: Date | string;
};

type OrderIssuesPopoverProps = {
  orderId: number;
  issues: ActiveIssue[];
};

export function OrderIssuesPopover({ orderId, issues }: OrderIssuesPopoverProps) {
  if (issues.length === 0) {
    return <s-table-cell />;
  }

  const popoverId = `order-issues-${orderId}`;
  const triggerId = `order-issues-trigger-${orderId}`;
  const hasError = issues.some((issue) => issue.type === "error");
  const iconTone = hasError ? "critical" : "warning";

  return (
    <s-table-cell>
      <s-button
        id={triggerId}
        variant="tertiary"
        accessibilityLabel={`Open issues (${issues.length})`}
        interestFor={popoverId}
      >
        <s-icon type="alert-circle" tone={iconTone} />
      </s-button>
      <s-popover id={popoverId}>
        <s-box padding="base">
          <s-stack direction="block" gap="base">
            <s-text type="strong">Open issues ({issues.length})</s-text>
            {issues.map((issue) => (
              <s-stack key={issue.id} direction="block" gap="small">
                <s-badge tone={issueTypeTone(issue.type)}>
                  {issueTypeLabel(issue.type)}
                </s-badge>
                <s-paragraph>{issue.message}</s-paragraph>
                <s-text color="subdued">
                  {formatOrderDate(issue.createdAt)}
                </s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-box>
      </s-popover>
    </s-table-cell>
  );
}
