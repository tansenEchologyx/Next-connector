import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  getOrCreateAppSettings,
  isValidPreemptiveOrderPrefix,
  normalizePreemptiveOrderPrefix,
  updateAppSettings,
} from "../models/app-settings.server";
import { fetchCustomers, fetchLocations } from "../services/shopify-admin.server";
import { isInventoryLocationConfigured } from "../../shared/inventory-location";
import { formatUkDateTime, parseUkTimeOfDay } from "../../shared/uk-time";
import settingsStyles from "../components/settings/settings-page.module.css";
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

function readPolarisChecked(event: unknown): boolean {
  if (!event || typeof event !== "object") return false;
  const e = event as {
    currentTarget?: { checked?: boolean } | null;
    target?: { checked?: boolean } | null;
    detail?: { checked?: boolean };
  };
  if (e.detail?.checked != null) return Boolean(e.detail.checked);
  const el = e.currentTarget ?? e.target;
  if (el && typeof el.checked === "boolean") return el.checked;
  return false;
}

function normalizeCustomerId(value: string): string {
  return value.startsWith("gid://shopify/Customer/") ? value : "";
}

function normalizeLocationId(value: string): string {
  return value.startsWith("gid://shopify/Location/") ? value : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await getOrCreateAppSettings(session.shop);
  const [customers, locations] = await Promise.all([
    fetchCustomers(admin),
    fetchLocations(admin),
  ]);

  return {
    settings,
    customers,
    locations,
    webhookUrl: process.env.SHOPIFY_APP_URL
      ? `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/webhooks/kornitx/orders`
      : "/webhooks/kornitx/orders",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const inventoryLocationId = normalizeLocationId(
    String(formData.get("inventoryLocationId") ?? ""),
  );
  const usePrimaryInventoryLocation =
    formData.get("usePrimaryInventoryLocation") === "on";
  const dailyFullFeedEnabled = formData.get("dailyFullFeedEnabled") === "on";
  const dailyFullFeedTime = String(formData.get("dailyFullFeedTime") ?? "").trim();
  const deltaIntervalMinutesRaw = String(
    formData.get("deltaIntervalMinutes") ?? "",
  ).trim();
  const deltaIntervalMinutes = Number(deltaIntervalMinutesRaw);
  const requirePreemptivePrefix =
    formData.get("requirePreemptivePrefix") === "on";
  const preemptiveOrderPrefix = normalizePreemptiveOrderPrefix(
    String(formData.get("preemptiveOrderPrefix") ?? ""),
  );

  if (
    !Number.isInteger(deltaIntervalMinutes) ||
    deltaIntervalMinutes < 1 ||
    deltaIntervalMinutes > 1440
  ) {
    return {
      ok: false as const,
      error:
        "Inventory delta interval must be a whole number of minutes between 1 and 1440.",
    };
  }

  if (preemptiveOrderPrefix && !isValidPreemptiveOrderPrefix(preemptiveOrderPrefix)) {
    return {
      ok: false as const,
      error: "Pre-emptive order prefix must be exactly 2 letters (A–Z).",
    };
  }

  if (requirePreemptivePrefix && !preemptiveOrderPrefix) {
    return {
      ok: false as const,
      error:
        "Require prefix is enabled — enter a 2-letter pre-emptive order prefix.",
    };
  }

  if (dailyFullFeedEnabled) {
    if (!parseUkTimeOfDay(dailyFullFeedTime)) {
      return {
        ok: false as const,
        error:
          "Daily full feed requires a valid UK time in HH:mm format (24-hour).",
      };
    }

    if (
      !isInventoryLocationConfigured({
        usePrimaryInventoryLocation,
        inventoryLocationId,
      })
    ) {
      return {
        ok: false as const,
        error:
          "Daily full feed requires an inventory location, or enable Use primary location.",
      };
    }
  }

  await updateAppSettings(session.shop, {
    kornitxRefId: String(formData.get("kornitxRefId") ?? "").trim(),
    b2bCustomerId: normalizeCustomerId(
      String(formData.get("b2bCustomerId") ?? ""),
    ),
    inventoryLocationId,
    usePrimaryInventoryLocation,
    dailyFullFeedEnabled,
    dailyFullFeedTime,
    deltaIntervalMinutes,
    preemptiveOrderPrefix,
    requirePreemptivePrefix,
  });

  return { ok: true as const };
};

export default function SettingsPage() {
  const { settings, customers, locations, webhookUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const [kornitxRefId, setKornitxRefId] = useState(settings.kornitxRefId);
  const [b2bCustomerId, setB2bCustomerId] = useState(
    normalizeCustomerId(settings.b2bCustomerId),
  );
  const [inventoryLocationId, setInventoryLocationId] = useState(
    normalizeLocationId(settings.inventoryLocationId),
  );
  const [usePrimaryInventoryLocation, setUsePrimaryInventoryLocation] =
    useState(settings.usePrimaryInventoryLocation);
  const [dailyFullFeedEnabled, setDailyFullFeedEnabled] = useState(
    settings.dailyFullFeedEnabled,
  );
  const [dailyFullFeedTime, setDailyFullFeedTime] = useState(
    settings.dailyFullFeedTime,
  );
  const [deltaIntervalMinutes, setDeltaIntervalMinutes] = useState(
    String(settings.deltaIntervalMinutes ?? 30),
  );
  const [preemptiveOrderPrefix, setPreemptiveOrderPrefix] = useState(
    settings.preemptiveOrderPrefix ?? "",
  );
  const [requirePreemptivePrefix, setRequirePreemptivePrefix] = useState(
    settings.requirePreemptivePrefix,
  );

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Settings saved");
      setKornitxRefId(settings.kornitxRefId);
      setB2bCustomerId(normalizeCustomerId(settings.b2bCustomerId));
      setInventoryLocationId(normalizeLocationId(settings.inventoryLocationId));
      setUsePrimaryInventoryLocation(settings.usePrimaryInventoryLocation);
      setDailyFullFeedEnabled(settings.dailyFullFeedEnabled);
      setDailyFullFeedTime(settings.dailyFullFeedTime);
      setDeltaIntervalMinutes(String(settings.deltaIntervalMinutes ?? 30));
      setPreemptiveOrderPrefix(settings.preemptiveOrderPrefix ?? "");
      setRequirePreemptivePrefix(settings.requirePreemptivePrefix);
    } else if (actionData && "error" in actionData && actionData.error) {
      shopify.toast.show(actionData.error, { isError: true });
    }
  }, [actionData, settings, shopify]);

  const lastFullFeedLabel = settings.lastDailyFullFeedAt
    ? formatUkDateTime(settings.lastDailyFullFeedAt)
    : "Never";

  return (
    <s-page heading="Settings" inlineSize="large">
      <Form method="post">
        <div className={settingsStyles.page}>
          <div className={settingsStyles.toolbar}>
            <s-button
              type="submit"
              variant="primary"
              {...(isSaving ? { loading: true } : {})}
            >
              Save
            </s-button>
          </div>

          <s-section heading="KornitX">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="KornitX Ref ID"
                name="kornitxRefId"
                value={kornitxRefId}
                onChange={(event) => setKornitxRefId(readPolarisValue(event))}
                details="Your KornitX account code (REFID). Used for outbound stock and shipping API calls. API key stays in .env (KORNITX_API_KEY)."
              />
            </s-stack>
          </s-section>

          <s-section heading="Shopify orders">
            <s-stack direction="block" gap="base">
              <s-select
                label="B2B customer"
                name="b2bCustomerId"
                value={b2bCustomerId}
                onChange={(event) => setB2bCustomerId(readPolarisValue(event))}
              >
                <s-option value="">Select a customer</s-option>
                {customers.map((customer) => (
                  <s-option key={customer.id} value={customer.id}>
                    {customer.displayName}
                    {customer.email ? ` (${customer.email})` : ""}
                  </s-option>
                ))}
              </s-select>
              <s-paragraph tone="neutral" color="subdued">
                KornitX orders are created in Shopify with this customer
                attached. If the customer has a default address in Shopify, it
                is used on the order; otherwise the order is created without a
                shipping address.
              </s-paragraph>
            </s-stack>
          </s-section>

          <s-section heading="Next Label Plus orders">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Pre-emptive order prefix"
                name="preemptiveOrderPrefix"
                value={preemptiveOrderPrefix}
                maxLength={2}
                onChange={(event) =>
                  setPreemptiveOrderPrefix(
                    readPolarisValue(event).toUpperCase().slice(0, 2),
                  )
                }
                details="First 2 letters of OrderExternalRef for pre-emptive orders. Confirm with the Next team before requiring it."
              />
              <s-checkbox
                checked={requirePreemptivePrefix}
                onChange={(event) =>
                  setRequirePreemptivePrefix(readPolarisChecked(event))
                }
                label="Require prefix before creating orders"
                details="When enabled, orders fail until a valid 2-letter prefix is set. Turn on once Next confirms the prefix."
              />
              {requirePreemptivePrefix ? (
                <input
                  type="hidden"
                  name="requirePreemptivePrefix"
                  value="on"
                />
              ) : null}

              <s-box padding="base" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text type="strong">Expected inbound values</s-text>
                  <s-paragraph tone="neutral" color="subdued">
                    Brand: Chinti &amp; Parker Ltd · Destination: NextRDC ·
                    Currency: GBP
                  </s-paragraph>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>

          <s-section heading="Inventory sync">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Inventory delta interval (minutes)"
                name="deltaIntervalMinutes"
                value={deltaIntervalMinutes}
                onChange={(event) =>
                  setDeltaIntervalMinutes(readPolarisValue(event))
                }
                details="How often unsent stock changes are sent to KornitX (default 30). Lower during peak if Next accepts the frequency and Shopify rate limits allow it."
              />
              <s-checkbox
                checked={usePrimaryInventoryLocation}
                onChange={(event) =>
                  setUsePrimaryInventoryLocation(readPolarisChecked(event))
                }
                label="Use primary location"
                details="When enabled, inventory qty and daily full feed use your store's primary Shopify location instead of the location selected below."
              />
              {usePrimaryInventoryLocation ? (
                <input
                  type="hidden"
                  name="usePrimaryInventoryLocation"
                  value="on"
                />
              ) : null}
              <input
                type="hidden"
                name="inventoryLocationId"
                value={inventoryLocationId}
              />
              <s-select
                label="Inventory location"
                value={inventoryLocationId}
                disabled={usePrimaryInventoryLocation}
                onChange={(event) => {
                  const value = readPolarisValue(event);
                  setInventoryLocationId(value);
                  if (value) {
                    setUsePrimaryInventoryLocation(false);
                  }
                }}
              >
                <s-option value="">Select a location</s-option>
                {locations.map((location) => (
                  <s-option key={location.id} value={location.id}>
                    {location.name}
                    {location.isPrimary ? " (Primary)" : ""}
                  </s-option>
                ))}
              </s-select>

              <s-checkbox
                checked={dailyFullFeedEnabled}
                onChange={(event) =>
                  setDailyFullFeedEnabled(readPolarisChecked(event))
                }
                label="Enable daily full inventory feed"
                details="When enabled, all tracked products are sent to KornitX once per day at the UK time below — including quantity 0 for out-of-stock items."
              />
              {dailyFullFeedEnabled ? (
                <input type="hidden" name="dailyFullFeedEnabled" value="on" />
              ) : null}
              <div className={settingsStyles.timeField}>
                <label
                  className={settingsStyles.timeLabel}
                  htmlFor="daily-full-feed-time"
                >
                  Daily full feed time (UK)
                </label>
                <input
                  id="daily-full-feed-time"
                  className={settingsStyles.timeInput}
                  type="time"
                  name="dailyFullFeedTime"
                  value={dailyFullFeedTime}
                  onChange={(event) =>
                    setDailyFullFeedTime(event.currentTarget.value)
                  }
                  autoComplete="off"
                />
                <p className={settingsStyles.timeHint}>
                  UK time (Europe/London). Type a time or use the clock picker.
                  Runs at this UK clock time regardless of where the admin is.
                </p>
              </div>
              <s-paragraph tone="neutral" color="subdued">
                Last full feed: <s-text type="strong">{lastFullFeedLabel}</s-text>
                {" "}(UK time)
              </s-paragraph>
              <s-paragraph tone="neutral" color="subdued">
                Stock shown on the Inventory page is read from this location.
                Selecting a location turns off &quot;Use primary location&quot;.
                Out-of-stock items are still listed so you can track them for
                KornitX sync.
              </s-paragraph>
            </s-stack>
          </s-section>

          <s-section heading="Inbound webhook">
            <s-paragraph>KornitX POSTs orders to:</s-paragraph>
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text type="strong">{webhookUrl}</s-text>
            </s-box>
            <s-paragraph tone="neutral" color="subdued">
              Configure Basic auth or a Bearer token in{" "}
              <s-text type="strong">.env</s-text>{" "}
              (<s-text type="strong">KORNITX_WEBHOOK_BASIC_*</s-text> or{" "}
              <s-text type="strong">KORNITX_WEBHOOK_OAUTH_TOKEN</s-text>).
              Inventory delta and daily full feed run via{" "}
              <s-text type="strong">npm run worker:run-jobs</s-text>.
            </s-paragraph>
          </s-section>
        </div>
      </Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
