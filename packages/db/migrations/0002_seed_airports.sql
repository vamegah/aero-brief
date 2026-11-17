-- Custom migration: seed the 20 monitored airports (Requirement 2.6) and the poller lease row.
-- The values below must equal packages/core/src/airports.ts, the source of truth. They are the
-- output of renderAirportsInsertSql() in packages/db/src/seed.ts. Regenerate, do not hand-edit.
--
-- Runtime role (Requirements 14.3, 11.1): `airports` is read-only at runtime. The Workers connect
-- as a role that has SELECT only on `airports`. Run once as the database owner, with your role name:
--   CREATE ROLE aerobrief_runtime LOGIN;  -- or create it in the Neon console and use its URL
--   GRANT USAGE ON SCHEMA public TO aerobrief_runtime;
--   GRANT SELECT ON "airports" TO aerobrief_runtime;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON "snapshots", "events", "subscriptions", "alert_log",
--     "users", "sessions", "magic_links", "job_runs", "poller_lease" TO aerobrief_runtime;
--   -- Do not grant INSERT, UPDATE, DELETE or TRUNCATE on "airports". Migrations run as the owner.
-- Grants are not in this file because the role name differs per environment.
INSERT INTO "airports" ("id", "name", "artcc") VALUES
  ('ATL', 'Hartsfield-Jackson Atlanta International', 'ZTL'),
  ('BOS', 'Boston Logan International', 'ZBW'),
  ('DCA', 'Ronald Reagan Washington National', 'ZDC'),
  ('DEN', 'Denver International', 'ZDV'),
  ('DFW', 'Dallas/Fort Worth International', 'ZFW'),
  ('DTW', 'Detroit Metropolitan Wayne County', 'ZOB'),
  ('EWR', 'Newark Liberty International', 'ZNY'),
  ('IAH', 'George Bush Intercontinental Houston', 'ZHU'),
  ('JFK', 'John F. Kennedy International', 'ZNY'),
  ('LAS', 'Harry Reid International', 'ZLA'),
  ('LAX', 'Los Angeles International', 'ZLA'),
  ('MCO', 'Orlando International', 'ZJX'),
  ('MEM', 'Memphis International', 'ZME'),
  ('MIA', 'Miami International', 'ZMA'),
  ('MSP', 'Minneapolis-Saint Paul International', 'ZMP'),
  ('ORD', 'Chicago O''Hare International', 'ZAU'),
  ('PHX', 'Phoenix Sky Harbor International', 'ZAB'),
  ('SEA', 'Seattle-Tacoma International', 'ZSE'),
  ('SFO', 'San Francisco International', 'ZOA'),
  ('SLC', 'Salt Lake City International', 'ZLC')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Single lease row (id = 1), initially expired, so the poller's conditional UPDATE can claim it.
INSERT INTO "poller_lease" ("id", "locked_until") VALUES (1, '1970-01-01 00:00:00+00')
ON CONFLICT ("id") DO NOTHING;
