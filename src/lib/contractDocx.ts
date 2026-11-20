import { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell, WidthType, PageNumber, AlignmentType, HeadingLevel, VerticalAlign } from "docx";
import { articleNumbers, coverDuree, coverMontant, priceRows, resolvedDoc, type Block, type ContractDoc, type Party } from "./contractModel";
import { CLIENT_TYPES } from "./format";

const NAVY = "2C3E50";
const GOLD = "F5A623";

function runs(text: string, opts: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({ text: bold ? part.slice(2, -2) : part, bold: bold || opts.bold, italics: opts.italics, color: opts.color || "22303E", size: opts.size || 21, font: "Calibri" });
  });
}

function p(text: string, extra: { bold?: boolean; color?: string; size?: number; italics?: boolean; center?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: extra.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: runs(text, extra),
  });
}

function cell(text: string, width: number, header = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { fill: NAVY } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: header ? "FFFFFF" : NAVY, font: "Calibri", size: header ? 16 : 20 })] })],
  });
}

export async function contractDocx(raw: ContractDoc, company: Party) {
  const { doc: c } = resolvedDoc(raw, company);
  const numbers = articleNumbers(c.sections);
  const children: (Paragraph | Table)[] = [
    p("CONTRAT DE PRESTATION DE SERVICES", { bold: true, color: GOLD, size: 22, center: true }),
    ...c.title.split("\n").map((line) => new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: line, bold: true, color: NAVY, font: "Calibri", size: 48 })],
    })),
    p(c.subtitle, { italics: true, size: 24 }),
    new Table({
      width: { size: 9638, type: WidthType.DXA },
      columnWidths: [2800, 6838],
      rows: [
        ["Client", c.clientName],
        ["Prestataire", company.companyName],
        ["Contrat n°", c.number || "______"],
        ["Durée", coverDuree(c)],
        ["Montant", coverMontant(c)],
        ["Date de signature", c.signatureDate ? c.signatureDate.split("-").reverse().join(" / ") : "____ / ____ / " + new Date().getFullYear()],
      ].map(([k, v]) => new TableRow({ children: [cell(k, 2800, true), cell(v, 6838)] })),
    }),
    p(""),
    p("SOMMAIRE", { bold: true, color: NAVY, size: 28 }),
    p("Désignation des Parties et préambule"),
    ...c.sections.map((s) => p(`${s.kind === "annex" ? numbers[s.key] : "Article " + numbers[s.key]} — ${s.title}`)),
    p("ENTRE LES SOUSSIGNÉS", { bold: true, color: NAVY, size: 28 }),
    p(`LE CLIENT — ${c.clientName} (${c.clientAcronym || "______"}), ${CLIENT_TYPES[c.clientType] || c.clientType || "______"}, ${c.clientAddress || "______"}, NIF ${c.clientNif || "______________"}, représenté par ${c.repCivility} ${c.repName}, ${c.repTitle || "______"}.`),
    p("D’une part, ET", { center: true, bold: true }),
    p(`LE PRESTATAIRE — ${company.companyName}, ${company.tagline}, ${company.address}, NIF ${company.registrationNumber || "______________"}, représenté par ${company.signatoryName}, ${company.signatoryTitle}. ${company.footerNote}.`),
    p("D’autre part. Les deux constituent « les Parties »."),
    p("PRÉAMBULE", { bold: true, color: NAVY, size: 28 }),
    ...c.preamble.split(/\n+/).filter(Boolean).map((t) => p(t)),
    p("CECI EXPOSÉ, IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :", { bold: true, center: true }),
  ];

  let n = 0;
  for (const s of c.sections) {
    if (s.kind === "article") {
      n += 1;
      children.push(p(`ARTICLE ${n} — ${s.title.toUpperCase()}`, { bold: true, color: GOLD, size: 24 }));
      children.push(...renderBlocks(s.blocks, c, n));
    }
  }
  const when = c.signatureDate ? c.signatureDate.split("-").reverse().join(" / ") : "____ / ____ / " + new Date().getFullYear();
  children.push(p(`Fait à ${c.signaturePlace || "Djibouti"}, le ${when}, en deux (2) exemplaires originaux.`));
  children.push(new Table({
    width: { size: 9638, type: WidthType.DXA },
    columnWidths: [4819, 4819],
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 4819, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          children: [p(`POUR LE CLIENT — ${c.clientAcronym || c.clientName}`, { bold: true, color: "FFFFFF" }), p("Nom :"), p(`Qualité : ${c.repTitle}`), p("Signature et cachet :")],
        }),
        new TableCell({
          width: { size: 4819, type: WidthType.DXA },
          children: [p(`POUR LE PRESTATAIRE — ${company.companyName}`, { bold: true }), p(`Nom : ${company.signatoryName}`), p(`Qualité : ${company.signatoryTitle}`), p(c.includeSignature ? "Signature et cachet : image reprise des Paramètres dans le PDF." : "Généré sans signature.")],
        }),
      ],
    })],
  }));
  let a = 0;
  for (const s of c.sections.filter((x) => x.kind === "annex")) {
    a += 1;
    children.push(new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `ANNEXE ${a} — ${s.title}`, bold: true, color: NAVY, font: "Calibri", size: 28 })] }));
    children.push(...renderBlocks(s.blocks, c, a));
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 800, left: 900, right: 900 } } },
      headers: { default: new Header({ children: [p(`Contrat de prestation de services — ${c.clientName} / ${company.companyName}`, { size: 16, color: "5C6B78" })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: "Calibri", size: 16 })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

function renderBlocks(blocks: Block[], c: ContractDoc, articleNo: number) {
  const out: (Paragraph | Table)[] = [];
  let sub = 0;
  for (const b of blocks) {
    if (b.type === "p") out.push(p(b.text));
    if (b.type === "ul") b.items.forEach((item) => out.push(p("• " + item)));
    if (b.type === "subs") b.items.forEach((item) => { sub += 1; out.push(p(`${articleNo}.${sub}  ${item.text}`)); });
    if (b.type === "table") {
      let headers: string[] = [];
      let rows: string[][] = [];
      if (b.id === "services") { headers = ["N°", "Prestation", "Contenu", "Volume"]; rows = c.services.map((s, i) => [String(i + 1), s.prestation, s.contenu, s.volume]); }
      else if (b.id === "definitions") { headers = ["Terme", "Définition"]; rows = c.definitions.map((d) => [d.term, d.definition]); }
      else if (b.id === "prices") { headers = ["Désignation", "Montant"]; rows = priceRows(c); }
      else { headers = b.headers || []; rows = b.rows || []; }
      if (!headers.length) continue;
      const w = Math.floor(9638 / headers.length);
      out.push(new Table({
        width: { size: 9638, type: WidthType.DXA },
        columnWidths: headers.map(() => w),
        rows: [headers, ...rows].map((row, i) => new TableRow({
          children: row.map((val) => cell(val, w, i === 0)),
        })),
      }));
    }
  }
  return out;
}

