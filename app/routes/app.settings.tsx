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
  updateAppSettings,
} from "../models/app-settings.server";
import { fetchCustomers } from "../services/shopify-admin.server";
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

function normalizeCustomerId(value: string): string {
  return value.startsWith("gid://shopify/Customer/") ? value : "";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const settings = await getOrCreateAppSettings(session.shop);
  const customers = await fetchCustomers(admin);

  return {
    settings,
    customers,
    webhookUrl: process.env.SHOPIFY_APP_URL
      ? `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/webhooks/kornitx/orders`
      : "/webhooks/kornitx/orders",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  await updateAppSettings(session.shop, {
    kornitxRefId: String(formData.get("kornitxRefId") ?? "").trim(),
    b2bCustomerId: normalizeCustomerId(
      String(formData.get("b2bCustomerId") ?? ""),
    ),
  });

  return { ok: true as const };
};

export default function SettingsPage() {
  const { settings, customers, webhookUrl } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const isSaving = navigation.state !== "idle";

  const [kornitxRefId, setKornitxRefId] = useState(settings.kornitxRefId);
  const [b2bCustomerId, setB2bCustomerId] = useState(
    normalizeCustomerId(settings.b2bCustomerId),
  );

  useEffect(() => {
    if (actionData?.ok) {
      shopify.toast.show("Settings saved");
      setKornitxRefId(settings.kornitxRefId);
      setB2bCustomerId(normalizeCustomerId(settings.b2bCustomerId));
    }
  }, [actionData?.ok, settings, shopify]);

  return (
    <s-page heading="Settings">
      <Form method="post">
        <s-button
          slot="primary-action"
          type="submit"
          variant="primary"
          {...(isSaving ? { loading: true } : {})}
        >
          Save
        </s-button>

        <s-section heading="KornitX">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="KornitX Ref ID"
              name="kornitxRefId"
              value={kornitxRefId}
              onChange={(event) => setKornitxRefId(readPolarisValue(event))}
              details="Your KornitX account code (REFID). Used for outbound stock and shipping API calls when those workers are built. Inbound webhook auth stays in .env."
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
              KornitX orders are created in Shopify with this customer attached.
              The customer&apos;s saved address in Shopify is used if present.
            </s-paragraph>
          </s-stack>
        </s-section>
      </Form>

      <s-section slot="aside" heading="Inbound webhook">
        <s-paragraph>KornitX POSTs orders to:</s-paragraph>
        <s-box padding="base" background="subdued" borderRadius="base">
          <s-text type="strong">{webhookUrl}</s-text>
        </s-box>
        <s-paragraph tone="neutral" color="subdued">
          Configure Basic auth or a Bearer token in <s-text type="strong">.env</s-text>{" "}
          (<s-text type="strong">KORNITX_WEBHOOK_BASIC_*</s-text> or{" "}
          <s-text type="strong">KORNITX_WEBHOOK_OAUTH_TOKEN</s-text>). Stock sync
          runs on a schedule via <s-text type="strong">npm run worker:stock-delta</s-text>{" "}
          (EventBridge in production) — not from this page.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
