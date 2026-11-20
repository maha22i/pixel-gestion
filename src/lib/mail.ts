import "server-only";
import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

type Smtp = {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpPassword: string; smtpFrom: string; smtpSecure: boolean;
  companyName: string; email: string;
};

export function smtpReady(s: { smtpHost: string; smtpFrom: string; email: string }) {
  return Boolean(s.smtpHost.trim() && (s.smtpFrom.trim() || s.email.trim()));
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const [s] = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  if (!s || !smtpReady(s)) return false;
  const fromAddr = s.smtpFrom.trim() || s.email.trim();
  const transporter = nodemailer.createTransport({
    host: s.smtpHost.trim(),
    port: s.smtpPort || 587,
    secure: s.smtpSecure || s.smtpPort === 465,
    auth: s.smtpUser.trim() ? { user: s.smtpUser.trim(), pass: s.smtpPassword } : undefined,
  });
  await transporter.sendMail({
    from: `"${s.companyName.replace(/"/g, "")}" <${fromAddr}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
  return true;
}

export async function sendQuoteEmail(
  s: Smtp,
  to: string,
  opts: { clientName: string; number: string; subject: string; url: string; text: string },
  pdf?: { filename: string; content: Buffer },
) {
  const fromAddr = s.smtpFrom.trim() || s.email.trim();
  const transporter = nodemailer.createTransport({
    host: s.smtpHost.trim(),
    port: s.smtpPort || 587,
    secure: s.smtpSecure || s.smtpPort === 465,
    auth: s.smtpUser.trim() ? { user: s.smtpUser.trim(), pass: s.smtpPassword } : undefined,
  });
  const company = s.companyName.replace(/"/g, "");
  await transporter.sendMail({
    from: `"${company}" <${fromAddr}>`,
    to,
    subject: `Devis ${opts.number} — ${company}`,
    text: opts.text,
    html: `<p>Bonjour ${esc(opts.clientName)},</p>
<p>Votre devis <strong>${esc(opts.number)}</strong> (${esc(opts.subject)}) est prêt. Consultez-le et signez-le en ligne :</p>
<p><a href="${esc(opts.url)}">${esc(opts.url)}</a></p>
<p>${esc(company)}</p>`,
    attachments: pdf ? [{ filename: pdf.filename, content: pdf.content, contentType: "application/pdf" }] : undefined,
  });
}
