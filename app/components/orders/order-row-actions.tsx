import type { OrderConfirmAction, OrderConfirmIntent } from "./order-action-confirm-modal";

type OrderRowActionsProps = {
  orderId: number;
  kornitxId: string;
  canRetryOrderCreation: boolean;
  canResendFulfillment: boolean;
  isSubmitting: boolean;
  onRequestConfirm: (action: OrderConfirmAction) => void;
};

export function OrderRowActions({
  orderId,
  kornitxId,
  canRetryOrderCreation,
  canResendFulfillment,
  isSubmitting,
  onRequestConfirm,
}: OrderRowActionsProps) {
  const openConfirm = (intent: OrderConfirmIntent) => {
    onRequestConfirm({ intent, orderId, kornitxId });
  };

  if (!canRetryOrderCreation && !canResendFulfillment) {
    return <s-text color="subdued">—</s-text>;
  }

  return (
    <s-stack direction="inline" gap="small">
      {canRetryOrderCreation && (
        <s-button
          type="button"
          variant="tertiary"
          accessibilityLabel="Retry order creation"
          disabled={isSubmitting ? true : undefined}
          onClick={() => openConfirm("retry")}
        >
          Retry
        </s-button>
      )}
      {canResendFulfillment && (
        <s-button
          type="button"
          variant="tertiary"
          icon="send"
          accessibilityLabel="Resend fulfillment to KornitX"
          disabled={isSubmitting ? true : undefined}
          onClick={() => openConfirm("resend-fulfillment")}
        />
      )}
    </s-stack>
  );
}
