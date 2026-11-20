import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { can } from "@/lib/auth";
import { notify } from "@/lib/tasks";

export { SLIP_STATUS, RETURN_STATUS, RETURN_CONDITIONS } from "./equipmentLabels";

export async function nextSlipNumber(isoDate = new Date().toISOString().slice(0, 10)) {
  const y = isoDate.slice(0, 4);
  const key = `BS-${y}`;
  const res = await db.execute(sql`
    INSERT INTO counters (key, value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value`);
  const value = Number((res.rows[0] as { value: number }).value);
  return `BS-${y}-${String(value).padStart(3, "0")}`;
}

/** Quantité encore sortie (non entièrement rentrée) pour un matériel. */
export async function qtyOut(equipmentId: number, exceptSlipId?: number) {
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN s.status IN ('sorti', 'attente_controle') THEN i.quantity
        WHEN s.status IN ('cloture', 'cloture_anomalies') AND (i.returned IS NULL OR i.returned = 'non') THEN i.quantity
        WHEN s.status IN ('cloture', 'cloture_anomalies') AND i.returned = 'partiel'
          THEN GREATEST(i.quantity - COALESCE(i.qty_returned, 0), 0)
        ELSE 0
      END
    ), 0)::int AS n
    FROM equipment_slip_items i
    JOIN equipment_slips s ON s.id = i.slip_id
    WHERE i.equipment_id = ${equipmentId}
      AND s.status <> 'brouillon'
      AND (${exceptSlipId ?? 0} = 0 OR s.id <> ${exceptSlipId ?? 0})`);
  return Number((res.rows[0] as { n: number }).n);
}

export async function qtyAvailable(equipmentId: number, stock: number, exceptSlipId?: number) {
  return Math.max(0, stock - (await qtyOut(equipmentId, exceptSlipId)));
}

export async function overlappingSlips(
  equipmentId: number,
  outAt: Date,
  expectedReturnAt: Date,
  exceptSlipId?: number,
) {
  const res = await db.execute(sql`
    SELECT s.id, s.number, i.quantity
    FROM equipment_slip_items i
    JOIN equipment_slips s ON s.id = i.slip_id
    WHERE i.equipment_id = ${equipmentId}
      AND s.status IN ('sorti', 'attente_controle', 'cloture_anomalies')
      AND (${exceptSlipId ?? 0} = 0 OR s.id <> ${exceptSlipId ?? 0})
      AND s.out_at < ${expectedReturnAt.toISOString()}::timestamptz
      AND s.expected_return_at > ${outAt.toISOString()}::timestamptz`);
  return res.rows as { id: number; number: string; quantity: number }[];
}

export function canManageSlips(user: SessionUser) {
  return can(user, "materiel", "write");
}

export function mapReturnCondition(c: string) {
  if (c === "endommage") return "use";
  if (c === "en_panne") return "en_panne";
  if (c === "use") return "use";
  return "bon";
}

export function inventoryAfterReturn(returned: string, conditionIn: string | null, qty: number, qtyReturned: number | null) {
  if (returned === "non") {
    return { availability: "en_utilisation" as const, condition: null as string | null, missing: true };
  }
  const cond = conditionIn ? mapReturnCondition(conditionIn) : "bon";
  const bad = cond === "en_panne" || conditionIn === "endommage";
  if (returned === "partiel" && (qtyReturned ?? 0) < qty) {
    return {
      availability: bad ? ("en_maintenance" as const) : ("en_utilisation" as const),
      condition: cond,
      missing: true,
    };
  }
  return {
    availability: bad ? ("en_maintenance" as const) : ("disponible" as const),
    condition: cond,
    missing: false,
  };
}

export function parseLocalDateTime(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalInput(d: Date | string | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Notifie managers + responsable pour les bons en retard (1× par bon). */
export async function notifyOverdueSlips() {
  const overdue = await db.execute(sql`
    SELECT s.id, s.number, s.responsible_user_id
    FROM equipment_slips s
    WHERE s.status IN ('sorti', 'attente_controle')
      AND s.expected_return_at < now()`);
  const rows = overdue.rows as { id: number; number: string; responsible_user_id: number | null }[];
  if (!rows.length) return;

  const managers = await db.execute(sql`
    SELECT id FROM users WHERE active = true AND role IN ('admin', 'manager')`);
  const managerIds = (managers.rows as { id: number }[]).map((r) => r.id);

  for (const s of rows) {
    const link = `/materiel/sorties/${s.id}`;
    const existing = await db.execute(sql`
      SELECT id FROM notifications
      WHERE link = ${link} AND type = 'equipment' AND body LIKE ${"%retour en retard%"}
      LIMIT 1`);
    if (existing.rows.length) continue;
    const targets = [...managerIds, s.responsible_user_id].filter(Boolean) as number[];
    await notify(targets, "equipment", `Retour en retard — bon ${s.number}.`, undefined, undefined, link);
  }
}
