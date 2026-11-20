import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { logoFile, readImageSize, signatureFile } from "./logo";
import { getSettings } from "./settings";
import { CONDITIONS } from "./equipment";
import { RETURN_CONDITIONS, RETURN_STATUS, SLIP_STATUS } from "./equipmentSlips";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";
const MUTED = "#6B7A89";
const LINE = "#DCE2E8";
const TINT = "#F4F6F8";
const M = 36;
const PAGE_W = 595.28;
const W = PAGE_W - 2 * M;

export type SlipPdfData = {
  number: string;
  kind: "sortie" | "retour";
  status: string;
  projectTitle: string | null;
  clientName: string | null;
  offProjectReason: string | null;
  location: string;
  outAt: string;
  expectedReturnAt: string;
  team: string[];
  responsible: string;
  notes: string | null;
  checkedBy?: string | null;
  items: {
    ref: string; name: string; category: string; quantity: number;
    conditionOut: string; noteOut: string | null;
    returned?: string | null; qtyReturned?: number | null;
    conditionIn?: string | null; noteIn?: string | null;
  }[];
  anomalies?: string[];
};

function dtFr(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function renderSlipPdf(data: SlipPdfData) {
  const c = await getSettings();
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 40, left: M, right: M }, bufferPages: true, info: { Title: data.number, Author: "Pixel Nomade" } });
  const font = path.join(process.cwd(), "public", "fonts");
  doc.registerFont("R", path.join(font, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(font, "Carlito-Bold.ttf"));
  doc.registerFont("I", path.join(font, "Carlito-Italic.ttf"));

  try { doc.image(logoFile(c.logoPath), M, 28, { fit: [150, 46] }); } catch { /* */ }
  doc.font("B").fontSize(12).fillColor(NAVY).text(c.companyName, 220, 30, { width: PAGE_W - M - 220, align: "right" });
  doc.font("R").fontSize(8).fillColor(MUTED).text(`${c.address} · ${c.phone}`, 220, doc.y, { width: PAGE_W - M - 220, align: "right" });

  const title = data.kind === "sortie" ? "BON DE SORTIE MATÉRIEL" : "BON DE RETOUR MATÉRIEL";
  const y0 = 88;
  doc.rect(M, y0, W, 30).fill(NAVY);
  doc.rect(M, y0, 5, 30).fill(GOLD);
  doc.font("B").fontSize(13).fillColor("#fff").text(title, M + 14, y0 + 8, { lineBreak: false });
  doc.font("B").fontSize(11).fillColor(GOLD).text(data.number + (data.kind === "retour" ? " · retour" : ""), M, y0 + 8, { width: W - 12, align: "right", lineBreak: false });

  let y = y0 + 42;
  const line = (label: string, value: string) => {
    doc.font("B").fontSize(8).fillColor(MUTED).text(label, M, y, { width: 120, lineBreak: false });
    doc.font("R").fontSize(9).fillColor(INK).text(value || "—", M + 120, y, { width: W - 120 });
    y = doc.y + 4;
  };
  line("Statut", SLIP_STATUS[data.status] ?? data.status);
  line("Projet", data.projectTitle ?? (data.offProjectReason ? `Hors projet — ${data.offProjectReason}` : "—"));
  if (data.clientName) line("Client", data.clientName);
  line("Lieu", data.location);
  line("Sortie", dtFr(data.outAt));
  line("Retour prévu", dtFr(data.expectedReturnAt));
  line("Équipe", data.team.join(", ") || "—");
  line("Responsable matériel", data.responsible);
  if (data.notes) line("Notes", data.notes);
  if (data.checkedBy) line("Contrôlé par", data.checkedBy);

  y += 8;
  doc.font("B").fontSize(10).fillColor(NAVY).text("Matériel", M, y);
  y += 16;

  const cols = data.kind === "sortie"
    ? [70, 120, 90, 36, 70, 120]
    : [58, 90, 70, 30, 55, 55, 55, 90];
  const heads = data.kind === "sortie"
    ? ["Réf.", "Nom", "Catégorie", "Qté", "État départ", "Remarque"]
    : ["Réf.", "Nom", "Catégorie", "Qté", "Rentré", "Départ", "Retour", "Remarques"];

  const drawHead = () => {
    doc.font("B").fontSize(7.5).fillColor(NAVY);
    let x = M;
    heads.forEach((h, i) => { doc.text(h, x, y, { width: cols[i] - 2, lineBreak: false }); x += cols[i]; });
    y += 12;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor(GOLD).lineWidth(1).stroke();
    y += 5;
  };
  drawHead();

  for (const it of data.items) {
    if (y > 700) { doc.addPage(); y = 40; drawHead(); }
    doc.font("R").fontSize(7.5).fillColor(INK);
    const cells = data.kind === "sortie"
      ? [it.ref, it.name, it.category, String(it.quantity), CONDITIONS[it.conditionOut] ?? it.conditionOut, it.noteOut ?? ""]
      : [
          it.ref, it.name, it.category, String(it.quantity),
          `${RETURN_STATUS[it.returned ?? ""] ?? "—"}` + (it.returned === "partiel" ? ` (${it.qtyReturned ?? 0})` : ""),
          CONDITIONS[it.conditionOut] ?? it.conditionOut,
          RETURN_CONDITIONS[it.conditionIn ?? ""] ?? CONDITIONS[it.conditionIn ?? ""] ?? "—",
          [it.noteOut, it.noteIn].filter(Boolean).join(" · "),
        ];
    let x = M;
    let rowH = 14;
    cells.forEach((cell, i) => {
      const h = doc.heightOfString(String(cell), { width: cols[i] - 2 });
      rowH = Math.max(rowH, h);
      doc.text(String(cell), x, y, { width: cols[i] - 2 });
      x += cols[i];
    });
    y += rowH + 4;
    doc.moveTo(M, y - 2).lineTo(M + W, y - 2).strokeColor(LINE).lineWidth(0.4).stroke();
  }

  if (data.anomalies?.length) {
    y += 10;
    if (y > 720) { doc.addPage(); y = 40; }
    doc.font("B").fontSize(10).fillColor("#9B2C2C").text("Anomalies", M, y);
    y += 14;
    doc.font("R").fontSize(9).fillColor(INK);
    for (const a of data.anomalies) {
      doc.text(`• ${a}`, M, y, { width: W });
      y = doc.y + 2;
    }
  }

  y += 16;
  if (y > 680) { doc.addPage(); y = 40; }
  const leftTitle = data.kind === "sortie" ? "Remis par (manager)" : "Contrôlé par (manager)";
  const rightTitle = data.kind === "sortie" ? "Reçu par (responsable)" : "Rendu par (responsable)";
  const gap = 16;
  const boxW = (W - gap) / 2;
  const boxH = 110;

  const drawBox = (x: number, title: string, withSignature: boolean) => {
    doc.rect(x, y, boxW, boxH).strokeColor(LINE).lineWidth(0.8).stroke();
    doc.rect(x, y, boxW, 20).fill(TINT);
    doc.font("B").fontSize(9).fillColor(NAVY).text(title, x + 10, y + 5, { width: boxW - 20, lineBreak: false });
    if (withSignature) {
      try {
        const file = signatureFile(c.signaturePath);
        const size = readImageSize(file);
        if (size) {
          const maxW = boxW - 24, maxH = 70;
          const scale = Math.min(maxW / size.w, maxH / size.h);
          doc.image(file, x + 12, y + 28, { width: size.w * scale, height: size.h * scale });
        }
      } catch { /* */ }
    } else {
      doc.font("I").fontSize(8).fillColor(MUTED).text("Signature manuscrite", x + 10, y + 40, { width: boxW - 20 });
    }
  };
  drawBox(M, leftTitle, true);
  drawBox(M + boxW + gap, rightTitle, false);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font("R").fontSize(8).fillColor(MUTED).text(`${c.companyName} · ${c.email}`, M, 820, { width: W, align: "center", lineBreak: false });
  }

  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (b: Buffer) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
