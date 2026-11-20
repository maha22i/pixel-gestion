ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#2C3E50' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_path" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'technician';
UPDATE "users" SET "role" = 'technician' WHERE "role" = 'user';

CREATE TABLE IF NOT EXISTS "project_categories" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
INSERT INTO "project_categories" ("name", "position")
SELECT v.name, v.position FROM (VALUES
  ('Contenu réseaux sociaux', 1),
  ('Production vidéo', 2),
  ('Événement', 3),
  ('Commercial / prospection', 4),
  ('Administratif', 5),
  ('Autre', 6)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM "project_categories");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "nature" text DEFAULT 'client' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "category_id" integer REFERENCES "project_categories"("id") ON DELETE SET NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "owner_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'normale' NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "brief" text;
UPDATE "projects" SET "nature" = 'interne' WHERE "type" = 'autonome';
UPDATE "projects" SET "category_id" = (SELECT id FROM "project_categories" WHERE name = 'Autre' LIMIT 1)
WHERE "nature" = 'interne' AND "category_id" IS NULL;

CREATE TABLE IF NOT EXISTS "project_members" (
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("project_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "task_types" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
INSERT INTO "task_types" ("name", "position")
SELECT v.name, v.position FROM (VALUES
  ('Tournage', 1), ('Montage', 2), ('Photo', 3), ('Drone', 4),
  ('Publication réseaux sociaux', 5), ('Devis / commercial', 6), ('Administratif', 7), ('Autre', 8)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM "task_types");

CREATE TABLE IF NOT EXISTS "task_series" (
  "id" serial PRIMARY KEY,
  "freq" text NOT NULL,
  "weekdays" text,
  "until" date,
  "count" integer,
  "horizon_weeks" integer DEFAULT 4 NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "description" text,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "client_id" integer REFERENCES "clients"("id") ON DELETE SET NULL,
  "type_id" integer REFERENCES "task_types"("id") ON DELETE SET NULL,
  "start_date" date,
  "due_date" date,
  "due_time" text,
  "priority" text DEFAULT 'normale' NOT NULL,
  "status" text DEFAULT 'a_faire' NOT NULL,
  "blocked_reason" text,
  "external_url" text,
  "personal" boolean DEFAULT false NOT NULL,
  "skip_review" boolean DEFAULT false NOT NULL,
  "series_id" integer REFERENCES "task_series"("id") ON DELETE SET NULL,
  "series_date" date,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tasks_project_idx" ON "tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "tasks_due_idx" ON "tasks" ("due_date");

CREATE TABLE IF NOT EXISTS "task_assignees" (
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("task_id", "user_id")
);
CREATE TABLE IF NOT EXISTS "task_checklist_items" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS "task_comments" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "author_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "task_attachments" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "comment_id" integer REFERENCES "task_comments"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "stored_name" text NOT NULL,
  "mime" text DEFAULT 'application/octet-stream' NOT NULL,
  "size" integer DEFAULT 0 NOT NULL,
  "uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "task_events" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "kind" text NOT NULL,
  "detail" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "task_id" integer REFERENCES "tasks"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "read_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id");
CREATE TABLE IF NOT EXISTS "task_time_entries" (
  "id" serial PRIMARY KEY,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "minutes" integer NOT NULL,
  "note" text,
  "started_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "task_templates" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "description" text
);
CREATE TABLE IF NOT EXISTS "task_template_items" (
  "id" serial PRIMARY KEY,
  "template_id" integer NOT NULL REFERENCES "task_templates"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "type_id" integer REFERENCES "task_types"("id") ON DELETE SET NULL,
  "job_title" text,
  "offset_days" integer DEFAULT 0 NOT NULL,
  "priority" text DEFAULT 'normale' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);

INSERT INTO "permissions" ("user_id", "module", "level")
SELECT u.id, m.module, 'none'
FROM "users" u
CROSS JOIN (VALUES ('taches'), ('planning'), ('suivi_equipe')) AS m(module)
ON CONFLICT ("user_id", "module") DO NOTHING;

INSERT INTO "task_templates" ("name", "description")
SELECT 'Mariage', 'Repérage, tournage, montage et livraison'
WHERE NOT EXISTS (SELECT 1 FROM "task_templates" WHERE "name" = 'Mariage');
INSERT INTO "task_templates" ("name", "description")
SELECT 'Vidéo TikTok', 'Idée, tournage, montage, publication'
WHERE NOT EXISTS (SELECT 1 FROM "task_templates" WHERE "name" = 'Vidéo TikTok');
INSERT INTO "task_templates" ("name", "description")
SELECT 'Vidéo client', 'Brief, devis, tournage, livraison'
WHERE NOT EXISTS (SELECT 1 FROM "task_templates" WHERE "name" = 'Vidéo client');

INSERT INTO "task_template_items" ("template_id", "title", "offset_days", "position", "job_title")
SELECT t.id, v.title, v.off, v.pos, v.job
FROM "task_templates" t
JOIN (VALUES
  ('Mariage', 'Repérage', -3, 1, 'cadreur'),
  ('Mariage', 'Tournage', 0, 2, 'cadreur'),
  ('Mariage', 'Dérushage', 1, 3, 'monteur'),
  ('Mariage', 'Teaser', 3, 4, 'monteur'),
  ('Mariage', 'Livraison', 14, 5, 'monteur'),
  ('Vidéo TikTok', 'Idée / script', 0, 1, NULL),
  ('Vidéo TikTok', 'Tournage', 1, 2, 'cadreur'),
  ('Vidéo TikTok', 'Montage', 2, 3, 'monteur'),
  ('Vidéo TikTok', 'Publication', 3, 4, 'community'),
  ('Vidéo client', 'Brief', 0, 1, NULL),
  ('Vidéo client', 'Devis', 1, 2, 'commercial'),
  ('Vidéo client', 'Tournage', 7, 3, 'cadreur'),
  ('Vidéo client', 'Montage', 10, 4, 'monteur'),
  ('Vidéo client', 'Livraison', 14, 5, 'monteur')
) AS v(tpl, title, off, pos, job) ON v.tpl = t.name
WHERE NOT EXISTS (SELECT 1 FROM "task_template_items" i WHERE i.template_id = t.id AND i.title = v.title);
