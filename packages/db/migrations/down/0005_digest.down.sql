-- Reverses 0005_digest.sql. Not in meta/_journal.json, so the Drizzle migrator never runs it.
DROP TABLE IF EXISTS "digest_deliveries";
DROP TABLE IF EXISTS "digest_preferences";
