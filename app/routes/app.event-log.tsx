import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  useFetcher,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EventLogEntryCard } from "../components/event-log/event-log-entry-card";
import { EventLogFiltersBar } from "../components/event-log/event-log-filters";
import styles from "../components/event-log/event-log-page.module.css";
import {
  appendEventLogTailPage,
  mergeEventLogFeedDisplay,
  moveDisplacedHeadToTail,
} from "../lib/event-log-feed.client";
import type { EventLogPageResult } from "../models/event-log.server";
import { fetchEventLogsPageForAdmin } from "../models/event-log.server";
import { parseEventLogFilters } from "../../shared/event-log-filters";
import { EVENT_LOG_POLL_INTERVAL_MS } from "../../shared/event-log";
import { formatUkDateTime } from "../../shared/uk-time";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseEventLogFilters(url.searchParams);
  return fetchEventLogsPageForAdmin(session.shop, filters);
};

export default function EventLogPage() {
  const initialData = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const pollFetcher = useFetcher<EventLogPageResult>();
  const loadMoreFetcher = useFetcher<EventLogPageResult>();

  const [headEvents, setHeadEvents] = useState(initialData.events);
  const [tailEvents, setTailEvents] = useState<EventLogPageResult["events"]>(
    [],
  );
  const [hasMore, setHasMore] = useState(initialData.hasMore);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => new Date());
  const previousHeadRef = useRef(initialData.events);
  const filtersKey = searchParams.toString();

  const filters = initialData.filters;
  const displayEvents = useMemo(
    () => mergeEventLogFeedDisplay(headEvents, tailEvents),
    [headEvents, tailEvents],
  );

  useEffect(() => {
    setHeadEvents(initialData.events);
    setTailEvents([]);
    setHasMore(initialData.hasMore);
    previousHeadRef.current = initialData.events;
    setLastRefreshAt(new Date());
  }, [filtersKey, initialData]);

  const refreshHead = useCallback(() => {
    const query = searchParams.toString();
    pollFetcher.load(`/app/event-log/data${query ? `?${query}` : ""}`);
  }, [pollFetcher, searchParams]);

  useEffect(() => {
    const interval = window.setInterval(refreshHead, EVENT_LOG_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refreshHead]);

  useEffect(() => {
    if (pollFetcher.state !== "idle" || !pollFetcher.data) return;

    const nextHead = pollFetcher.data.events;
    setTailEvents((tail) =>
      moveDisplacedHeadToTail(previousHeadRef.current, nextHead, tail),
    );
    previousHeadRef.current = nextHead;
    setHeadEvents(nextHead);
    setHasMore((prev) =>
      tailEvents.length > 0 ? prev : pollFetcher.data!.hasMore,
    );
    setLastRefreshAt(new Date());
  }, [pollFetcher.state, pollFetcher.data, tailEvents.length]);

  useEffect(() => {
    if (loadMoreFetcher.state !== "idle" || !loadMoreFetcher.data) return;

    setTailEvents((tail) =>
      appendEventLogTailPage(tail, loadMoreFetcher.data!.events),
    );
    setHasMore(loadMoreFetcher.data.hasMore);
  }, [loadMoreFetcher.state, loadMoreFetcher.data]);

  const handleLoadMore = () => {
    const lastId =
      displayEvents[displayEvents.length - 1]?.id ??
      headEvents[headEvents.length - 1]?.id;
    if (!lastId) return;

    const params = new URLSearchParams(searchParams);
    params.set("cursor", String(lastId));
    loadMoreFetcher.load(`/app/event-log/data?${params.toString()}`);
  };

  const isLoadingMore = loadMoreFetcher.state !== "idle";

  return (
    <s-page heading="Event log" inlineSize="large">
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={refreshHead}
      >
        Refresh now
      </s-button>

      <div className={styles.eventLogPage}>
        <div className={styles.infoBanner}>
          <div className={styles.infoBannerTitle}>Operational feed</div>
          <s-paragraph>
            Structured application events (newest first). Refreshes every 30
            seconds. 50 per page — use Load more for older matches.
          </s-paragraph>
          <div className={styles.lastRefresh}>
            Last refresh: {formatUkDateTime(lastRefreshAt)}
          </div>
        </div>

        <div className={styles.filterCard}>
          <EventLogFiltersBar filters={filters} />
        </div>

        {displayEvents.length === 0 ? (
          <div className={styles.emptyState}>
            <s-text>No events match your filters.</s-text>
          </div>
        ) : (
          <div className={styles.feedList}>
            {displayEvents.map((event) => (
              <EventLogEntryCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {hasMore ? (
          <div className={styles.loadMoreWrap}>
            <s-button
              variant="primary"
              onClick={handleLoadMore}
              loading={isLoadingMore}
            >
              Load more
            </s-button>
          </div>
        ) : null}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
