CREATE TABLE IF NOT EXISTS "equipment_categories" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "parent_id" integer REFERENCES "equipment_categories"("id") ON DELETE RESTRICT,
  "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "equipment_locations" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "equipment" (
  "id" serial PRIMARY KEY,
  "ref" text NOT NULL,
  "name" text NOT NULL,
  "category_id" integer REFERENCES "equipment_categories"("id") ON DELETE RESTRICT,
  "brand" text,
  "model" text,
  "serial_number" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "description" text,
  "specs" text,
  "purchase_date" date,
  "purchase_price" integer,
  "supplier" text,
  "warranty_end" date,
  "location_id" integer REFERENCES "equipment_locations"("id") ON DELETE SET NULL,
  "condition" text DEFAULT 'bon' NOT NULL,
  "availability" text DEFAULT 'disponible' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_ref_idx" ON "equipment" ("ref");

CREATE TABLE IF NOT EXISTS "equipment_files" (
  "id" serial PRIMARY KEY,
  "equipment_id" integer NOT NULL REFERENCES "equipment"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "filename" text NOT NULL,
  "stored_name" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "equipment_events" (
  "id" serial PRIMARY KEY,
  "equipment_id" integer NOT NULL REFERENCES "equipment"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "project_id" integer REFERENCES "projects"("id") ON DELETE SET NULL,
  "out_date" date,
  "expected_return" date,
  "return_date" date,
  "condition_after" text,
  "note" text,
  "cost" integer,
  "provider" text,
  "expense_id" integer REFERENCES "expenses"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "equipment_events_eq_idx" ON "equipment_events" ("equipment_id");

INSERT INTO "equipment_locations" ("name", "position")
SELECT v.name, v.position FROM (VALUES
  ('Bureau Saline Ouest', 1),
  ('Studio', 2),
  ('France', 3)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM "equipment_locations");

INSERT INTO "equipment_categories" ("name", "position")
SELECT v.name, v.position FROM (VALUES
  ('Caméras', 1),
  ('Drones', 2),
  ('Audio', 3),
  ('Éclairage', 4),
  ('Informatique', 5),
  ('Mobilier', 6)
) AS v(name, position)
WHERE NOT EXISTS (SELECT 1 FROM "equipment_categories");

INSERT INTO "equipment_categories" ("name", "parent_id", "position")
SELECT 'Micros', p.id, 1 FROM "equipment_categories" p
WHERE p.name = 'Audio' AND p.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM "equipment_categories" c WHERE c.name = 'Micros' AND c.parent_id = p.id);

INSERT INTO "equipment_categories" ("name", "parent_id", "position")
SELECT 'Enceintes', p.id, 2 FROM "equipment_categories" p
WHERE p.name = 'Audio' AND p.parent_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM "equipment_categories" c WHERE c.name = 'Enceintes' AND c.parent_id = p.id);

INSERT INTO "equipment" ("ref", "name", "category_id", "brand", "quantity", "specs", "location_id", "condition", "availability")
SELECT v.ref, v.name, c.id, v.brand, v.qty, v.specs, l.id, 'bon', 'disponible'
FROM (VALUES
  ('PN-MAT-001', 'Canon EOS R5', 'Caméras', NULL::text, 'Canon', 1, '8K, 45 MP'),
  ('PN-MAT-002', 'Sony Z600', 'Caméras', NULL::text, 'Sony', 1, '4K'),
  ('PN-MAT-003', 'DJI Neo 2', 'Drones', NULL::text, 'DJI', 1, NULL),
  ('PN-MAT-004', 'DJI Osmo Pocket 4', 'Caméras', NULL::text, 'DJI', 1, NULL),
  ('PN-MAT-005', 'Stabilisateurs', 'Caméras', NULL::text, NULL, 2, NULL),
  ('PN-MAT-006', 'Micros sans fil', 'Audio', 'Micros', NULL, 1, NULL),
  ('PN-MAT-007', 'Grandes enceintes', 'Audio', 'Enceintes', NULL, 4, NULL),
  ('PN-MAT-008', 'Trépieds', 'Audio', 'Enceintes', NULL, 4, NULL),
  ('PN-MAT-009', 'Microphones', 'Audio', 'Micros', NULL, 2, NULL),
  ('PN-MAT-010', 'Table de mixage', 'Audio', NULL::text, NULL, 1, NULL)
) AS v(ref, name, cat, sub, brand, qty, specs)
JOIN "equipment_categories" c ON c.name = COALESCE(v.sub, v.cat)
  AND (
    (v.sub IS NULL AND c.parent_id IS NULL)
    OR c.parent_id = (SELECT id FROM "equipment_categories" p WHERE p.name = v.cat AND p.parent_id IS NULL)
  )
JOIN "equipment_locations" l ON l.name = 'Bureau Saline Ouest'
WHERE NOT EXISTS (SELECT 1 FROM "equipment");

INSERT INTO "counters" ("key", "value") VALUES ('PN-MAT', 10)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("user_id", "module", "level")
SELECT u.id, 'materiel', CASE WHEN u.role = 'technician' THEN 'read' ELSE 'write' END
FROM "users" u
ON CONFLICT ("user_id", "module") DO NOTHING;
