import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { logoFile } from "./logo";
import { getSettings } from "./settings";
import { equipmentTitle, weekRangeLabel } from "./verification";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";
const MUTED = "#6B7A89";
const LINE = "#D5DDE4";
const M = 22;
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const W = PAGE_W - 2 * M;

const COLS = [18, 176, 100, 32, 118, 156];
const HEADS = ["#", "Matériel", "Catégorie", "Qté", "Présence", "État constaté", "Observations"];

export type VerificationPdfLine = {
  ref: string;
  name: string;
  category: string;
  location: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantity: number;
};

function box(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc.rect(x, y, 8, 8).lineWidth(0.8).strokeColor(NAVY).stroke();
}

function checks(doc: PDFKit.PDFDocument, x: number, y: number, items: { label: string; w: number }[]) {
  let cx = x;
  for (const it of items) {
    box(doc, cx, y);
    doc.font("R").fontSize(7).fillColor(INK).text(it.label, cx + 10, y, { width: it.w - 12, lineBreak: false });
    cx += it.w;
  }
}

export async function renderVerificationPdf(data: {
  weekStart: string;
  generatedAt: Date;
  lines: VerificationPdfLine[];
}) {
  const c = await getSettings();
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 24, bottom: 28, left: M, right: M },
    bufferPages: true,
    info: { Title: `Vérification matériel ${data.weekStart}`, Author: c.companyName || "Pixel Nomade" },
  });
  const font = path.join(process.cwd(), "public", "fonts");
  doc.registerFont("R", path.join(font, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(font, "Carlito-Bold.ttf"));
  doc.registerFont("I", path.join(font, "Carlito-Italic.ttf"));

  const obsW = W - COLS.reduce((a, b) => a + b, 0);
  const widths = [...COLS, obsW];
  let y = 24;

  const columnHead = () => {
    doc.font("B").fontSize(7.5).fillColor(NAVY);
    let x = M;
    HEADS.forEach((h, i) => {
      doc.text(h, x, y, { width: widths[i] - 4, lineBreak: false });
      x += widths[i];
    });
    y += 12;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GOLD).lineWidth(1.2).stroke();
    y += 6;
  };

  const banner = (continued: boolean) => {
    if (!continued) {
      try { doc.image(logoFile(c.logoPath), M, 18, { fit: [140, 40] }); } catch { /* logo facultatif */ }
      doc.font("B").fontSize(11).fillColor(NAVY).text(c.companyName, 180, 20, { width: PAGE_W - M - 180, align: "right", lineBreak: false });
      doc.font("R").fontSize(8).fillColor(MUTED).text("Contrôle physique hebdomadaire du matériel", 180, 36, { width: PAGE_W - M - 180, align: "right", lineBreak: false });
      y = 68;
    } else {
      y = 24;
    }
    doc.rect(M, y, W, 26).fill(NAVY);
    doc.rect(M, y, 5, 26).fill(GOLD);
    doc.font("B").fontSize(12).fillColor("#fff").text("VÉRIFICATION DU MATÉRIEL", M + 14, y + 7, { lineBreak: false });
    doc.font("R").fontSize(9).fillColor(GOLD).text(weekRangeLabel(data.weekStart), M, y + 8, { width: W - 12, align: "right", lineBreak: false });
    y += 34;
    if (!continued) {
      doc.font("I").fontSize(8).fillColor(MUTED).text(
        "Cochez sur place : disponible ou absent, puis l’état constaté. Signez la dernière page, puis déposez le document rempli dans Pixel Finance. Ne rien cocher à l’avance.",
        M, y, { width: W },
      );
      y = doc.y + 8;
      doc.font("R").fontSize(8).fillColor(INK).text(
        `${data.lines.length} matériel${data.lines.length > 1 ? "s" : ""} · fiche du ${data.generatedAt.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        M, y, { width: W, lineBreak: false },
      );
      y += 16;
    }
    columnHead();
  };

  const newPage = () => {
    doc.addPage();
    banner(true);
  };

  banner(false);

  data.lines.forEach((line, index) => {
    if (y > PAGE_H - 48) newPage();
    const rowTop = y;
    if (index % 2 === 0) doc.rect(M, rowTop - 3, W, 18).fill("#F8F6F1");
    const cells = [
      String(index + 1),
      equipmentTitle(line),
      line.category || "—",
      String(line.quantity),
    ];
    doc.font("R").fontSize(7.5).fillColor(INK);
    let x = M;
    cells.forEach((cell, i) => {
      doc.text(cell, x, rowTop, { width: widths[i] - 4, height: 12, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    checks(doc, x, rowTop, [{ label: "Disponible", w: 66 }, { label: "Absent", w: 52 }]);
    x += widths[4];
    checks(doc, x, rowTop, [
      { label: "Bon", w: 34 },
      { label: "Usé", w: 34 },
      { label: "Panne", w: 46 },
      { label: "HS", w: 36 },
    ]);
    x += widths[5];
    doc.moveTo(x + 2, rowTop + 10).lineTo(x + widths[6] - 8, rowTop + 10).strokeColor("#C5CED6").lineWidth(0.5).stroke();
    y = rowTop + 18;
  });

  if (!data.lines.length) {
    doc.font("I").fontSize(9).fillColor(MUTED).text("Aucun matériel enregistré au moment de la génération.", M, y);
    y += 20;
  }

  if (y > PAGE_H - 176) newPage();
  y += 8;
  doc.rect(M, y, W, 118).lineWidth(0.7).strokeColor(LINE).stroke();
  doc.font("B").fontSize(9).fillColor(NAVY).text("Validation du responsable", M + 12, y + 10, { lineBreak: false });
  doc.font("I").fontSize(8).fillColor(MUTED).text(
    "Je certifie avoir contrôlé physiquement chaque matériel de cette liste.",
    M + 180, y + 11, { width: W - 196, lineBreak: false },
  );
  const sy = y + 36;
  doc.font("R").fontSize(9).fillColor(INK);
  doc.text("Nom :", M + 12, sy, { lineBreak: false });
  doc.moveTo(M + 48, sy + 11).lineTo(M + 250, sy + 11).strokeColor(NAVY).lineWidth(0.6).stroke();
  doc.text("Date :", M + 270, sy, { lineBreak: false });
  doc.moveTo(M + 304, sy + 11).lineTo(M + 430, sy + 11).strokeColor(NAVY).lineWidth(0.6).stroke();
  doc.text("Signature :", M + 450, sy, { lineBreak: false });
  doc.rect(M + 520, sy - 6, 230, 52).lineWidth(0.6).strokeColor(LINE).stroke();
  doc.font("R").fontSize(8).fillColor(MUTED).text("Observations générales", M + 12, sy + 28, { lineBreak: false });
  doc.moveTo(M + 12, sy + 52).lineTo(M + 490, sy + 52).strokeColor("#C5CED6").lineWidth(0.5).stroke();
  doc.moveTo(M + 12, sy + 68).lineTo(M + 490, sy + 68).strokeColor("#C5CED6").lineWidth(0.5).stroke();

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font("R").fontSize(8).fillColor(MUTED).text(
      `${c.companyName} · Vérification du matériel · ${i + 1}/${range.count}`,
      M, PAGE_H - 22, { width: W, align: "center", lineBreak: false },
    );
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
