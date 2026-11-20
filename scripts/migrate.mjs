// Applique les migrations, crée la ligne de paramètres et le compte admin initial.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL manquant"); process.exit(1); }

const pool = new pg.Pool({ connectionString: url });

// Attendre que Postgres soit prêt (utile au démarrage du conteneur)
for (let i = 0; i < 30; i++) {
  try { await pool.query("select 1"); break; }
  catch { console.log("En attente de PostgreSQL…"); await new Promise((r) => setTimeout(r, 2000)); }
}

await migrate(drizzle(pool), { migrationsFolder: path.join(__dirname, "..", "drizzle") });
console.log("✔ Migrations appliquées");

await pool.query("INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");

const { rows } = await pool.query("SELECT count(*)::int AS n FROM users");
if (rows[0].n === 0) {
  const email = (process.env.ADMIN_EMAIL || "admin@pixel-nomade.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error("ADMIN_PASSWORD (8 caractères min.) est requis pour créer le premier administrateur");
    process.exit(1);
  }
  const name = process.env.ADMIN_NAME || "Administrateur";
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
    [name, email, await bcrypt.hash(password, 12)]
  );
  console.log(`✔ Administrateur créé : ${email}`);
}

await pool.end();
