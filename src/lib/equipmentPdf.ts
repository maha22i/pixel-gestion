import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { logoFile } from "./logo";
import { getSettings } from "./settings";
import { AVAILABILITY, CONDITIONS } from "./equipment";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";
const MUTED = "#6B7A89";
const LINE = "#DCE2E8";
const M = 36;
const PAGE_W = 595.28;
const W = PAGE_W - 2 * M;

function money(n: number) {
  return Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " FDJ";
}

export type InventoryRow = {
  ref: string; name: string; category: string; quantity: number;
  condition: string; availability: string; location: string;
  purchasePrice: number | null; overdue: boolean;
};

export async function renderInventoryPdf(rows: InventoryRow[], showPrices: boolean) {
  const c = await getSettings();
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 36, left: M, right: M }, bufferPages: true, info: { Title: "Inventaire matériel", Author: "Pixel Nomade" } });
  const font = path.join(process.cwd(), "public", "fonts");
  doc.registerFont("R", path.join(font, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(font, "Carlito-Bold.ttf"));
  try { doc.image(logoFile(c.logoPath), M, 28, { fit: [150, 46] }); } catch { /* logo facultatif */ }
  doc.font("B").fontSize(12).fillColor(NAVY).text(c.companyName, 220, 30, { width: PAGE_W - M - 220, align: "right" });
  doc.font("R").fontSize(8).fillColor(MUTED).text("Inventaire du matériel", 220, doc.y, { width: PAGE_W - M - 220, align: "right" });
  const y = 86;
  doc.rect(M, y, W, 28).fill(NAVY);
  doc.rect(M, y, 5, 28).fill(GOLD);
  doc.font("B").fontSize(14).fillColor("#fff").text("MATÉRIEL", M + 14, y + 7, { lineBreak: false });
  doc.font("R").fontSize(9).fillColor(GOLD).text(new Date().toLocaleDateString("fr-FR"), M, y + 8, { width: W - 12, align: "right", lineBreak: false });

  const cols = showPrices
    ? [70, 130, 90, 36, 70, 78, 70]
    : [78, 160, 110, 40, 80, 90];
  const heads = showPrices
    ? ["Réf.", "Nom", "Catégorie", "Qté", "État", "Dispo.", "Valeur"]
    : ["Réf.", "Nom", "Catégorie", "Qté", "État", "Disponibilité"];
  let cy = 128;
  const drawHead = () => {
    doc.font("B").fontSize(8).fillColor(NAVY);
    let x = M;
    heads.forEach((h, i) => { doc.text(h, x, cy, { width: cols[i], lineBreak: false }); x += cols[i]; });
    cy += 14;
    doc.moveTo(M, cy).lineTo(M + W, cy).strokeColor(GOLD).lineWidth(1).stroke();
    cy += 6;
  };
  drawHead();
  let total = 0;
  for (const r of rows) {
    if (cy > 780) { doc.addPage(); cy = 40; drawHead(); }
    doc.font("R").fontSize(8).fillColor(r.overdue ? "#9B2C2C" : INK);
    const cells = [
      r.ref, r.name, r.category, String(r.quantity),
      CONDITIONS[r.condition] ?? r.condition,
      (AVAILABILITY[r.availability] ?? r.availability) + (r.overdue ? " · retard" : ""),
    ];
    if (showPrices) cells.push(r.purchasePrice == null ? "—" : money(r.purchasePrice));
    let x = M;
    cells.forEach((cell, i) => { doc.text(cell, x, cy, { width: cols[i] - 4, height: 22, ellipsis: true }); x += cols[i]; });
    cy += 16;
    doc.moveTo(M, cy - 3).lineTo(M + W, cy - 3).strokeColor(LINE).lineWidth(0.4).stroke();
    if (r.purchasePrice) total += r.purchasePrice;
  }
  if (showPrices) {
    cy += 10;
    doc.font("B").fontSize(10).fillColor(NAVY).text(`Valeur d'achat : ${money(total)}`, M, cy, { width: W, align: "right" });
  }
  doc.font("R").fontSize(8).fillColor(MUTED);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.text(`${c.companyName} · ${c.address}`, M, 820, { width: W, align: "center", lineBreak: false });
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
