CREATE TYPE "public"."publish_card_state" AS ENUM('draft', 'exported', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "publish_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"title" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"privacy_level" text,
	"is_aigc" boolean DEFAULT true NOT NULL,
	"scheduled_at" timestamp with time zone,
	"exported_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"state" "publish_card_state" DEFAULT 'draft' NOT NULL,
	"publish_id" text,
	"post_id" text,
	"fail_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_cards_is_aigc_true" CHECK ("publish_cards"."is_aigc" = true)
);
--> statement-breakpoint
ALTER TABLE "publish_cards" ADD CONSTRAINT "publish_cards_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publish_cards_run_id_unique" ON "publish_cards" USING btree ("run_id");
--> statement-breakpoint
-- Backfill: runs that already reached SCHEDULED/PUBLISHING/PUBLISHED before the
-- card existed get a minimal card. Title comes from the run topic; the script
-- title was only available at transition time, so hashtags stay empty and can
-- be edited in the UI.
INSERT INTO "publish_cards" ("run_id", "title", "hashtags", "state", "published_at")
SELECT
	"id",
	"topic",
	'[]'::jsonb,
	CASE
		WHEN "state" = 'PUBLISHED' THEN 'published'::"publish_card_state"
		ELSE 'draft'::"publish_card_state"
	END,
	CASE WHEN "state" = 'PUBLISHED' THEN "updated_at" ELSE NULL END
FROM "runs"
WHERE "state" IN ('SCHEDULED', 'PUBLISHING', 'PUBLISHED')
ON CONFLICT ("run_id") DO NOTHING;