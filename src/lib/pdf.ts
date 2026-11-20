import "server-only";
import path from "node:path";
import PDFDocument from "pdfkit";
import { logoFile, readImageSize, signatureFile } from "./logo";

// ─── Charte Pixel Nomade ─────────────────────────────────────────────────
const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";
const MUTED = "#6B7A89";
const LINE = "#DCE2E8";
const TINT = "#F4F6F8";
const GOLD_TINT = "#FEF6E7";

const PAGE_W = 595.28;
const M = 40;
const W = PAGE_W - 2 * M;
const BOTTOM = 795; // au-delà : nouvelle page (pied de page réservé)

const FONT_DIR = path.join(process.cwd(), "public", "fonts");

export const money = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") + " FDJ";
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
export const dFr = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export type Company = {
  companyName: string; tagline: string; address: string; phone: string; email: string; website: string;
  paymentMethods: string; paymentTerms: string; footerNote: string; logoPath?: string | null; signaturePath?: string | null;
};
export type PdfClient = { name: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null };
export type PdfLine = { designation: string; description?: string | null; quantity: number; unit?: string | null; unitPrice: number; discountPct: number; total: number; group?: string | null };

type Doc = InstanceType<typeof PDFDocument>;

function newDoc(title: string) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 20, left: M, right: M }, bufferPages: true, info: { Title: title, Author: "Pixel Nomade" } });
  doc.registerFont("R", path.join(FONT_DIR, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(FONT_DIR, "Carlito-Bold.ttf"));
  doc.registerFont("I", path.join(FONT_DIR, "Carlito-Italic.ttf"));
  doc.font("R").fillColor(INK);
  return doc;
}

function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function ensure(doc: Doc, y: number, h: number) {
  if (y + h > BOTTOM) {
    doc.addPage();
    return 40;
  }
  return y;
}

/** En-tête : logo, coordonnées, bandeau titre. Retourne la position y suivante. */
function header(doc: Doc, c: Company, title: string, number: string) {
  try { doc.image(logoFile(c.logoPath), M, 26, { fit: [190, 58] }); } catch {}
  const x = 260, w = PAGE_W - M - x;
  doc.font("B").fontSize(15).fillColor(NAVY).text(c.companyName, x, 26, { width: w, align: "right" });
  doc.font("R").fontSize(8.5).fillColor(MUTED).text(c.tagline, x, doc.y, { width: w, align: "right" });
  doc.fillColor(INK).fontSize(9);
  for (const l of [`${c.address} · Tél : ${c.phone}`, `${c.email} · ${c.website}`]) doc.text(l, x, doc.y + 1, { width: w, align: "right" });

  const y = 100;
  doc.rect(M, y, W, 36).fill(NAVY);
  doc.rect(M, y, 6, 36).fill(GOLD);
  doc.font("B").fontSize(20).fillColor("#FFFFFF").text(title, M + 18, y + 8, { lineBreak: false });
  const px = M + 18 + doc.widthOfString(title) + 12;
  // petits pixels décoratifs, rappel du logo
  ([[0, 0, GOLD], [6, 6, "#FFFFFF"], [12, 0, GOLD]] as const).forEach(([dx, dy, col]) => doc.rect(px + dx, y + 12 + dy, 5, 5).fill(col));
  doc.font("R").fontSize(9).fillColor("#C5CFD9").text("N°", M + W - 190, y + 13, { width: 30, lineBreak: false });
  doc.font("B").fontSize(13).fillColor(GOLD).text(number, M + W - 170, y + 10, { width: 160, align: "right", lineBreak: false });
  doc.fillColor(INK);
  return y + 48;
}

function infoBox(doc: Doc, x: number, y: number, w: number, label: string, lines: { t: string; bold?: boolean }[]) {
  const padding = 8;
  doc.font("R").fontSize(9.5);
  let h = 22 + padding;
  for (const l of lines) h += doc.font(l.bold ? "B" : "R").fontSize(l.bold ? 11 : 9.5).heightOfString(l.t, { width: w - 2 * padding }) + 2;
  return {
    h: h + padding - 6,
    draw(height: number) {
      doc.rect(x, y, w, height).lineWidth(0.8).strokeColor(LINE).stroke();
      doc.rect(x, y, w, 20).fill(TINT);
      doc.rect(x, y, 3, 20).fill(GOLD);
      doc.font("B").fontSize(8.5).fillColor(NAVY).text(label.toUpperCase(), x + 10, y + 6, { characterSpacing: 0.8, lineBreak: false });
      let cy = y + 20 + padding - 2;
      for (const l of lines) {
        doc.font(l.bold ? "B" : "R").fontSize(l.bold ? 11 : 9.5).fillColor(l.bold ? NAVY : INK).text(l.t, x + padding, cy, { width: w - 2 * padding });
        cy = doc.y + 2;
      }
    },
  };
}

