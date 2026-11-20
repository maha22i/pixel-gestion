import "server-only";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { logoFile, readImageSize, signatureFile } from "./logo";
import { CLIENT_TYPES } from "./format";
import { articleNumbers, coverDuree, coverMontant, priceRows, resolvedDoc, type ContractDoc, type Party, type Section, type Block } from "./contractModel";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";
const INK = "#22303E";
const MUTED = "#5C6B78";
const LINE = "#D5DDE3";
const TINT = "#F2F4F6";
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 48;
const W = PAGE_W - 2 * M;
const FONT = path.join(process.cwd(), "public", "fonts");

type Doc = InstanceType<typeof PDFDocument>;

const GAP = 4;
const LIMIT = PAGE_H - 56;

function plain(text: string) {
  return text.replace(/\*\*/g, "");
}

/** Mesure puis dessine sans laisser pdfkit changer de page tout seul. */
function paint(doc: Doc, text: string, x: number, y: number, width: number, font: "R" | "B" | "I", size: number, color: string) {
  const t = plain(text) || " ";
  doc.font(font).fontSize(size).fillColor(color);
  const h = Math.max(size + 2, doc.heightOfString(t, { width, lineGap: GAP }));
  doc.text(t, x, y, { width, lineGap: GAP, height: h + 2 });
  doc.x = M;
  doc.y = y + h;
  return h;
}

export async function contractPdf(raw: ContractDoc, company: Party) {
  const { doc: c } = resolvedDoc(raw, company);
  const numbers = articleNumbers(c.sections);
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    bufferPages: true,
    autoFirstPage: true,
    info: { Title: c.number || "Contrat", Author: company.companyName },
  });
  pdf.registerFont("R", path.join(FONT, "Carlito-Regular.ttf"));
  pdf.registerFont("B", path.join(FONT, "Carlito-Bold.ttf"));
  pdf.registerFont("I", path.join(FONT, "Carlito-Italic.ttf"));

  cover(pdf, c, company);
  pdf.addPage();
  let y = runningHeader(pdf, c, company);

  y = h2(pdf, y, "Sommaire");
  y = lineItem(pdf, y, "Désignation des Parties et préambule", "");
  for (const s of c.sections) {
    const label = s.kind === "annex" ? numbers[s.key] : `Article ${numbers[s.key]}`;
    y = lineItem(pdf, y, label, s.title);
  }

  y = ensure(pdf, c, company, y, 80);
  y = h2(pdf, y + 8, "Entre les soussignés");
  y = partyBox(pdf, y, "LE CLIENT", clientBlock(c));
  y = centerNote(pdf, y, "D’une part,");
  y = centerNote(pdf, y, "ET");
  y = partyBox(pdf, y, "LE PRESTATAIRE", providerBlock(c, company));
  y = centerNote(pdf, y, "D’autre part,");
  y += paint(pdf, "Le Client et le Prestataire sont ci-après dénommés ensemble « les Parties » et individuellement « la Partie ».", M, y, W, "R", 10.5, INK) + 14;

  if (c.preamble.trim()) {
    y = ensure(pdf, c, company, y, 40);
    y = h2(pdf, y, "Préambule");
    for (const para of c.preamble.split(/\n+/)) {
      y = ensure(pdf, c, company, y, 28);
      y += paint(pdf, para, M, y, W, "R", 10.5, INK) + 10;
    }
  }
  y = ensure(pdf, c, company, y, 36);
  y += paint(pdf, "CECI EXPOSÉ, IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :", M, y, W, "B", 11, NAVY) + 16;

  let ai = 0;
  for (const s of c.sections.filter((x) => x.kind === "article")) {
    ai += 1;
    y = article(pdf, c, company, y, ai, s);
  }

  y = signatures(pdf, c, company, y);

  let xi = 0;
  for (const s of c.sections.filter((x) => x.kind === "annex")) {
    xi += 1;
    pdf.addPage();
    y = runningHeader(pdf, c, company);
    y = annexTitle(pdf, y, xi, s.title);
    y = blocks(pdf, c, company, y, s, ai);
  }

  const range = pdf.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    pdf.font("R").fontSize(8).fillColor(MUTED);
    pdf.text(`Page ${i + 1} / ${range.count}`, M, PAGE_H - 32, { width: W, align: "right", lineBreak: false, height: 12 });
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (b: Buffer) => chunks.push(b));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}

