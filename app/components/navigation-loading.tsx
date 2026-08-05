import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

/** Keep the bar visible briefly so fast loaders (Orders/Inventory) still register. */
const MIN_VISIBLE_MS = 250;

/**
 * Shows Shopify admin's top loading bar whenever React Router is navigating
 * or submitting (page changes, form saves, filter GETs, etc.).
 */
export function NavigationLoading() {
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const shownAtRef = useRef<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const isBusy = navigation.state !== "idle";

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (isBusy) {
      if (shownAtRef.current == null) {
        shownAtRef.current = Date.now();
        shopify.loading(true);
      }
      return;
    }

    if (shownAtRef.current == null) {
      shopify.loading(false);
      return;
    }

    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAtRef.current));
    hideTimerRef.current = setTimeout(() => {
      shownAtRef.current = null;
      hideTimerRef.current = null;
      shopify.loading(false);
    }, remaining);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [navigation.state, shopify]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      shopify.loading(false);
    };
  }, [shopify]);

  return null;
}
