ALTER TABLE "event_types" ADD COLUMN "price_djibouti" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_types" ADD COLUMN "price_regions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "event_types" SET "price_djibouti" = 50000, "price_regions" = 65000 WHERE "price_djibouti" = 0 AND "price_regions" = 0;