function cover(pdf: Doc, c: ContractDoc, company: Party) {
  try { pdf.image(logoFile(company.logoPath), M, 36, { fit: [170, 52] }); } catch { /* logo absent */ }
  paint(pdf, "CONTRAT DE PRESTATION DE SERVICES", M, 108, W, "B", 11, GOLD);
  const lines = (c.title || "Prestation de services").split("\n");
  let y = 132;
  for (const line of lines) {
    y += paint(pdf, line, M, y, W, "B", 26, NAVY) + 4;
  }
  y += 8;
  const subH = Math.max(36, pdf.font("I").fontSize(12).heightOfString(c.subtitle || " ", { width: W - 16, lineGap: GAP }));
  pdf.rect(M, y, 3, subH).fill(GOLD);
  paint(pdf, c.subtitle || " ", M + 14, y, W - 16, "I", 12, NAVY);
  y += subH + 22;
  const rows: [string, string][] = [
    ["Client", [c.clientName, c.clientAcronym ? `(${c.clientAcronym})` : ""].filter(Boolean).join(" ") || "______"],
    ["Prestataire", company.companyName],
    ["Contrat n°", c.number || "______"],
    ["Durée", coverDuree(c)],
    ["Montant", coverMontant(c)],
    ["Date de signature", c.signatureDate ? c.signatureDate.split("-").reverse().join(" / ") : `____ / ____ / ${new Date().getFullYear()}`],
  ];
  for (const [k, v] of rows) {
    pdf.rect(M, y, W, 28).strokeColor(LINE).lineWidth(0.6).stroke();
    pdf.rect(M, y, 150, 28).fill(TINT);
    pdf.font("B").fontSize(8).fillColor(MUTED).text(k.toUpperCase(), M + 10, y + 9, { width: 130, lineBreak: false, height: 12 });
    pdf.font("B").fontSize(11).fillColor(NAVY).text(v, M + 162, y + 7, { width: W - 174, lineBreak: false, height: 16 });
    y += 28;
  }
  const band = PAGE_H - 78;
  pdf.rect(0, band, PAGE_W, 78).fill(NAVY);
  pdf.font("B").fontSize(9).fillColor(GOLD).text("DOCUMENT CONTRACTUEL CONFIDENTIEL", M, band + 16, { width: W, align: "center", characterSpacing: 1, height: 14 });
  pdf.font("R").fontSize(9).fillColor("#FFFFFF").text(
    `${company.companyName} · ${company.address} · ${company.phone} · ${company.email} · ${company.website}`,
    M, band + 36, { width: W, align: "center", height: 28 },
  );
}

function runningHeader(pdf: Doc, c: ContractDoc, company: Party) {
  try { pdf.image(logoFile(company.logoPath), M, 28, { fit: [72, 22] }); } catch { /* */ }
  pdf.font("R").fontSize(8).fillColor(MUTED).text(
    `Contrat de prestation de services — ${c.clientName || "Client"} / ${company.companyName}`,
    M + 80, 34, { width: W - 80, align: "right", lineBreak: false, height: 12 },
  );
  pdf.moveTo(M, 56).lineTo(M + W, 56).lineWidth(1.4).strokeColor(GOLD).stroke();
  return 72;
}

function ensure(pdf: Doc, c: ContractDoc, company: Party, y: number, h: number) {
  if (y > 80 && y + h > LIMIT) {
    pdf.addPage();
    return runningHeader(pdf, c, company);
  }
  return y;
}

