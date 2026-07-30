import type { AppSettings } from "@prisma/client";

import {
  kornitxBasicAuthHeader,
  loadKornitxApiCredentials,
  parseKornitxHttpResponse,
} from "../../shared/kornitx-credentials";
import { getKornitxStockUrl } from "../../shared/kornitx-outbound-urls";

export type StockAvailabilityRow = {
  ean: string;
  quantity: number;
};

const MAX_EANS_PER_BATCH = 100;

export async function sendStockAvailabilityBatchToKornitx(
  settings: AppSettings | null,
  rows: StockAvailabilityRow[],
): Promise<void> {
  if (rows.length === 0) return;

  if (rows.length > MAX_EANS_PER_BATCH) {
    throw new Error(
      `Stock batch exceeds ${MAX_EANS_PER_BATCH} EANs (got ${rows.length})`,
    );
  }

  const { refId, apiKey } = loadKornitxApiCredentials(settings);
  const url = getKornitxStockUrl();

  const body = rows.map((row) => ({
    barcode: row.ean,
    data: { quantity_available: row.quantity },
  }));

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: kornitxBasicAuthHeader(refId, apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  await parseKornitxHttpResponse(response, "stock");
}

export async function sendStockAvailabilityToKornitx(
  settings: AppSettings | null,
  rows: StockAvailabilityRow[],
): Promise<void> {
  for (let index = 0; index < rows.length; index += MAX_EANS_PER_BATCH) {
    const batch = rows.slice(index, index + MAX_EANS_PER_BATCH);
    await sendStockAvailabilityBatchToKornitx(settings, batch);
  }
}

export { MAX_EANS_PER_BATCH };
