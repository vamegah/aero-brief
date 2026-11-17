-- Custom migration: Watchlist cap of 10 airports per user (Requirements 8.8, 11.1).
-- The API also checks the cap with a pure function. This trigger closes the race where two
-- concurrent adds both pass the API check. The users row lock serializes adds for one user.
-- The API maps SQLSTATE 23514 with this message to its "limit of 10" response.
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
CREATE TRIGGER "enforce_subscription_cap"
	BEFORE INSERT ON "subscriptions"
	FOR EACH ROW EXECUTE FUNCTION enforce_subscription_cap();
