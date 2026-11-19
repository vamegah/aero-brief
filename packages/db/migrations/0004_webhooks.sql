-- Phase 2, additive only: signed outbound webhooks (Requirements 4.1 to 4.4, 13.2).
-- Reverse with migrations/down/0004_webhooks.down.sql. Grants: migrations/grants/0004_webhooks.grants.sql.
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"host" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"consecutive_failures" smallint DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"disabled_at" timestamp (3) with time zone,
	"last_outcome" text,
	"last_outcome_at" timestamp (3) with time zone,
	"last_test_at" timestamp (3) with time zone,
	"last_test_outcome" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhooks_url_length_check" CHECK (length("url") <= 2048),
	CONSTRAINT "webhooks_state_check" CHECK ("state" IN ('active','disabled')),
	CONSTRAINT "webhooks_consecutive_failures_check" CHECK ("consecutive_failures" >= 0),
	CONSTRAINT "webhooks_last_outcome_check" CHECK ("last_outcome" IN ('delivered','failed','skipped')),
	CONSTRAINT "webhooks_last_test_outcome_check" CHECK ("last_test_outcome" IN ('delivered','failed'))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_status" integer,
	"last_error_kind" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "webhook_deliveries_webhook_id_event_key_event_type_unique" UNIQUE("webhook_id","event_key","event_type"),
	CONSTRAINT "webhook_deliveries_outcome_check" CHECK ("outcome" IN ('pending','delivered','failed','skipped'))
);
--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "webhooks_user_idx" ON "webhooks" USING btree ("user_id");
--> statement-breakpoint
-- Cap of 3 webhooks per user, mirroring 0001_enforce_subscription_cap: the users row lock serializes
-- concurrent inserts for one user, then the count runs. The API maps SQLSTATE 23514 with this message.
CREATE OR REPLACE FUNCTION enforce_webhook_cap() RETURNS trigger AS $$
BEGIN
	PERFORM 1 FROM "users" WHERE "id" = NEW."user_id" FOR UPDATE;
	IF (SELECT count(*) FROM "webhooks" WHERE "user_id" = NEW."user_id") >= 3 THEN
		RAISE EXCEPTION 'webhook limit of 3 reached' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "enforce_webhook_cap"
	BEFORE INSERT ON "webhooks"
	FOR EACH ROW EXECUTE FUNCTION enforce_webhook_cap();
