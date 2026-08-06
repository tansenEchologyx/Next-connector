import { useEffect } from "react";

type PopoverHideTriggerProps = {
  popoverId: string;
  active: boolean;
};

export function PopoverHideTrigger({
  popoverId,
  active,
}: PopoverHideTriggerProps) {
  useEffect(() => {
    if (!active) return;

    const popover = document.getElementById(popoverId) as
      | (HTMLElement & { hideOverlay?: () => void })
      | null;
    popover?.hideOverlay?.();
  }, [active, popoverId]);

  return null;
}
