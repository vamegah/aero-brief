-- Reverses 0004_webhooks.sql. Not in meta/_journal.json, so the Drizzle migrator never runs it.
DROP TRIGGER IF EXISTS "enforce_webhook_cap" ON "webhooks";
DROP FUNCTION IF EXISTS enforce_webhook_cap();
DROP TABLE IF EXISTS "webhook_deliveries";
DROP TABLE IF EXISTS "webhooks";
