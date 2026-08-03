import type { AppSettings } from "@prisma/client";

import {
  isShippingAddressComplete,
  type ShippingAddress,
} from "../../app/models/app-settings.server";
import { shopifyAdminGraphql } from "./shopify-graphql";

export type OrderShippingAddress = {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  countryCode?: string;
  phone?: string;
};

function toOrderShippingAddress(
  address: ShippingAddress,
): OrderShippingAddress {
  return {
    firstName: address.firstName?.trim() || undefined,
    lastName: address.lastName?.trim() || undefined,
    company: address.company?.trim() || undefined,
    address1: address.address1!.trim(),
    address2: address.address2?.trim() || undefined,
    city: address.city!.trim(),
    province: address.province?.trim() || undefined,
    zip: address.zip!.trim(),
    countryCode: address.country?.trim().toUpperCase() || undefined,
    phone: address.phone?.trim() || undefined,
  };
}

async function fetchCustomerDefaultAddress(
  shop: string,
  accessToken: string,
  customerId: string,
): Promise<ShippingAddress | null> {
  const data = await shopifyAdminGraphql<{
    customer: {
      defaultAddress: {
        firstName: string | null;
        lastName: string | null;
        company: string | null;
        address1: string | null;
        address2: string | null;
        city: string | null;
        province: string | null;
        zip: string | null;
        countryCodeV2: string | null;
        phone: string | null;
      } | null;
    } | null;
  }>(
    shop,
    accessToken,
    `#graphql
      query ConnectorCustomerDefaultAddress($id: ID!) {
        customer(id: $id) {
          defaultAddress {
            firstName
            lastName
            company
            address1
            address2
            city
            province
            zip
            countryCodeV2
            phone
          }
        }
      }`,
    { id: customerId },
  );

  const address = data.customer?.defaultAddress;
  if (!address) return null;

  return {
    firstName: address.firstName ?? undefined,
    lastName: address.lastName ?? undefined,
    company: address.company ?? undefined,
    address1: address.address1 ?? undefined,
    address2: address.address2 ?? undefined,
    city: address.city ?? undefined,
    province: address.province ?? undefined,
    zip: address.zip ?? undefined,
    country: address.countryCodeV2 ?? undefined,
    phone: address.phone ?? undefined,
  };
}

/**
 * Optional shipping address from the B2B customer's Shopify default address.
 * Returns null when missing/incomplete — orderCreate proceeds without shippingAddress.
 */
export async function resolveOptionalCustomerShippingAddress(
  shop: string,
  accessToken: string,
  settings: AppSettings,
): Promise<OrderShippingAddress | null> {
  if (!settings.b2bCustomerId) return null;

  const customerAddress = await fetchCustomerDefaultAddress(
    shop,
    accessToken,
    settings.b2bCustomerId,
  );

  if (!isShippingAddressComplete(customerAddress)) {
    return null;
  }

  return toOrderShippingAddress(customerAddress!);
}