function textH(pdf: Doc, text: string, width: number, font: "R" | "B" | "I", size: number) {
  pdf.font(font).fontSize(size);
  return pdf.heightOfString(plain(text) || " ", { width, lineGap: GAP });
}

function h2(pdf: Doc, y: number, t: string) {
  const h = paint(pdf, t.toUpperCase(), M, y, W, "B", 13, NAVY);
  return y + h + 10;
}

function lineItem(pdf: Doc, y: number, left: string, right: string) {
  pdf.font("B").fontSize(10);
  const h1 = pdf.heightOfString(plain(left) || " ", { width: 110, lineGap: GAP });
  pdf.font("R").fontSize(10);
  const h2 = pdf.heightOfString(plain(right) || " ", { width: W - 120, lineGap: GAP });
  const h = Math.max(h1, h2, 14);
  pdf.font("B").fontSize(10).fillColor(NAVY).text(plain(left), M, y, { width: 110, lineGap: GAP, height: h + 2 });
  pdf.font("R").fontSize(10).fillColor(INK).text(plain(right) || " ", M + 120, y, { width: W - 120, lineGap: GAP, height: h + 2 });
  return y + h + 6;
}

function partyBox(pdf: Doc, y: number, label: string, lines: string[]) {
  pdf.font("R").fontSize(10.5);
  const inner = lines.join("\n");
  const innerH = pdf.heightOfString(inner, { width: W - 28, lineGap: GAP });
  const h = innerH + 40;
  pdf.rect(M, y, W, h).fillAndStroke("#F7F8F9", LINE);
  pdf.rect(M, y, 4, h).fill(GOLD);
  pdf.font("B").fontSize(9).fillColor(GOLD).text(label, M + 14, y + 8, { width: W - 28, height: 14 });
  pdf.font("R").fontSize(10.5).fillColor(INK).text(inner, M + 14, y + 26, { width: W - 28, lineGap: GAP, height: innerH + 4 });
  return y + h + 10;
}

function clientBlock(c: ContractDoc) {
  const who = c.clientName || "______";
  const sigle = c.clientAcronym ? ` (${c.clientAcronym})` : "";
  const nature = c.clientType ? `, ${CLIENT_TYPES[c.clientType] || c.clientType}` : "";
  const rep = [c.repCivility, c.repName].filter(Boolean).join(" ") || "______________________________";
  return [
    `${who}${sigle}${nature},`,
    `dont le siège est situé ${c.clientAddress || "______________________________________"},`,
    `immatriculé sous le numéro ${c.clientNif || "______________________"},`,
    `représenté par ${rep}, en sa qualité de ${c.repTitle || "____________________"}, dûment habilité(e) aux fins des présentes,`,
    `ci-après dénommé « le Client »${c.clientAcronym ? ` ou « ${c.clientAcronym} »` : ""}.`,
  ];
}

function providerBlock(c: ContractDoc, company: Party) {
  return [
    `${company.companyName}, ${company.tagline}, ${company.footerNote},`,
    `dont le siège est situé ${company.address}, immatriculé sous le numéro ${company.registrationNumber || "______________________"},`,
    `représenté par ${company.signatoryName || "____________________"}, en sa qualité de ${company.signatoryTitle || "____________________"}, dûment habilité aux fins des présentes,`,
    `ci-après dénommé « le Prestataire ».`,
  ];
}

function centerNote(pdf: Doc, y: number, t: string) {
  const h = paint(pdf, t, M, y, W, "B", 11, NAVY);
  return y + h + 8;
}

function article(pdf: Doc, c: ContractDoc, company: Party, y: number, n: number, s: Section) {
  const title = `ARTICLE ${n} — ${s.title.toUpperCase()}`;
  pdf.font("B").fontSize(12);
  const titleH = pdf.heightOfString(title, { width: W, lineGap: GAP });
  y = ensure(pdf, c, company, y, titleH + 36);
  paint(pdf, title, M, y, W, "B", 12, GOLD);
  return blocks(pdf, c, company, y + titleH + 10, s, n);
}

