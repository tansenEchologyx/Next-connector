import {
  formatSyncRunDate,
  issueTypeLabel,
  issueTypeTone,
} from "./sync-log-status-badges";

type ActiveIssue = {
  id: number;
  type: string;
  message: string;
  createdAt: Date | string;
};

type SyncLogIssuesPopoverProps = {
  runId: number;
  issues: ActiveIssue[];
};

export function SyncLogIssuesPopover({
  runId,
  issues,
}: SyncLogIssuesPopoverProps) {
  if (issues.length === 0) {
    return <s-table-cell />;
  }

  const popoverId = `sync-log-issues-${runId}`;
  const triggerId = `sync-log-issues-trigger-${runId}`;
  const hasError = issues.some((issue) => issue.type === "error");
  const iconTone = hasError ? "critical" : "warning";

  return (
    <s-table-cell>
      <s-button
        id={triggerId}
        variant="tertiary"
        accessibilityLabel={`Open issues (${issues.length})`}
        commandFor={popoverId}
        command="--toggle"
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
                  {formatSyncRunDate(issue.createdAt)}
                </s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-box>
      </s-popover>
    </s-table-cell>
  );
}
