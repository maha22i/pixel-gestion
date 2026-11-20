import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, getUser } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS, seesPrices } from "@/lib/equipment";

function cell(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const show = seesPrices(user);
  const res = await db.execute(sql`
    SELECT e.*, COALESCE(ch.name || ' › ' || c.name, c.name, '') AS category, COALESCE(l.name, '') AS location
    FROM equipment e
    LEFT JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN equipment_categories ch ON ch.id = c.parent_id
    LEFT JOIN equipment_locations l ON l.id = e.location_id
    ORDER BY e.ref`);
  const head = ["Référence", "Nom", "Catégorie", "Marque", "Modèle", "N° série", "Quantité", "État", "Disponibilité", "Emplacement", "Caractéristiques"];
  if (show) head.push("Prix d'achat FDJ", "Date d'achat", "Fournisseur", "Fin de garantie");
  const lines = [head.map(cell).join(";")];
  for (const r of res.rows as Record<string, unknown>[]) {
    const row = [
      String(r.ref ?? ""), String(r.name ?? ""), String(r.category ?? ""), String(r.brand ?? ""),
      String(r.model ?? ""), String(r.serial_number ?? ""), String(r.quantity ?? ""),
      CONDITIONS[String(r.condition)] ?? String(r.condition),
      AVAILABILITY[String(r.availability)] ?? String(r.availability),
      String(r.location ?? ""), String(r.specs ?? ""),
    ];
    if (show) row.push(r.purchase_price == null ? "" : String(r.purchase_price), String(r.purchase_date ?? ""), String(r.supplier ?? ""), String(r.warranty_end ?? ""));
    lines.push(row.map(cell).join(";"));
  }
  const body = "\uFEFF" + lines.join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"inventaire-materiel.csv\"",
    },
  });
}
