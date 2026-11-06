-- The 0005 backfill copied runs.topic verbatim; topics may be up to 300 chars
-- while the card title is limited to 150. Truncate before adding the check.
UPDATE "publish_cards"
SET "title" = left("title", 150), "updated_at" = now()
WHERE char_length("title") > 150;
--> statement-breakpoint
ALTER TABLE "publish_cards" ADD CONSTRAINT "publish_cards_title_length" CHECK (char_length("publish_cards"."title") between 1 and 150);