function parties(doc: Doc, y: number, c: Company, client: PdfClient) {
  const w = (W - 14) / 2;
  const a = infoBox(doc, M, y, w, "Émetteur", [
    { t: c.companyName, bold: true }, { t: c.address }, { t: `Tél : ${c.phone}` }, { t: `${c.email} · ${c.website}` },
  ]);
  const cl: { t: string; bold?: boolean }[] = [{ t: client.name, bold: true }];
  if (client.contactName) cl.push({ t: `À l'attention de : ${client.contactName}` });
  if (client.address) cl.push({ t: client.address });
  const contact = [client.phone ? `Tél : ${client.phone}` : "", client.email ?? ""].filter(Boolean).join(" · ");
  if (contact) cl.push({ t: contact });
  const b = infoBox(doc, M + w + 14, y, w, "Client", cl);
  const h = Math.max(a.h, b.h);
  a.draw(h);
  b.draw(h);
  return y + h + 12;
}

/** Bandeau de métadonnées : paires libellé / valeur. */
function metaStrip(doc: Doc, y: number, items: [string, string][]) {
  const cw = W / items.length;
  doc.rect(M, y, W, 34).fill(TINT);
  items.forEach(([k, v], i) => {
    const x = M + i * cw + 10;
    doc.font("R").fontSize(7.5).fillColor(MUTED).text(k.toUpperCase(), x, y + 6, { width: cw - 14, characterSpacing: 0.6, lineBreak: false });
    doc.font("B").fontSize(10).fillColor(NAVY).text(v, x, y + 17, { width: cw - 14, lineBreak: false, ellipsis: true });
  });
  return y + 42;
}

function objet(doc: Doc, y: number, subject: string) {
  doc.font("B").fontSize(10).fillColor(MUTED).text("Objet : ", M, y, { continued: true });
  doc.font("B").fontSize(11).fillColor(NAVY).text(subject, { width: W });
  return doc.y + 10;
}

// ─── Tableau des prestations ─────────────────────────────────────────────
const COLS = [
  { k: "n", label: "N°", w: 26, align: "center" },
  { k: "d", label: "Désignation", w: 239, align: "left" },
  { k: "q", label: "Qté", w: 50, align: "center" },
  { k: "p", label: "P.U. (FDJ)", w: 75, align: "right" },
  { k: "r", label: "Remise", w: 42, align: "center" },
  { k: "t", label: "Total (FDJ)", w: 83, align: "right" },
] as const;

function tableHeader(doc: Doc, y: number) {
  doc.rect(M, y, W, 22).fill(NAVY);
  let x = M;
  for (const c of COLS) {
    doc.font("B").fontSize(8.5).fillColor("#FFFFFF").text(c.label.toUpperCase(), x + 6, y + 7, { width: c.w - 12, align: c.align, characterSpacing: 0.4, lineBreak: false });
    x += c.w;
  }
  return y + 22;
}

