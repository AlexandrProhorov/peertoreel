CREATE TABLE "asset_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"style_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"model" text,
	"run_id" uuid,
	"source" text NOT NULL,
	"units" integer,
	"cost_usd" numeric(14, 6),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_aliases_key_style_unique" ON "asset_aliases" USING btree ("key","style_id");--> statement-breakpoint
CREATE INDEX "asset_aliases_content_hash_idx" ON "asset_aliases" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "provider_usage_recorded_at_idx" ON "provider_usage" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "provider_usage_run_id_idx" ON "provider_usage" USING btree ("run_id");