import { Link } from "react-router";

import type { EventLogRow } from "../../models/event-log.server";
import {
  EVENT_LOG_CATEGORY_LABELS,
  type EventLogCategory,
  type EventLogLevel,
} from "../../../shared/event-log";
import styles from "./event-log-page.module.css";

const LEVEL_CLASS: Record<EventLogLevel, string> = {
  info: styles.levelInfo,
  success: styles.levelSuccess,
  warn: styles.levelWarn,
  error: styles.levelError,
};

type EventLogEntryCardProps = {
  event: EventLogRow;
};

function orderSearchQuery(event: EventLogRow): string | null {
  if (event.shopifyOrderName) return event.shopifyOrderName;
  if (event.kornitxOrderId) return event.kornitxOrderId;
  if (event.shopifyOrderId) return event.shopifyOrderId;
  return null;
}

export function EventLogEntryCard({ event }: EventLogEntryCardProps) {
  const level = event.level as EventLogLevel;
  const category = event.category as EventLogCategory;
  const levelClass = LEVEL_CLASS[level] ?? styles.levelInfo;
  const categoryLabel =
    EVENT_LOG_CATEGORY_LABELS[category] ?? event.category.toUpperCase();
  const orderQuery = orderSearchQuery(event);

  return (
    <article className={styles.eventCard}>
      <div className={styles.eventHeader}>
        <div className={styles.eventMeta}>
          <span className={`${styles.levelBadge} ${levelClass}`}>
            {level.toUpperCase()}
          </span>
          <span className={styles.categoryBadge}>{categoryLabel}</span>
          <span className={styles.eventName}>{event.eventName}</span>
        </div>
        <time className={styles.eventTime} dateTime={event.createdAt}>
          {event.createdAtLabel}
        </time>
      </div>
      <div className={styles.eventMessage}>
        {event.message}
        {orderQuery ? (
          <>
            {" "}
            <Link className={styles.orderLink} to={`/app/orders?q=${encodeURIComponent(orderQuery)}`}>
              {event.shopifyOrderName ?? event.kornitxOrderId ?? orderQuery}
            </Link>
          </>
        ) : null}
      </div>
    </article>
  );
}