function itemsTable(doc: Doc, y: number, lines: PdfLine[]) {
  y = ensure(doc, y, 60);
  y = tableHeader(doc, y);
  const hasGroups = lines.some((l) => l.group);
  let n = 0;
  let lastGroup: string | null | undefined = undefined;
  const fmtNum = (v: number) => Math.round(v).toLocaleString("fr-FR").replace(/[  ]/g, " ");
  for (const l of lines) {
    if (hasGroups && l.group !== lastGroup) {
      lastGroup = l.group;
      if (y + 22 + 26 > BOTTOM) { doc.addPage(); y = tableHeader(doc, 40); }
      doc.rect(M, y, W, 18).fill(GOLD_TINT);
      doc.rect(M, y, 3, 18).fill(GOLD);
      doc.font("B").fontSize(9.5).fillColor(NAVY).text(l.group ? l.group : "Prestations générales", M + 12, y + 4.5, { width: W - 24, lineBreak: false });
      y += 18;
    }
    n++;
    const dw = COLS[1].w - 12;
    const hd = doc.font("B").fontSize(9.5).heightOfString(l.designation, { width: dw });
    const hs = l.description ? doc.font("R").fontSize(8.5).heightOfString(l.description, { width: dw }) + 2 : 0;
    const rh = Math.max(hd + hs + 11, 22);
    if (y + rh > BOTTOM) { doc.addPage(); y = tableHeader(doc, 40); }
    if (n % 2 === 0) doc.rect(M, y, W, rh).fill("#F9FAFB");
    let x = M;
    const vals = [
      String(n), "",
      `${qtyFmt(l.quantity)}${l.unit && l.unit !== "forfait" ? " " + l.unit : ""}`,
      fmtNum(l.unitPrice),
      l.discountPct ? `${l.discountPct} %` : "—",
      fmtNum(l.total),
    ];
    COLS.forEach((c, i) => {
      if (c.k === "d") {
        doc.font("B").fontSize(9.5).fillColor(INK).text(l.designation, x + 6, y + 6, { width: dw });
        if (l.description) doc.font("R").fontSize(8.5).fillColor(MUTED).text(l.description, x + 6, doc.y + 1, { width: dw });
      } else {
        doc.font(c.k === "t" ? "B" : "R").fontSize(9.5).fillColor(c.k === "n" ? MUTED : INK)
          .text(vals[i], x + 6, y + 6, { width: c.w - 12, align: c.align, lineBreak: false });
      }
      x += c.w;
    });
    doc.moveTo(M, y + rh).lineTo(M + W, y + rh).lineWidth(0.5).strokeColor(LINE).stroke();
    y += rh;
  }
  return y + 10;
}

type Aside = { title: string; lines: { t: string; bold?: boolean; color?: string }[] };

/** Bloc des totaux (à droite) avec, à gauche, un encadré facultatif (modalités, échéancier…). */
function totalsBlock(doc: Doc, y: number, rows: { label: string; value: string; strong?: "navy" | "gold" }[], aside?: Aside) {
  const h = rows.reduce((s, r) => s + (r.strong ? 26 : 18), 0);
  const w = 240, x = M + W - w;
  const aw = W - w - 22;
  let ah = 0;
  if (aside) {
    ah = 20;
    for (const l of aside.lines) ah += doc.font(l.bold ? "B" : "R").fontSize(9).heightOfString(l.t, { width: aw - 16 }) + 3;
    ah += 8;
  }
  y = ensure(doc, y, Math.max(h, ah) + 10);
  if (aside) {
    doc.rect(M, y, aw, ah).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.rect(M, y, 3, ah).fill(GOLD);
    doc.font("B").fontSize(8.5).fillColor(GOLD).text(aside.title.toUpperCase(), M + 10, y + 7, { characterSpacing: 0.9, lineBreak: false });
    let ay = y + 21;
    for (const l of aside.lines) {
      doc.font(l.bold ? "B" : "R").fontSize(9).fillColor(l.color ?? (l.bold ? NAVY : INK)).text(l.t, M + 10, ay, { width: aw - 16 });
      ay = doc.y + 3;
    }
  }
  let ty = y;
  for (const r of rows) {
    if (r.strong) {
      doc.rect(x, ty, w, 24).fill(r.strong === "navy" ? NAVY : GOLD);
      doc.font("B").fontSize(11).fillColor(r.strong === "navy" ? "#FFFFFF" : NAVY).text(r.label, x + 10, ty + 6.5, { lineBreak: false });
      doc.font("B").fontSize(12).fillColor(r.strong === "navy" ? GOLD : NAVY).text(r.value, x + 10, ty + 6, { width: w - 20, align: "right", lineBreak: false });
      ty += 26;
    } else {
      doc.font("R").fontSize(9.5).fillColor(INK).text(r.label, x + 10, ty + 3, { lineBreak: false });
      doc.font("B").fontSize(9.5).text(r.value, x + 10, ty + 3, { width: w - 20, align: "right", lineBreak: false });
      ty += 18;
    }
  }
  return Math.max(ty, y + ah) + 10;
}

function wordsBox(doc: Doc, y: number, lead: string, words: string, amount: number) {
  const text = `${words} (${money(amount)}).`;
  const h = doc.font("I").fontSize(10).heightOfString(lead + " " + text, { width: W - 24 }) + 16;
  y = ensure(doc, y, h + 6);
  doc.rect(M, y, W, h).fill(GOLD_TINT);
  doc.rect(M, y, 3, h).fill(GOLD);
  doc.font("R").fontSize(10).fillColor(INK).text(lead + " ", M + 12, y + 8, { width: W - 24, continued: true })
    .font("B").fillColor(NAVY).text(text);
  return y + h + 10;
}

