CREATE TABLE IF NOT EXISTS "production_plans" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "start_month" text NOT NULL,
  "end_month" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "production_plan_items" (
  "id" serial PRIMARY KEY,
  "plan_id" integer NOT NULL REFERENCES "production_plans"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "per_month" integer NOT NULL DEFAULT 1,
  "weekdays" text NOT NULL DEFAULT '',
  "start_time" text,
  "end_time" text,
  "type_id" integer REFERENCES "task_types"("id") ON DELETE SET NULL,
  "assignee_ids" text NOT NULL DEFAULT '',
  "position" integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "production_plan_items_plan_idx" ON "production_plan_items" ("plan_id");

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "plan_item_id" integer REFERENCES "production_plan_items"("id") ON DELETE SET NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "plan_period" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "plan_seq" integer;
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_plan_slot_idx" ON "tasks" ("plan_item_id", "plan_period", "plan_seq");
