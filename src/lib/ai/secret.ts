import "server-only";
import crypto from "node:crypto";

/** Chiffrement de la clé API (AES-256-GCM, clé dérivée d'AUTH_SECRET). */
function key() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET manquant");
  return crypto.createHash("sha256").update(`aicha:${s}`).digest();
}

export function sealSecret(plain: string) {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function openSecret(sealed: string) {
  if (!sealed?.startsWith("v1:")) return "";
  try {
    const [, iv, tag, data] = sealed.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/** « sk-…abcd » pour l'affichage. */
export function maskKey(plain: string) {
  return plain ? `${plain.slice(0, 3)}…${plain.slice(-4)}` : "";
}
