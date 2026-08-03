import type { AppSettings } from "@prisma/client";

import {
  CONFIG_ERROR_CODES,
  configurationError,
} from "./configuration-error";

export type KornitxApiCredentials = {
  refId: string;
  apiKey: string;
};

export function loadKornitxApiCredentials(
  settings: AppSettings | null,
): KornitxApiCredentials {
  const refId =
    settings?.kornitxRefId?.trim() || process.env.KORNITX_REF_ID?.trim();
  const apiKey = process.env.KORNITX_API_KEY?.trim();

  if (!refId) {
    throw configurationError(CONFIG_ERROR_CODES.KORNITX_REF_ID);
  }
  if (!apiKey) {
    throw configurationError(CONFIG_ERROR_CODES.KORNITX_API_KEY);
  }

  return { refId, apiKey };
}

export function kornitxBasicAuthHeader(refId: string, apiKey: string): string {
  const token = Buffer.from(`${refId}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

export async function parseKornitxHttpResponse(
  response: Response,
  apiName: string,
): Promise<void> {
  if (response.ok) {
    console.log(`[kornitx] ${apiName} HTTP ${response.status} OK`);
    return;
  }

  const body = await response.text();
  console.error(
    `[kornitx] ${apiName} HTTP ${response.status} failed: ${body.slice(0, 500)}`,
  );
  throw new Error(`KornitX ${apiName} HTTP ${response.status}: ${body}`);
}
