import "server-only";
import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function ensureSignToken(id: number) {
  const [q] = await db.select({ signToken: schema.quotes.signToken }).from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) return null;
  if (q.signToken) return q.signToken;
  const token = randomBytes(24).toString("base64url");
  await db.update(schema.quotes).set({ signToken: token }).where(eq(schema.quotes.id, id));
  return token;
}

/** Adresse utilisée dans le lien envoyé au client. */
export function appOrigin(appUrl: string) {
  const configured = appUrl.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(configured)) return configured;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function signUrl(origin: string, token: string) {
  return `${origin}/signer/${token}`;
}

export { quoteInviteText, whatsappDigits, whatsappLink } from "./whatsapp";

export function signaturePng(data: string | null | undefined) {
  if (!data) return null;
  const b64 = data.replace(/^data:image\/\w+;base64,/, "");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return buf;
}