function blocks(pdf: Doc, c: ContractDoc, company: Party, y: number, s: Section, articleNo: number) {
  let sub = 0;
  for (const b of s.blocks) y = block(pdf, c, company, y, b, articleNo, () => ++sub);
  return y + 8;
}

function block(pdf: Doc, c: ContractDoc, company: Party, y: number, b: Block, articleNo: number, nextSub: () => number) {
  if (b.type === "p") {
    y = ensure(pdf, c, company, y, textH(pdf, b.text, W, "R", 10.5) + 10);
    return y + paint(pdf, b.text, M, y, W, "R", 10.5, INK) + 10;
  }
  if (b.type === "ul") {
    for (const item of b.items) {
      y = ensure(pdf, c, company, y, textH(pdf, item, W - 14, "R", 10.5) + 6);
      pdf.font("B").fontSize(10.5).fillColor(GOLD).text("•", M, y, { lineBreak: false, height: 14 });
      const h = paint(pdf, item, M + 14, y, W - 14, "R", 10.5, INK);
      y += h + 6;
    }
    return y;
  }
  if (b.type === "subs") {
    for (const item of b.items) {
      const n = nextSub();
      y = ensure(pdf, c, company, y, textH(pdf, item.text, W - 40, "R", 10.5) + 8);
      pdf.font("B").fontSize(10.5).fillColor(NAVY).text(`${articleNo}.${n}`, M, y, { width: 36, lineBreak: false, height: 14 });
      const h = paint(pdf, item.text, M + 40, y, W - 40, "R", 10.5, INK);
      y += h + 8;
    }
    return y;
  }
  if (b.type === "table") {
    if (b.id === "services") return table(pdf, c, company, y, ["N°", "Prestation", "Contenu", "Volume inclus"], c.services.map((s, i) => [String(i + 1), s.prestation, s.contenu, s.volume]), [36, 120, 250, W - 406]);
    if (b.id === "definitions") return table(pdf, c, company, y, ["Terme", "Définition"], c.definitions.map((d) => [d.term, d.definition]), [130, W - 130]);
    if (b.id === "prices") return table(pdf, c, company, y, ["Désignation", "Montant"], priceRows(c), [W * 0.62, W * 0.38]);
    const headers = b.headers || [];
    const rows = b.rows || [];
    const cols = headers.map(() => W / Math.max(headers.length, 1));
    return table(pdf, c, company, y, headers, rows, cols);
  }
  return y;
}

function table(pdf: Doc, c: ContractDoc, company: Party, y: number, headers: string[], rows: string[][], widths: number[]) {
  const drawHead = (yy: number) => {
    let x = M;
    pdf.rect(M, yy, W, 18).fill(NAVY);
    headers.forEach((h, i) => {
      pdf.font("B").fontSize(8).fillColor("#FFFFFF").text(h.toUpperCase(), x + 4, yy + 5, { width: Math.max(8, widths[i] - 8), lineBreak: false, height: 12 });
      x += widths[i];
    });
    return yy + 18;
  };
  y = ensure(pdf, c, company, y, 36);
  y = drawHead(y);
  rows.forEach((row, ri) => {
    pdf.font("R").fontSize(9.5);
    const h = Math.max(22, ...row.map((cell, i) => pdf.heightOfString(plain(cell) || " ", { width: Math.max(8, widths[i] - 10), lineGap: 3 }) + 10));
    if (y + h > LIMIT) {
      pdf.addPage();
      y = runningHeader(pdf, c, company);
      y = drawHead(y);
    }
    let x = M;
    if (ri % 2 === 0) pdf.rect(M, y, W, h).fill("#FAFBFC");
    row.forEach((cell, i) => {
      if (i === 0) pdf.rect(x, y, widths[i], h).fill(TINT);
      pdf.font(i === 0 ? "B" : "R").fontSize(9.5).fillColor(INK).text(plain(cell) || " ", x + 5, y + 5, { width: Math.max(8, widths[i] - 10), lineGap: 3, height: h - 8 });
      x += widths[i];
    });
    pdf.rect(M, y, W, h).strokeColor(LINE).lineWidth(0.4).stroke();
    y += h;
  });
  return y + 8;
}

