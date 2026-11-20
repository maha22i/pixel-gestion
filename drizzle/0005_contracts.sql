ALTER TABLE "settings" ADD COLUMN "signatory_name" text DEFAULT 'Aboubaker Adoyta Hassan' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "signatory_title" text DEFAULT 'Gérant' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "registration_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "acronym" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "nif" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_civility" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_name" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "rep_title" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_role" text;--> statement-breakpoint
CREATE TABLE "contracts" (
  "id" serial PRIMARY KEY,
  "number" text,
  "status" text DEFAULT 'brouillon' NOT NULL,
  "client_id" integer REFERENCES "clients"("id") ON DELETE restrict,
  "project_id" integer REFERENCES "projects"("id") ON DELETE set null,
  "quote_id" integer REFERENCES "quotes"("id") ON DELETE set null,
  "template_name" text,
  "title" text DEFAULT '' NOT NULL,
  "subtitle" text DEFAULT '' NOT NULL,
  "preamble" text DEFAULT '' NOT NULL,
  "start_date" date,
  "end_date" date,
  "duration_value" integer,
  "duration_unit" text DEFAULT 'months' NOT NULL,
  "signature_date" date,
  "signature_place" text DEFAULT 'Djibouti' NOT NULL,
  "amount_mode" text DEFAULT 'monthly' NOT NULL,
  "monthly_amount" integer DEFAULT 0 NOT NULL,
  "total_amount" integer DEFAULT 0 NOT NULL,
  "tax_mode" text DEFAULT 'unspecified' NOT NULL,
  "payment_terms" text DEFAULT '' NOT NULL,
  "payment_methods" text DEFAULT '' NOT NULL,
  "include_signature" boolean DEFAULT true NOT NULL,
  "client_name" text DEFAULT '' NOT NULL,
  "client_acronym" text DEFAULT '' NOT NULL,
  "client_type" text DEFAULT '' NOT NULL,
  "client_address" text DEFAULT '' NOT NULL,
  "client_nif" text DEFAULT '' NOT NULL,
  "rep_civility" text DEFAULT '' NOT NULL,
  "rep_name" text DEFAULT '' NOT NULL,
  "rep_title" text DEFAULT '' NOT NULL,
  "contact_name" text DEFAULT '' NOT NULL,
  "contact_role" text DEFAULT '' NOT NULL,
  "contact_phone" text DEFAULT '' NOT NULL,
  "contact_email" text DEFAULT '' NOT NULL,
  "services" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "termination_date" date,
  "termination_reason" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_number_idx" ON "contracts" ("number");--> statement-breakpoint
CREATE TABLE "contract_clauses" (
  "id" serial PRIMARY KEY,
  "key" text NOT NULL,
  "kind" text DEFAULT 'article' NOT NULL,
  "title" text NOT NULL,
  "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "contract_clauses_key_idx" ON "contract_clauses" ("key");--> statement-breakpoint
CREATE TABLE "contract_templates" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "title" text DEFAULT '' NOT NULL,
  "subtitle" text DEFAULT '' NOT NULL,
  "preamble" text DEFAULT '' NOT NULL,
  "amount_mode" text DEFAULT 'monthly' NOT NULL,
  "duration_unit" text DEFAULT 'months' NOT NULL,
  "duration_value" integer,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "services" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "builtin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);