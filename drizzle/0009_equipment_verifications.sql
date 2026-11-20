CREATE TABLE IF NOT EXISTS "equipment_verifications" (
  "id" serial PRIMARY KEY,
  "week_start" date NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "generated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "signed_filename" text,
  "signed_stored_name" text,
  "signed_mime" text,
  "signed_size" integer,
  "signed_uploaded_at" timestamp with time zone,
  "signed_uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_verifications_week_idx" ON "equipment_verifications" ("week_start");

CREATE TABLE IF NOT EXISTS "equipment_verification_lines" (
  "id" serial PRIMARY KEY,
  "verification_id" integer NOT NULL REFERENCES "equipment_verifications"("id") ON DELETE CASCADE,
  "equipment_id" integer REFERENCES "equipment"("id") ON DELETE SET NULL,
  "ref" text NOT NULL,
  "name" text NOT NULL,
  "category" text DEFAULT '' NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "brand" text,
  "model" text,
  "serial_number" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "condition" text NOT NULL,
  "availability" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS "equipment_verification_lines_verif_idx" ON "equipment_verification_lines" ("verification_id");
