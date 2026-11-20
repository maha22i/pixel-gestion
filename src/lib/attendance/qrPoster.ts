import "server-only";
import QRCode from "qrcode";
import path from "node:path";
import PDFDocument from "pdfkit";
import { appOrigin } from "@/lib/sign";
import { getSettings } from "@/lib/settings";
import { logoFile } from "@/lib/logo";

const NAVY = "#2C3E50";
const GOLD = "#F5A623";

export async function pointerUrl(secret: string) {
  const settings = await getSettings();
  return `${appOrigin(settings.appUrl)}/pointer?s=${encodeURIComponent(secret)}`;
}

export async function qrPng(secret: string) {
  return QRCode.toBuffer(await pointerUrl(secret), {
    type: "png",
    width: 900,
    margin: 1,
    color: { dark: NAVY, light: "#FFFFFF" },
  });
}

export async function qrPosterPdf(siteName: string, address: string, secret: string) {
  const settings = await getSettings();
  const png = await qrPng(secret);
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Pointage ${siteName}`, Author: settings.companyName || "Pixel Nomade" } });
  const font = path.join(process.cwd(), "public", "fonts");
  doc.registerFont("R", path.join(font, "Carlito-Regular.ttf"));
  doc.registerFont("B", path.join(font, "Carlito-Bold.ttf"));
  doc.rect(0, 0, 595.28, 841.89).fill(NAVY);
  doc.rect(0, 0, 595.28, 14).fill(GOLD);
  try { doc.image(logoFile(settings.logoPath), 48, 48, { fit: [220, 70] }); } catch { /* logo absent */ }
  doc.fillColor("#FFFFFF").font("B").fontSize(28).text(siteName, 48, 150, { width: 500 });
  doc.font("R").fontSize(14).fillColor("#D6DDE4").text(address || settings.address, 48, 190, { width: 500 });
  doc.roundedRect(147, 250, 300, 300, 16).fill("#FFFFFF");
  doc.image(png, 162, 265, { fit: [270, 270] });
  doc.fillColor(GOLD).font("B").fontSize(26).text("Scannez pour pointer", 48, 580, { width: 500, align: "center" });
  doc.fillColor("#FFFFFF").font("R").fontSize(13).text("Téléphone de l'équipe, connecté à votre compte.", 48, 624, { width: 500, align: "center" });
  doc.rect(0, 827, 595.28, 15).fill(GOLD);
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
