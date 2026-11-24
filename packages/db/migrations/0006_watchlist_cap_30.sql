-- Custom migration: Watchlist cap of 30 and the 10 Core 30 airports added to the 20 seeded by 0002.
-- Safe to run twice. The trigger enforce_subscription_cap (0001) calls this function by name, so
-- replacing the function is enough. The API maps SQLSTATE 23514 with "subscription limit" to its
-- watchlist_full response.
-- Reverse with migrations/down/0006_watchlist_cap_30.down.sql.
CREATE OR REPLACE FUNCTION enforce_subscription_cap() RETURNS trigger AS $$
BEGIN
	PERFORM 1 FROM "users" WHERE "id" = NEW."user_id" FOR UPDATE;
	IF (SELECT count(*) FROM "subscriptions" WHERE "user_id" = NEW."user_id") >= 30 THEN
		RAISE EXCEPTION 'subscription limit of 30 reached' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
INSERT INTO "airports" ("id", "name", "artcc") VALUES
  ('BWI', 'Baltimore/Washington International Thurgood Marshall', 'ZDC'),
  ('CLT', 'Charlotte Douglas International', 'ZTL'),
  ('FLL', 'Fort Lauderdale-Hollywood International', 'ZMA'),
  ('HNL', 'Daniel K. Inouye International (Honolulu)', 'ZHN'),
  ('IAD', 'Washington Dulles International', 'ZDC'),
  ('LGA', 'New York LaGuardia', 'ZNY'),
  ('MDW', 'Chicago Midway International', 'ZAU'),
  ('PHL', 'Philadelphia International', 'ZDC'),
  ('SAN', 'San Diego International', 'ZLA'),
  ('TPA', 'Tampa International', 'ZJX')
ON CONFLICT ("id") DO NOTHING;
