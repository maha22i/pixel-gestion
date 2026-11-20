ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "attendance_consent_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "attendance_sites" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "address" text DEFAULT '' NOT NULL,
  "lat" double precision,
  "lng" double precision,
  "radius_m" integer DEFAULT 100 NOT NULL,
  "qr_secret" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance_site_ips" (
  "id" serial PRIMARY KEY,
  "site_id" integer NOT NULL REFERENCES "attendance_sites"("id") ON DELETE CASCADE,
  "ip" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_site_ips_uniq" ON "attendance_site_ips" ("site_id", "ip");

CREATE TABLE IF NOT EXISTS "attendance_schedule" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "work_days" text DEFAULT '0,1,2,3,4' NOT NULL,
  "start_time" text DEFAULT '08:00' NOT NULL,
  "end_time" text DEFAULT '17:00' NOT NULL,
  "late_tolerance_min" integer DEFAULT 15 NOT NULL
);
INSERT INTO "attendance_schedule" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "attendance_holidays" (
  "id" serial PRIMARY KEY,
  "day" date NOT NULL,
  "name" text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_holidays_day_idx" ON "attendance_holidays" ("day");

INSERT INTO "attendance_holidays" ("day", "name") VALUES
  ('2026-01-01', 'Nouvel An'),
  ('2026-01-16', 'Al Isra et Al Miraj'),
  ('2026-03-20', 'Aïd el-Fitr'),
  ('2026-03-21', 'Aïd el-Fitr'),
  ('2026-05-01', 'Fête du Travail'),
  ('2026-05-26', 'Jour d''Arafat'),
  ('2026-05-27', 'Aïd el-Adha'),
  ('2026-05-28', 'Aïd el-Adha'),
  ('2026-06-16', 'Nouvel An musulman'),
  ('2026-06-27', 'Fête de l''Indépendance'),
  ('2026-06-28', 'Fête de l''Indépendance'),
  ('2026-08-25', 'Mouloud'),
  ('2027-01-01', 'Nouvel An'),
  ('2027-01-06', 'Al Isra et Al Miraj'),
  ('2027-03-10', 'Aïd el-Fitr'),
  ('2027-03-11', 'Aïd el-Fitr'),
  ('2027-05-01', 'Fête du Travail'),
  ('2027-05-16', 'Jour d''Arafat'),
  ('2027-05-17', 'Aïd el-Adha'),
  ('2027-05-18', 'Aïd el-Adha'),
  ('2027-06-06', 'Nouvel An musulman'),
  ('2027-06-27', 'Fête de l''Indépendance'),
  ('2027-06-28', 'Fête de l''Indépendance'),
  ('2027-08-15', 'Mouloud'),
  ('2027-12-26', 'Al Isra et Al Miraj')
ON CONFLICT ("day") DO NOTHING;

CREATE TABLE IF NOT EXISTS "attendance_devices" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_devices_user_idx" ON "attendance_devices" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_devices_token_idx" ON "attendance_devices" ("token_hash");

CREATE TABLE IF NOT EXISTS "attendance_device_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "user_agent" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "attendance_device_requests_user_idx" ON "attendance_device_requests" ("user_id");

CREATE TABLE IF NOT EXISTS "attendance_punches" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "site_id" integer REFERENCES "attendance_sites"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "channel" text NOT NULL,
  "punched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "day" date NOT NULL,
  "lat" double precision,
  "lng" double precision,
  "accuracy_m" integer,
  "distance_m" integer,
  "ip" text,
  "ip_ok" boolean DEFAULT false NOT NULL,
  "qr_ok" boolean DEFAULT false NOT NULL,
  "reason_codes" text DEFAULT '' NOT NULL,
  "note" text,
  "status" text NOT NULL,
  "task_id" integer REFERENCES "tasks"("id") ON DELETE SET NULL,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "slip_id" integer REFERENCES "equipment_slips"("id") ON DELETE SET NULL,
  "source" text DEFAULT 'scan' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "validated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "validated_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "attendance_punches_user_day_idx" ON "attendance_punches" ("user_id", "day");
CREATE INDEX IF NOT EXISTS "attendance_punches_day_idx" ON "attendance_punches" ("day");

CREATE TABLE IF NOT EXISTS "attendance_punch_events" (
  "id" serial PRIMARY KEY,
  "punch_id" integer NOT NULL REFERENCES "attendance_punches"("id") ON DELETE CASCADE,
  "actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance_absences" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "kind" text NOT NULL,
  "reason" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "attendance_absences_user_idx" ON "attendance_absences" ("user_id");

INSERT INTO "permissions" ("user_id", "module", "level")
SELECT "id", 'presences',
  CASE WHEN "role" IN ('admin', 'manager') THEN 'write' ELSE 'own' END
FROM "users"
ON CONFLICT ("user_id", "module") DO NOTHING;

INSERT INTO "attendance_sites" ("name", "address", "radius_m", "active")
SELECT 'Bureau Saline Ouest', COALESCE("address", 'Saline Ouest, Djibouti'), 100, true
FROM "settings" WHERE "id" = 1
AND NOT EXISTS (SELECT 1 FROM "attendance_sites");
