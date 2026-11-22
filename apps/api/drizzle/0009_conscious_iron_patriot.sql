CREATE TYPE "public"."run_mode" AS ENUM('pipeline', 'episode');--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'episode_plan';--> statement-breakpoint
ALTER TYPE "public"."run_stage" ADD VALUE 'episode_render';--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "mode" "run_mode" DEFAULT 'pipeline' NOT NULL;