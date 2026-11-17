CREATE TABLE "airports" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"artcc" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"snapshot_stored_at" timestamp (3) with time zone NOT NULL,
	"completed_at" timestamp (3) with time zone,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_log_event_key_event_type_user_id_unique" UNIQUE("event_key","event_type","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"type" text NOT NULL,
	"airport_id" text,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"explanation" text NOT NULL,
	CONSTRAINT "events_event_key_type_unique" UNIQUE("event_key","type")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"finished_at" timestamp (3) with time zone,
	"outcome" text NOT NULL,
	"failure_kind" text,
	"detail" text,
	"snapshot_id" uuid
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	"invalidated_at" timestamp (3) with time zone,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "poller_lease" (
	"id" integer PRIMARY KEY NOT NULL,
	"locked_until" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"captured_at" timestamp (3) with time zone NOT NULL,
	"airports" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"user_id" uuid NOT NULL,
	"airport_id" text NOT NULL,
	"added_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_user_id_airport_id_pk" PRIMARY KEY("user_id","airport_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_log" ADD CONSTRAINT "alert_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_airport_id_airports_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_occurred_at_idx" ON "events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_started_at_idx" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "magic_links_email_created_at_idx" ON "magic_links" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "snapshots_captured_at_idx" ON "snapshots" USING btree ("captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));
