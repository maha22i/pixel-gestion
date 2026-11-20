ALTER TABLE "equipment_events" ADD COLUMN IF NOT EXISTS "slip_id" integer;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link" text;

CREATE TABLE IF NOT EXISTS "equipment_slips" (
  "id" serial PRIMARY KEY,
  "number" text NOT NULL,
  "status" text DEFAULT 'brouillon' NOT NULL,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "off_project_reason" text,
  "out_at" timestamp with time zone NOT NULL,
  "expected_return_at" timestamp with time zone NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "responsible_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "notes" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "validated_at" timestamp with time zone,
  "reported_at" timestamp with time zone,
  "reported_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "checked_at" timestamp with time zone,
  "checked_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_slips_number_idx" ON "equipment_slips" ("number");

CREATE TABLE IF NOT EXISTS "equipment_slip_members" (
  "slip_id" integer NOT NULL REFERENCES "equipment_slips"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("slip_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "equipment_slip_items" (
  "id" serial PRIMARY KEY,
  "slip_id" integer NOT NULL REFERENCES "equipment_slips"("id") ON DELETE CASCADE,
  "equipment_id" integer NOT NULL REFERENCES "equipment"("id") ON DELETE RESTRICT,
  "quantity" integer DEFAULT 1 NOT NULL,
  "condition_out" text DEFAULT 'bon' NOT NULL,
  "note_out" text,
  "returned" text,
  "qty_returned" integer,
  "condition_in" text,
  "note_in" text
);
CREATE INDEX IF NOT EXISTS "equipment_slip_items_slip_idx" ON "equipment_slip_items" ("slip_id");

ALTER TABLE "equipment_events"
  DROP CONSTRAINT IF EXISTS "equipment_events_slip_id_fkey";
ALTER TABLE "equipment_events"
  ADD CONSTRAINT "equipment_events_slip_id_fkey"
  FOREIGN KEY ("slip_id") REFERENCES "equipment_slips"("id") ON DELETE SET NULL;
