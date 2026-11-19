-- Phase 2, additive only: daily digest preferences and delivery claims (Requirements 4.1 to 4.4, 10.2, 10.6).
-- Reverse with migrations/down/0005_digest.down.sql. Grants: migrations/grants/0005_digest.grants.sql.
CREATE TABLE "digest_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"hour" smallint NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_preferences_hour_check" CHECK ("hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE TABLE "digest_deliveries" (
	"user_id" uuid NOT NULL,
	"digest_date" date NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"skip_reason" text,
	"claimed_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp (3) with time zone,
	CONSTRAINT "digest_deliveries_user_id_digest_date_pk" PRIMARY KEY("user_id","digest_date"),
	CONSTRAINT "digest_deliveries_status_check" CHECK ("status" IN ('claimed','handed_off','failed','skipped'))
);
--> statement-breakpoint
ALTER TABLE "digest_preferences" ADD CONSTRAINT "digest_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
