import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { today } from "./format";

export type InvoiceFinance = {
  id: number;
  number: string;
  subject: string;
  issueDate: string;
  status: string;
  total: number;
  paid: number;
  remaining: number;
  dueToDate: number;
  overdue: boolean;
  paymentStatus: "non_payee" | "acompte" | "partielle" | "soldee" | "annulee";
  clientId: number;
  clientName: string;
  projectId: number | null;
  projectTitle: string | null;
  projectType: string | null;
};

export function paymentStatusOf(total: number, paid: number, status: string, firstInstallment: number | null) {
  if (status === "annulee") return "annulee" as const;
  if (paid <= 0) return "non_payee" as const;
  if (paid >= total) return "soldee" as const;
  if (firstInstallment != null && paid >= firstInstallment) return "acompte" as const;
  return "partielle" as const;
}

/** Vue financière des factures : payé, reste à payer, retard. */
export async function invoicesFinance(where?: ReturnType<typeof sql>): Promise<InvoiceFinance[]> {
  const t = today();
  const res = await db.execute(sql`
    SELECT i.id, i.number, i.subject, i.issue_date::text AS "issueDate", i.status, i.total,
           i.client_id AS "clientId", c.name AS "clientName",
           i.project_id AS "projectId", p.title AS "projectTitle", p.type AS "projectType",
           COALESCE((SELECT SUM(amount) FROM payments pa WHERE pa.invoice_id = i.id), 0)::int AS paid,
           COALESCE((SELECT SUM(amount) FROM installments ins WHERE ins.invoice_id = i.id AND ins.due_date IS NOT NULL AND ins.due_date < ${t}::date), 0)::int AS "dueToDate",
           (SELECT amount FROM installments ins WHERE ins.invoice_id = i.id ORDER BY position, id LIMIT 1) AS "firstInstallment"
    FROM invoices i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN projects p ON p.id = i.project_id
    ${where ? sql`WHERE ${where}` : sql``}
    ORDER BY i.issue_date DESC, i.id DESC
  `);
  return (res.rows as any[]).map((r) => {
    const total = Number(r.total);
    const paid = Number(r.paid);
    const dueToDate = Number(r.dueToDate);
    const first = r.firstInstallment == null ? null : Number(r.firstInstallment);
    const paymentStatus = paymentStatusOf(total, paid, r.status, first);
    return {
      ...r,
      total,
      paid,
      dueToDate,
      remaining: r.status === "annulee" ? 0 : Math.max(total - paid, 0),
      overdue: r.status !== "annulee" && paid < Math.min(dueToDate, total),
      paymentStatus,
    } as InvoiceFinance;
  });
}

export { lineTotal } from "./calc";
