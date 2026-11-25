import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { getSettings } from "@/lib/settings";
import { logoFile } from "@/lib/logo";
import { formatDjiboutiDate, formatHM } from "./time";
import type { DayRow, MonthTotals } from "./payroll";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";

export async function payrollPdf(input: { name: string; jobTitle?: string | null; month: string; rows: DayRow[]; totals: MonthTotals }) {
  const settings = await getSettings();
  const doc = new PDFDocument({ size: "A4", margin: 36, info: { Title: `Présences ${input.name} ${input.month}`, Author: settings.companyName || "Pixel Nomade" } });
  const font = path.join(process.cwd(), "public", "fonts");
  doc.registerFont("R", path.join(font, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(font, "Carlito-Bold.ttf"));
  try { doc.image(logoFile(settings.logoPath), 36, 32, { fit: [150, 46] }); } catch { /* logo absent */ }
  doc.fillColor(NAVY).font("B").fontSize(16).text("Présences", 200, 36, { width: 360, align: "right" });
  doc.font("R").fontSize(11).fillColor(INK).text(`${input.name}${input.jobTitle ? " · " + input.jobTitle : ""}`, 200, 58, { width: 360, align: "right" });
  doc.fillColor(GOLD).font("B").text(input.month, 200, 74, { width: 360, align: "right" });
  let y = 110;
  const cols = [70, 55, 78, 55, 50, 70, 145];
  const heads = ["Date", "Arrivée", "Départ", "Heures", "Retard", "Statut", "Détail"];
  const drawHead = () => {
    doc.font("B").fontSize(9).fillColor(NAVY);
    let x = 36;
    heads.forEach((head, i) => { doc.text(head, x, y, { width: cols[i], lineBreak: false }); x += cols[i]; });
    y += 14;
    doc.moveTo(36, y).lineTo(559, y).strokeColor(GOLD).lineWidth(1).stroke();
    y += 6;
  };
  drawHead();
  for (const row of input.rows) {
    if (y > 760) { doc.addPage(); y = 48; drawHead(); }
    doc.font("R").fontSize(9).fillColor(INK);
    const values = [formatDjiboutiDate(row.day), row.arrival, row.departure, row.hoursLabel, row.lateMin ? String(row.lateMin) : "—", row.statusLabel, row.detail];
    let x = 36;
    values.forEach((value, i) => { doc.text(value, x, y, { width: cols[i] - 4, lineBreak: false }); x += cols[i]; });
    y += 16;
  }
  y += 8;
  doc.moveTo(36, y).lineTo(559, y).strokeColor(NAVY).stroke();
  y += 10;
  doc.font("B").fontSize(11).fillColor(NAVY);
  doc.text(`Heures : ${formatHM(input.totals.hoursMin)}`, 36, y);
  doc.text(`Jours travaillés : ${input.totals.daysWorked}`, 200, y);
  doc.text(`Heures sup : ${formatHM(input.totals.overtimeMin)}`, 380, y);
  y += 16;
  doc.text(`Retard : ${input.totals.lateMin} min`, 36, y);
  doc.text(`Absences non justifiées : ${input.totals.absences}`, 200, y);
  return toBuffer(doc);
}

function toBuffer(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
