CREATE TYPE "public"."run_tts_provider" AS ENUM('elevenlabs', 'google');--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "tts_provider" "run_tts_provider" DEFAULT 'elevenlabs' NOT NULL;