function section(doc: Doc, y: number, title: string, needed: number) {
  y = ensure(doc, y, needed + 18);
  doc.font("B").fontSize(9).fillColor(GOLD).text(title.toUpperCase(), M, y, { characterSpacing: 1, lineBreak: false });
  doc.moveTo(M, y + 13).lineTo(M + W, y + 13).lineWidth(0.6).strokeColor(LINE).stroke();
  return y + 19;
}

function paragraph(doc: Doc, y: number, text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  doc.font(opts.bold ? "B" : "R").fontSize(opts.size ?? 9.5).fillColor(opts.color ?? INK).text(text, M, y, { width: W });
  return doc.y + 3;
}

function plainSignatures(doc: Doc, y: number, boxes: { title: string; hint: string }[]) {
  y = ensure(doc, y, 68);
  const gap = 20;
  const w = boxes.length === 1 ? 240 : (W - gap) / 2;
  boxes.forEach((b, i) => {
    const x = boxes.length === 1 ? M + W - w : M + i * (w + gap);
    doc.rect(x, y, w, 66).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.rect(x, y, w, 20).fill(TINT);
    doc.font("B").fontSize(9).fillColor(NAVY).text(b.title, x + 10, y + 6, { width: w - 20, lineBreak: false });
    doc.font("I").fontSize(8).fillColor(MUTED).text(b.hint, x + 10, y + 26, { width: w - 20 });
  });
  return y + 70;
}

export type ClientSign = { png: Buffer; name: string; when: string };

/** Bloc signature : image (nom, signature, cachet) pour l'agence, zone vide ou signature en ligne pour le client. */
function signatures(doc: Doc, y: number, boxes: { title: string; hint: string }[], signaturePath?: string | null, clientSign?: ClientSign | null) {
  const file = signatureFile(signaturePath);
  const size = readImageSize(file);
  if (!size || size.w < 1 || size.h < 1) return plainSignatures(doc, y, boxes);

  const gap = 16;
  const maxH = 132;
  const beside = boxes.length > 1;
  const maxW = beside ? (W - gap) * 0.62 : Math.min(W, 460);
  const scale = Math.min(maxW / size.w, maxH / size.h);
  const dw = size.w * scale;
  const dh = size.h * scale;
  const blockH = 18 + dh;
  y = ensure(doc, y, blockH + 4);

  const companyX = beside ? M : M + W - dw;
  doc.font("B").fontSize(9).fillColor(NAVY).text(boxes[0].title, companyX, y, { width: dw, lineBreak: false });
  try {
    doc.image(file, companyX, y + 16, { width: dw, height: dh });
    doc.rect(companyX, y + 16, dw, dh).lineWidth(0.6).strokeColor(LINE).stroke();
  } catch {}

  if (beside && boxes[1]) {
    const x = M + dw + gap;
    const cw = W - dw - gap;
    doc.rect(x, y, cw, blockH).lineWidth(0.8).strokeColor(LINE).stroke();
    doc.rect(x, y, cw, 20).fill(TINT);
    doc.font("B").fontSize(9).fillColor(NAVY).text(boxes[1].title, x + 10, y + 6, { width: cw - 20, lineBreak: false });
    if (clientSign) {
      try { doc.image(clientSign.png, x + 12, y + 28, { fit: [cw - 24, Math.max(blockH - 64, 36)], align: "center", valign: "center" }); } catch {}
      doc.font("R").fontSize(8).fillColor(MUTED).text(`Signé en ligne le ${clientSign.when} par ${clientSign.name}`, x + 10, y + blockH - 18, { width: cw - 20, lineBreak: false, ellipsis: true });
    } else {
      doc.font("I").fontSize(8).fillColor(MUTED).text(boxes[1].hint, x + 10, y + 28, { width: cw - 20 });
    }
  }
  doc.fillColor(INK);
  return y + blockH + 12;
}

