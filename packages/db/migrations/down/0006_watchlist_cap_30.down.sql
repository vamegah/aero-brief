-- Reverses 0006_watchlist_cap_30.sql. Not in meta/_journal.json, so the Drizzle migrator never runs it.
-- Run all statements in ONE transaction, with the owner's approval, after the code is reverted and deployed.
-- Effects: the stored 30-airport Snapshots and the New_Airports' events are deleted, so the dashboard
-- shows "no data" until the next poll. Subscriptions, users and alert_log rows are never deleted.
CREATE OR REPLACE FUNCTION enforce_subscription_cap() RETURNS trigger AS $$
BEGIN
	PERFORM 1 FROM "users" WHERE "id" = NEW."user_id" FOR UPDATE;
	IF (SELECT count(*) FROM "subscriptions" WHERE "user_id" = NEW."user_id") >= 10 THEN
		RAISE EXCEPTION 'subscription limit of 10 reached' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- The previous code rejects a Snapshot that does not list exactly 20 airports.
DELETE FROM "snapshots" WHERE jsonb_array_length("airports") <> 20;
--> statement-breakpoint
DELETE FROM "events" WHERE "airport_id" IN ('BWI','CLT','FLL','HNL','IAD','LGA','MDW','PHL','SAN','TPA');
--> statement-breakpoint
-- Keeps any airport a user still watches.
DELETE FROM "airports" a WHERE a."id" IN ('BWI','CLT','FLL','HNL','IAD','LGA','MDW','PHL','SAN','TPA')
  AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."airport_id" = a."id");
