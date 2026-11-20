ALTER TABLE "quotes" ADD COLUMN "sign_token" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "signature_data" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "sent_via" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_host" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_port" integer DEFAULT 587 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_user" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_password" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_from" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "smtp_secure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "app_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_sign_token_idx" ON "quotes" USING btree ("sign_token");