function footers(doc: Doc, c: Company) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // le pied de page est sous la marge : éviter tout saut de page automatique
    const y = 803;
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).strokeColor(GOLD).stroke();
    doc.font("B").fontSize(8).fillColor(NAVY)
      .text(`${c.companyName} · ${c.address} · Tél : ${c.phone} · ${c.email} · ${c.website}`, M, y + 6, { width: W - 50, lineBreak: false });
    doc.font("R").fontSize(7.5).fillColor(MUTED).text(c.footerNote, M, y + 17, { width: W - 50, lineBreak: false });
    doc.font("R").fontSize(8).fillColor(MUTED).text(`Page ${i - range.start + 1}/${range.count}`, M + W - 60, y + 6, { width: 60, align: "right", lineBreak: false });
  }
}

// ─── Documents ───────────────────────────────────────────────────────────
export async function quotePdf(args: {
  company: Company; client: PdfClient; number: string; issueDate: string; validUntil: string | null; subject: string;
  project?: { title: string; type: string; events: string[] } | null; lines: PdfLine[]; subtotal: number; discount: number;
  total: number; depositPercent: number; notes: string | null; words: string;
  clientSign?: ClientSign | null;
}) {
  const { company: c } = args;
  const doc = newDoc(`Devis ${args.number}`);
  let y = header(doc, c, "DEVIS", args.number);
  y = parties(doc, y, c, args.client);
  const meta: [string, string][] = [["Date", dFr(args.issueDate)], ["Valable jusqu'au", dFr(args.validUntil)]];
  if (args.project) meta.push(["Projet", args.project.type]);
  meta.push(["Montant total", money(args.total)]);
  y = metaStrip(doc, y, meta);
  y = objet(doc, y, args.subject);
  if (args.project?.events.length) y = paragraph(doc, y - 6, `Événements couverts : ${args.project.events.join(" · ")}`, { color: MUTED }) + 6;
  y = itemsTable(doc, y, args.lines);
  const rows: { label: string; value: string; strong?: "navy" | "gold" }[] = [{ label: "Sous-total", value: money(args.subtotal) }];
  if (args.discount > 0) rows.push({ label: "Remise", value: `− ${money(args.discount)}` });
  rows.push({ label: "TOTAL NET", value: money(args.total), strong: "navy" });
  const dep = Math.round((args.total * args.depositPercent) / 100);
  const terms: Aside["lines"] = [{ t: c.paymentTerms }];
  if (args.depositPercent > 0 && args.depositPercent < 100) {
    terms.push({ t: `Acompte (${args.depositPercent} %) : ${money(dep)}`, bold: true });
    terms.push({ t: `Solde à la livraison : ${money(args.total - dep)}`, bold: true });
  }
  terms.push({ t: `Moyens acceptés : ${c.paymentMethods}`, color: MUTED });
  y = totalsBlock(doc, y, rows, { title: "Modalités de paiement", lines: terms });
  y = wordsBox(doc, y, "Arrêté le présent devis à la somme de :", args.words, args.total);
  if (args.notes) {
    y = section(doc, y, "Conditions particulières", 30);
    y = paragraph(doc, y, args.notes) + 4;
  }
  signatures(doc, y, [
    { title: `Pour ${c.companyName}`, hint: "Le gérant — signature et cachet" },
    { title: "Bon pour accord — Le client", hint: "Date, signature et mention manuscrite « Bon pour accord »" },
  ], c.signaturePath, args.clientSign);
  footers(doc, c);
  return toBuffer(doc);
}

