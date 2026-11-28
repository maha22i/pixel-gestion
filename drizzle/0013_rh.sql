CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "days" integer NOT NULL DEFAULT 0,
  "reason" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'en_attente',
  "doc_filename" text,
  "doc_stored" text,
  "doc_mime" text,
  "doc_size" integer,
  "decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "decision_note" text,
  "absence_id" integer REFERENCES "attendance_absences"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "leave_requests_user_idx" ON "leave_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx" ON "leave_requests" ("status");

CREATE TABLE IF NOT EXISTS "employment_contracts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "contract_type" text NOT NULL DEFAULT 'cdi',
  "job_title" text NOT NULL DEFAULT '',
  "start_date" date NOT NULL,
  "end_date" date,
  "monthly_salary" integer NOT NULL DEFAULT 0,
  "weekly_hours" integer NOT NULL DEFAULT 40,
  "leave_days_per_year" integer NOT NULL DEFAULT 30,
  "notes" text,
  "doc_filename" text,
  "doc_stored" text,
  "doc_mime" text,
  "doc_size" integer,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "employment_contracts_user_idx" ON "employment_contracts" ("user_id");
