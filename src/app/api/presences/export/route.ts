import { requirePerm } from "@/lib/auth";
import { payrollXlsx } from "@/lib/attendance/payrollExcel";
import { payrollPdf } from "@/lib/attendance/payrollPdf";
import { monthReport, teamMonth } from "@/lib/attendance/report";

export async function GET(req: Request) {
  await requirePerm("presences", "write");
  const url = new URL(req.url);
  const month = url.searchParams.get("mois") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Mois invalide", { status: 400 });
  const userId = Number(url.searchParams.get("user") ?? "");
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  if (format === "pdf") {
    if (!userId) return new Response("Employé manquant", { status: 400 });
    const report = await monthReport(userId, month);
    if (!report.person) return new Response("Introuvable", { status: 404 });
    const pdf = await payrollPdf({ name: report.person.name, jobTitle: report.person.jobTitle, month, rows: report.rows, totals: report.totals });
    return file(pdf, "application/pdf", `presences-${userId}-${month}.pdf`);
  }
  const reports = userId ? [await monthReport(userId, month)] : await teamMonth(month);
  const xlsx = await payrollXlsx(
    reports.filter((report) => report.person).map((report) => ({ name: report.person!.name, rows: report.rows, totals: report.totals })),
    month,
  );
  return file(xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", userId ? `presences-${userId}-${month}.xlsx` : `presences-equipe-${month}.xlsx`);
}

function file(body: Buffer, type: string, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"` },
  });
}
