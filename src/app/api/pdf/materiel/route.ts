import { sql } from "drizzle-orm";
import { db } from "@/db";
import { can, getUser } from "@/lib/auth";
import { seesPrices } from "@/lib/equipment";
import { renderInventoryPdf, type InventoryRow } from "@/lib/equipmentPdf";
import { today } from "@/lib/format";

export async function GET() {
  const user = await getUser();
  if (!user || !can(user, "materiel")) return new Response("Accès refusé", { status: 403 });
  const show = seesPrices(user);
  const res = await db.execute(sql`
    SELECT e.ref, e.name, e.quantity, e.condition, e.availability, e.purchase_price,
      COALESCE(ch.name || ' › ' || c.name, c.name, '—') AS category,
      COALESCE(l.name, '—') AS location,
      EXISTS (
        SELECT 1 FROM equipment_events ev
        WHERE ev.equipment_id = e.id AND ev.kind = 'sortie' AND ev.return_date IS NULL
          AND ev.expected_return IS NOT NULL AND ev.expected_return < ${today()}::date
      ) AS overdue
    FROM equipment e
    LEFT JOIN equipment_categories c ON c.id = e.category_id
    LEFT JOIN equipment_categories ch ON ch.id = c.parent_id
    LEFT JOIN equipment_locations l ON l.id = e.location_id
    ORDER BY category, e.name`);
  const rows = (res.rows as Record<string, unknown>[]).map((r) => ({
    ref: String(r.ref),
    name: String(r.name),
    category: String(r.category),
    quantity: Number(r.quantity),
    condition: String(r.condition),
    availability: String(r.availability),
    location: String(r.location),
    purchasePrice: r.purchase_price == null ? null : Number(r.purchase_price),
    overdue: Boolean(r.overdue),
  })) satisfies InventoryRow[];
  const pdf = await renderInventoryPdf(rows, show);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=\"inventaire-materiel.pdf\"",
    },
  });
}