function signatures(pdf: Doc, c: ContractDoc, company: Party, y: number) {
  const blockH = 230;
  y = ensure(pdf, c, company, y, blockH);
  const when = c.signatureDate ? c.signatureDate.split("-").reverse().join(" / ") : `____ / ____ / ${new Date().getFullYear()}`;
  y += paint(pdf, `Fait à ${c.signaturePlace || "Djibouti"}, le ${when}, en deux (2) exemplaires originaux.`, M, y, W, "R", 10.5, INK) + 6;
  y += paint(pdf, "Chaque page est paraphée. Les signatures sont précédées de la mention « Lu et approuvé ».", M, y, W, "I", 9, MUTED) + 12;
  const col = (W - 12) / 2;
  const h = 168;
  const heads = [
    `POUR LE CLIENT${c.clientAcronym ? ` — ${c.clientAcronym}` : ""}`,
    `POUR LE PRESTATAIRE — ${company.companyName.toUpperCase()}`,
  ];
  heads.forEach((title, i) => {
    const x = M + i * (col + 12);
    pdf.rect(x, y, col, 22).fill(NAVY);
    pdf.font("B").fontSize(8).fillColor("#FFFFFF").text(title, x + 6, y + 6, { width: col - 12, lineBreak: false, height: 12 });
    pdf.rect(x, y + 22, col, h - 22).strokeColor(LINE).stroke();
  });
  const left = M + 8;
  const right = M + col + 20;
  const base = y + 32;
  const line = (t: string, x: number, yy: number) => {
    pdf.font("R").fontSize(9).fillColor(INK).text(t, x, yy, { width: col - 16, height: 14, lineBreak: false });
  };
  line("Nom : ______________________", left, base);
  line(`Qualité : ${c.repTitle || "____________________"}`, left, base + 18);
  line("Signature et cachet :", left, base + 36);
  line(`Nom : ${company.signatoryName || "______________________"}`, right, base);
  line(`Qualité : ${company.signatoryTitle || "____________________"}`, right, base + 18);
  line("Signature et cachet :", right, base + 36);
  if (c.includeSignature) {
    try {
      const file = signatureFile(company.signaturePath);
      if (!fs.existsSync(file)) throw new Error("signature");
      const size = readImageSize(file);
      const maxW = 150;
      const maxH = 58;
      let w = maxW;
      let hImg = maxH;
      if (size && size.w && size.h) {
        const scale = Math.min(maxW / size.w, maxH / size.h);
        w = size.w * scale;
        hImg = size.h * scale;
      }
      pdf.image(file, right, base + 52, { width: w, height: hImg });
    } catch { /* image illisible */ }
  }
  return y + h + 10;
}

function annexTitle(pdf: Doc, y: number, n: number, title: string) {
  const h = 48;
  pdf.rect(M, y, W, h).fill(NAVY);
  pdf.rect(M, y, 5, h).fill(GOLD);
  pdf.font("B").fontSize(9).fillColor(GOLD).text(`ANNEXE ${n}`, M + 16, y + 8, { width: W - 32, height: 12 });
  pdf.font("B").fontSize(13).fillColor("#FFFFFF").text(title, M + 16, y + 22, { width: W - 32, height: 18 });
  return y + h + 16;
}

export function signatureMissing(company: Party, include: boolean) {
  if (!include) return false;
  try { return !fs.existsSync(signatureFile(company.signaturePath)); } catch { return true; }
}