export async function invoicePdf(args: {
  company: Company; client: PdfClient; number: string; issueDate: string; subject: string; quoteNumber: string | null;
  project?: { title: string; type: string; events: string[] } | null; lines: PdfLine[]; subtotal: number; discount: number;
  total: number; paid: number; notes: string | null; words: string; cancelled: boolean;
  schedule: { label: string; dueDate: string | null; amount: number; state: string }[];
}) {
  const { company: c } = args;
  const doc = newDoc(`Facture ${args.number}`);
  let y = header(doc, c, args.cancelled ? "FACTURE (ANNULÉE)" : "FACTURE", args.number);
  y = parties(doc, y, c, args.client);
  const meta: [string, string][] = [["Date", dFr(args.issueDate)]];
  if (args.quoteNumber) meta.push(["Réf. devis", args.quoteNumber]);
  if (args.project) meta.push(["Projet", args.project.type]);
  meta.push(["Reste à payer", money(Math.max(args.total - args.paid, 0))]);
  y = metaStrip(doc, y, meta);
  y = objet(doc, y, args.subject);
  if (args.project?.events.length) y = paragraph(doc, y - 6, `Événements couverts : ${args.project.events.join(" · ")}`, { color: MUTED }) + 6;
  y = itemsTable(doc, y, args.lines);
  const rows: { label: string; value: string; strong?: "navy" | "gold" }[] = [{ label: "Sous-total", value: money(args.subtotal) }];
  if (args.discount > 0) rows.push({ label: "Remise", value: `− ${money(args.discount)}` });
  rows.push({ label: "TOTAL NET", value: money(args.total), strong: "navy" });
  rows.push({ label: "Déjà réglé", value: money(args.paid) });
  rows.push({ label: "RESTE À PAYER", value: money(Math.max(args.total - args.paid, 0)), strong: "gold" });
  const states: Record<string, string> = { payee: "réglée", partielle: "partielle", retard: "EN RETARD", a_venir: "à venir" };
  const sched: Aside["lines"] = args.schedule.map((s) => ({
    t: `${s.label} — ${money(s.amount)} · ${s.dueDate ? dFr(s.dueDate) : "à la livraison"} (${states[s.state] ?? ""})`,
    color: s.state === "retard" ? "#B42318" : s.state === "payee" ? "#067647" : INK,
  }));
  sched.push({ t: `Moyens acceptés : ${c.paymentMethods}`, color: MUTED });
  sched.push({ t: "Merci de rappeler le n° de facture lors du règlement.", color: MUTED });
  y = totalsBlock(doc, y, rows, { title: "Échéancier & règlement", lines: sched });
  y = wordsBox(doc, y, "Arrêtée la présente facture à la somme de :", args.words, args.total);
  if (args.notes) {
    y = section(doc, y, "Notes", 30);
    y = paragraph(doc, y, args.notes) + 4;
  }
  signatures(doc, y, [{ title: `Pour ${c.companyName}`, hint: "Le gérant — signature et cachet" }], c.signaturePath);
  footers(doc, c);
  return toBuffer(doc);
}

export async function receiptPdf(args: {
  company: Company; client: PdfClient; number: string; date: string; amount: number; method: string; reference: string | null;
  invoiceNumber: string; invoiceSubject: string; invoiceTotal: number; paidToDate: number; words: string; notes: string | null;
}) {
  const { company: c } = args;
  const doc = newDoc(`Reçu ${args.number}`);
  let y = header(doc, c, "REÇU DE PAIEMENT", args.number);
  y = parties(doc, y, c, args.client);
  y = metaStrip(doc, y, [["Date du paiement", dFr(args.date)], ["Mode", args.method], ["Référence", args.reference || "—"], ["Facture", args.invoiceNumber]]);

  // Montant reçu, mis en avant
  doc.rect(M, y, W, 64).fill(NAVY);
  doc.rect(M, y, 6, 64).fill(GOLD);
  doc.font("R").fontSize(10).fillColor("#C5CFD9").text("MONTANT REÇU", M + 22, y + 14, { characterSpacing: 1, lineBreak: false });
  doc.font("B").fontSize(26).fillColor(GOLD).text(money(args.amount), M + 22, y + 28, { lineBreak: false });
  doc.font("R").fontSize(9.5).fillColor("#FFFFFF").text(`Objet : ${args.invoiceSubject}`, M + 260, y + 18, { width: W - 280, height: 36, ellipsis: true });
  y += 78;

  y = wordsBox(doc, y, `${c.companyName} reconnaît avoir reçu de ${args.client.name} la somme de :`, args.words, args.amount);
  y = totalsBlock(doc, y, [
    { label: `Total facture ${args.invoiceNumber}`, value: money(args.invoiceTotal) },
    { label: "Total réglé à ce jour", value: money(args.paidToDate) },
    { label: "RESTE À PAYER", value: money(Math.max(args.invoiceTotal - args.paidToDate, 0)), strong: args.paidToDate >= args.invoiceTotal ? "navy" : "gold" },
  ]);
  if (args.paidToDate >= args.invoiceTotal) y = paragraph(doc, y, "La facture est intégralement réglée. Merci pour votre confiance.", { bold: true, color: "#067647" });
  if (args.notes) y = paragraph(doc, y + 4, `Note : ${args.notes}`, { color: MUTED });
  signatures(doc, y + 10, [{ title: `Pour ${c.companyName}`, hint: "Signature et cachet" }], c.signaturePath);
  footers(doc, c);
  return toBuffer(doc);
}
