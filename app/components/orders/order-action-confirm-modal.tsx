import { useEffect } from "react";

export type OrderConfirmIntent = "retry" | "resend-fulfillment";

export type OrderConfirmAction = {
  intent: OrderConfirmIntent;
  orderId: number;
  kornitxId: string;
};

const MODAL_ID = "order-action-confirm-modal";

type OrderActionConfirmModalProps = {
  action: OrderConfirmAction | null;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

type ModalElement = HTMLElement & {
  showOverlay?: () => void;
  hideOverlay?: () => void;
};

function getModalElement() {
  return document.getElementById(MODAL_ID) as ModalElement | null;
}

function modalCopy(action: OrderConfirmAction | null) {
  if (!action) {
    return {
      heading: "Confirm action",
      body: "",
    };
  }

  if (action.intent === "retry") {
    return {
      heading: "Retry order creation?",
      body: `This will retry creating order ${action.kornitxId} in Shopify now. It reuses the existing process_order job (no duplicate queue entries) — if an automatic retry is scheduled, that same job is reset to run on the next worker cycle.`,
    };
  }

  return {
    heading: "Retry sending fulfillment?",
    body: `This will retry sending fulfillment information for order ${action.kornitxId} to KornitX. A new job will be added to the sync queue and the worker will pick it up on the next cycle.`,
  };
}

export function OrderActionConfirmModal({
  action,
  isSubmitting,
  onConfirm,
  onCancel,
}: OrderActionConfirmModalProps) {
  const copy = modalCopy(action);

  useEffect(() => {
    if (!action) return;
    getModalElement()?.showOverlay?.();
  }, [action]);

  const handleCancel = () => {
    getModalElement()?.hideOverlay?.();
    onCancel();
  };

  const handleConfirm = () => {
    getModalElement()?.hideOverlay?.();
    onConfirm();
  };

  return (
    <s-modal
      id={MODAL_ID}
      heading={copy.heading}
      onHide={handleCancel}
    >
      <s-paragraph>{copy.body}</s-paragraph>

      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleConfirm}
        {...(isSubmitting ? { loading: true } : {})}
      >
        Yes
      </s-button>

      <s-button slot="secondary-actions" variant="secondary" onClick={handleCancel}>
        No
      </s-button>
    </s-modal>
  );
}
