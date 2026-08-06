import type { LoaderFunctionArgs } from "react-router";

import { fetchEventLogsPageForAdmin } from "../models/event-log.server";
import { parseEventLogFilters } from "../../shared/event-log-filters";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseEventLogFilters(url.searchParams);
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw ? Number(cursorRaw) : null;

  return fetchEventLogsPageForAdmin(
    session.shop,
    filters,
    Number.isFinite(cursor) ? cursor : null,
  );
};
