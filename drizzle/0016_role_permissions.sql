CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role" text NOT NULL,
  "module" text NOT NULL,
  "level" text NOT NULL DEFAULT 'none',
  PRIMARY KEY ("role", "module")
);

-- Droits par défaut de chaque rôle (modifiables dans Paramètres).
INSERT INTO "role_permissions" ("role", "module", "level") VALUES
  ('manager','tableau_de_bord','write'),
  ('manager','projets','write'),
  ('manager','taches','write'),
  ('manager','planning','write'),
  ('manager','suivi_equipe','write'),
  ('manager','presences','write'),
  ('manager','rh','write'),
  ('manager','materiel','write'),
  ('manager','clients','write'),
  ('manager','catalogue','write'),
  ('manager','devis','write'),
  ('manager','contrats','write'),
  ('manager','factures','read'),
  ('manager','paiements','read'),
  ('manager','depenses','read'),
  ('manager','aicha','read'),
  ('technician','tableau_de_bord','none'),
  ('technician','projets','read'),
  ('technician','taches','own'),
  ('technician','planning','read'),
  ('technician','suivi_equipe','none'),
  ('technician','presences','own'),
  ('technician','rh','none'),
  ('technician','materiel','read'),
  ('technician','clients','none'),
  ('technician','catalogue','read'),
  ('technician','devis','none'),
  ('technician','contrats','none'),
  ('technician','factures','none'),
  ('technician','paiements','none'),
  ('technician','depenses','none'),
  ('technician','aicha','none')
ON CONFLICT ("role", "module") DO NOTHING;

-- Les droits d'un utilisateur ne gardent que ce qui diffère du défaut de son rôle :
-- le reste est hérité (et suivra les changements faits dans Paramètres).
DELETE FROM "permissions" p
USING "users" u, "role_permissions" r
WHERE u.id = p.user_id AND r.role = u.role AND r.module = p.module AND r.level = p.level;
DELETE FROM "permissions" p USING "users" u WHERE u.id = p.user_id AND u.role = 'admin';
