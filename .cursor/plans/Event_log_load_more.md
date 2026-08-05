Load more
Purpose: Cursor-based pagination for older events beyond the first page (50 rows).

Page size: ADMIN_EVENT_LOG_PAGE_SIZE = 50 1

UI: <s-button variant="primary">Load more</s-button> at the bottom of the feed — only shown when feed.hasMore === true.

How it works:

First page load (loader or poll) returns { events, nextCursor, hasMore }.

nextCursor = id of the last event on the current page.
hasMore = true if there are more rows in the DB.
User clicks Load more → handleLoadMore() runs:

GET /app/event-logs/data?...filters...&cursor=<lastEventId>
Uses loadMoreFetcher (useFetcher).

Server (fetchEventLogsPageForAdmin):

Same filters as before
cursor: { id: cursor }, skip: 1 — Prisma fetches the next 50 rows older than that id
Ordered by createdAt desc, then id desc
Client merges the new page into tailEvents via appendEventLogTailPage() 2:

headEvents = newest page (updated by poll)
tailEvents = everything loaded via Load more
Display = mergeEventLogFeedDisplay(head, tail) — head first, then tail, deduped by id
Button shows loading state while loadMoreFetcher.state !== "idle".

Important behaviors:

Changing any filter resets tail — Load more history is cleared; you start from page 1 again.
Auto-poll (every 10s by default) only refreshes page 1 (head). It does not re-fetch all loaded pages.
If you’ve loaded more pages, poll updates head but keeps tail; rows displaced from head during poll move into tail so nothing disappears.