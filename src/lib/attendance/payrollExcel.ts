import "server-only";
import ExcelJS from "exceljs";
import { formatDjiboutiDate, formatHM } from "./time";
import type { DayRow, MonthTotals } from "./payroll";

const NAVY = "FF2C3E50";
const GOLD = "FFF5A623";

type PersonReport = { name: string; rows: DayRow[]; totals: MonthTotals };

export async function payrollXlsx(reports: PersonReport[], month: string) {
  const book = new ExcelJS.Workbook();
  book.creator = "Pixel Nomade";
  const sheet = book.addWorksheet("Paie");
  sheet.columns = [
    { header: "Employé", key: "name", width: 28 },
    { header: "Date", key: "day", width: 14 },
    { header: "Arrivée", key: "arrival", width: 12 },
    { header: "Départ", key: "departure", width: 16 },
    { header: "Heures", key: "hours", width: 12 },
    { header: "Heures sup", key: "overtime", width: 12 },
    { header: "Retard (min)", key: "late", width: 14 },
    { header: "Statut", key: "status", width: 16 },
    { header: "Détail", key: "detail", width: 42 },
  ];
  styleHeader(sheet.getRow(1));
  for (const report of reports) {
    for (const row of report.rows) {
      sheet.addRow({
        name: report.name,
        day: formatDjiboutiDate(row.day),
        arrival: row.arrival,
        departure: row.departure,
        hours: row.hoursLabel,
        overtime: row.overtimeMin ? formatHM(row.overtimeMin) : "",
        late: row.lateMin,
        status: row.statusLabel,
        detail: row.detail,
      });
    }
    const total = sheet.addRow({
      name: report.name,
      day: "Total " + month,
      arrival: "",
      departure: `${report.totals.daysWorked} j. travaillés`,
      hours: report.totals.hoursLabel,
      overtime: report.totals.overtimeLabel,
      late: report.totals.lateMin,
      status: `${report.totals.absences} absence(s)`,
      detail: "Heures, heures sup, jours travaillés, minutes de retard, absences non justifiées",
    });
    total.font = { bold: true, color: { argb: NAVY } };
    total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF6E7" } };
  }
  const buffer = await book.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  row.eachCell((cell) => {
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });
}
