CREATE TYPE "public"."run_stage" AS ENUM('topic_discovery', 'research', 'script', 'voiceover', 'visuals', 'render', 'qc', 'publish');--> statement-breakpoint
CREATE TYPE "public"."run_state" AS ENUM('DRAFT', 'RESEARCHING', 'SCRIPT_READY', 'VOICE_READY', 'VISUALS_READY', 'RENDERING', 'REVIEW', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"from_state" "run_state",
	"to_state" "run_state" NOT NULL,
	"stage" "run_stage",
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"topic" text NOT NULL,
	"state" "run_state" DEFAULT 'DRAFT' NOT NULL,
	"current_stage" "run_stage",
	"failed_stage" "run_stage",
	"failure_reason" text,
	"resume_state" "run_state",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_events_run_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_state_idx" ON "runs" USING btree ("state");--> statement-breakpoint
CREATE INDEX "runs_created_by_idx" ON "runs" USING btree ("created_by");