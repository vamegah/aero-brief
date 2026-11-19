import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** All timestamps are timestamptz with millisecond precision (design: Data Models). */
const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

// ---------------------------------------------------------------------------
// Core tables
// ---------------------------------------------------------------------------

/**
 * Seeded by migration from packages/core/src/airports.ts (the source of truth).
 * Read-only at runtime; the runtime role has SELECT only (see migrations/0002).
 */
export const airports = pgTable("airports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  artcc: text("artcc").notNull(),
});

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capturedAt: ts("captured_at").notNull(),
    airports: jsonb("airports").notNull(),
  },
  (t) => [index("snapshots_captured_at_idx").on(t.capturedAt.desc())],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FAA_Event_ID, or `NATIONWIDE:{previousSnapshotId}`. */
    eventKey: text("event_key").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    type: text("type").notNull(),
    airportId: text("airport_id"),
    occurredAt: ts("occurred_at").notNull(),
    payload: jsonb("payload").notNull(),
    /** User-facing text from the Explanation_Mapper. */
    explanation: text("explanation").notNull(),
  },
  (t) => [
    unique("events_event_key_type_unique").on(t.eventKey, t.type),
    index("events_occurred_at_idx").on(t.occurredAt.desc()),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`)],
);

/** The Watchlist. The cap of 10 is enforced by trigger `enforce_subscription_cap` (migration 0001). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    airportId: text("airport_id")
      .notNull()
      .references(() => airports.id),
    addedAt: ts("added_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.airportId] })],
);

/** Alert delivery record. `event_id` deliberately has no FK so purging events keeps latency records. */
export const alertLog = pgTable(
  "alert_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending | handed_off | failed */
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    snapshotStoredAt: ts("snapshot_stored_at").notNull(),
    completedAt: ts("completed_at"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [unique("alert_log_event_key_event_type_user_id_unique").on(t.eventKey, t.eventType, t.userId)],
);

// ---------------------------------------------------------------------------
// Supporting tables
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [unique("sessions_token_hash_unique").on(t.tokenHash)],
);

export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: ts("created_at").defaultNow().notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    invalidatedAt: ts("invalidated_at"),
  },
  (t) => [
    unique("magic_links_token_hash_unique").on(t.tokenHash),
    index("magic_links_email_created_at_idx").on(t.email, t.createdAt),
  ],
);

/**
 * One row per poll or cleanup run. A failed poll sets outcome = 'failed', failure_kind to one of
 * timeout | http_status | unparseable | validation | storage, and detail (e.g. the HTTP status).
 * The stale flag reads the latest snapshot; this table is for observability.
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** poll | cleanup */
    job: text("job").notNull(),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    /** success | failed */
    outcome: text("outcome").notNull(),
    failureKind: text("failure_kind"),
    detail: text("detail"),
    snapshotId: uuid("snapshot_id"),
  },
  (t) => [index("job_runs_started_at_idx").on(t.startedAt)],
);

/** Single row (id = 1). Created by migration 0002 so the lease UPDATE has a row to claim. */
export const pollerLease = pgTable("poller_lease", {
  id: integer("id").primaryKey(),
  lockedUntil: ts("locked_until").notNull(),
  /** Random token of the run holding the lease. Release only clears the lease for this token. */
  holder: text("holder"),
});

// ---------------------------------------------------------------------------
// Phase 2: signed outbound webhooks (migration 0004_webhooks)
// ---------------------------------------------------------------------------

/**
 * A User's outbound webhook. The cap of 3 per User is enforced by trigger `enforce_webhook_cap`
 * (migration 0004). The signing secret is derived from WEBHOOK_MASTER_SECRET and the id, never stored.
 */
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    host: text("host").notNull(),
    /** active | disabled */
    state: text("state").default("active").notNull(),
    consecutiveFailures: smallint("consecutive_failures").default(0).notNull(),
    disabledReason: text("disabled_reason"),
    disabledAt: ts("disabled_at"),
    /** delivered | failed | skipped */
    lastOutcome: text("last_outcome"),
    lastOutcomeAt: ts("last_outcome_at"),
    lastTestAt: ts("last_test_at"),
    /** delivered | failed */
    lastTestOutcome: text("last_test_outcome"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("webhooks_user_idx").on(t.userId),
    check("webhooks_url_length_check", sql`length(${t.url}) <= 2048`),
    check("webhooks_state_check", sql`${t.state} IN ('active','disabled')`),
    check("webhooks_consecutive_failures_check", sql`${t.consecutiveFailures} >= 0`),
    check("webhooks_last_outcome_check", sql`${t.lastOutcome} IN ('delivered','failed','skipped')`),
    check("webhooks_last_test_outcome_check", sql`${t.lastTestOutcome} IN ('delivered','failed')`),
  ],
);

/** One claimed delivery per (webhook, event). `id` is the Delivery_ID. */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    /** pending | delivered | failed | skipped */
    outcome: text("outcome").default("pending").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    lastStatus: integer("last_status"),
    lastErrorKind: text("last_error_kind"),
    createdAt: ts("created_at").defaultNow().notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    unique("webhook_deliveries_webhook_id_event_key_event_type_unique").on(t.webhookId, t.eventKey, t.eventType),
    check("webhook_deliveries_outcome_check", sql`${t.outcome} IN ('pending','delivered','failed','skipped')`),
  ],
);

// ---------------------------------------------------------------------------
// Phase 2: daily digest (migration 0005_digest)
// ---------------------------------------------------------------------------

/** A User's digest preference. No row means disabled; the default hour 7 is a UI preselection only. */
export const digestPreferences = pgTable(
  "digest_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    /** UTC hour of day, 0 to 23. */
    hour: smallint("hour").notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [check("digest_preferences_hour_check", sql`${t.hour} BETWEEN 0 AND 23`)],
);

/** One claim per (user, digest date). The primary key is the claim key. */
export const digestDeliveries = pgTable(
  "digest_deliveries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    digestDate: date("digest_date").notNull(),
    /** claimed | handed_off | failed | skipped */
    status: text("status").default("claimed").notNull(),
    attempts: smallint("attempts").default(0).notNull(),
    skipReason: text("skip_reason"),
    claimedAt: ts("claimed_at").defaultNow().notNull(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.digestDate] }),
    check("digest_deliveries_status_check", sql`${t.status} IN ('claimed','handed_off','failed','skipped')`),
  ],
);
