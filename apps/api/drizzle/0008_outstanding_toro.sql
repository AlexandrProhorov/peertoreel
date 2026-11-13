CREATE TYPE "public"."asset_kind" AS ENUM('svg', 'png', 'raster-cutout');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('starter', 'library', 'recraft', 'flux', 'upload');--> statement-breakpoint
CREATE TABLE "asset_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"source" "asset_source" NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"style_id" text DEFAULT 'studio_flat_2d_v1' NOT NULL,
	"content_hash" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"license_name" text NOT NULL,
	"commercial_use" boolean DEFAULT true NOT NULL,
	"attribution" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_commercial_use_true" CHECK ("assets"."commercial_use" = true)
);
--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_variants_asset_variant_unique" ON "asset_variants" USING btree ("asset_id","variant_id");--> statement-breakpoint
CREATE INDEX "asset_variants_object_key_idx" ON "asset_variants" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "asset_variants_content_hash_idx" ON "asset_variants" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_key_style_unique" ON "assets" USING btree ("key","style_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_content_hash_unique" ON "assets" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "assets_tags_idx" ON "assets" USING gin ("tags");