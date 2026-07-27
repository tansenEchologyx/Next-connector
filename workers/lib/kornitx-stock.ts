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

export async function sendStockAvailabilityToKornitx(
  settings: AppSettings | null,
  rows: StockAvailabilityRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const { refId, apiKey } = loadKornitxApiCredentials(settings);
  const url = getKornitxStockUrl();

  for (let index = 0; index < rows.length; index += MAX_EANS_PER_BATCH) {
    const batch = rows.slice(index, index + MAX_EANS_PER_BATCH);
    const body = batch.map((row) => ({
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
}

export { MAX_EANS_PER_BATCH };
