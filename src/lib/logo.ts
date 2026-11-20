import "server-only";
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 2 * 1024 * 1024;
const NAME = /^(logo|signature)-\d+\.(png|jpe?g)$/;
const DEFAULT_LOGO = path.join(process.cwd(), "public", "logo.png");
const DEFAULT_SIGNATURE = path.join(process.cwd(), "public", "signature.png");

export type ImageKind = "logo" | "signature";

export function imageExt(buf: Buffer): "png" | "jpg" | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  return null;
}

export function logoTooBig(size: number) {
  return size > MAX_BYTES;
}

/** Chemin public servi par Next (`/uploads/logo-….png`), ou null. */
export async function writeImage(kind: ImageKind, buf: Buffer): Promise<string> {
  const ext = imageExt(buf);
  if (!ext || logoTooBig(buf.length)) throw new Error(kind);
  const name = `${kind}-${Date.now()}.${ext}`;
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, name), buf);
  return `/uploads/${name}`;
}

export async function writeLogo(buf: Buffer) {
  return writeImage("logo", buf);
}

export async function deleteStoredLogo(storedPath: string | null | undefined) {
  if (!storedPath) return;
  const name = path.basename(storedPath);
  if (!NAME.test(name)) return;
  await fs.promises.unlink(path.join(process.cwd(), "public", "uploads", name)).catch(() => {});
}

function storedFile(storedPath: string | null | undefined, fallback: string) {
  if (storedPath) {
    const name = path.basename(storedPath);
    if (NAME.test(name)) {
      const file = path.join(process.cwd(), "public", "uploads", name);
      if (fs.existsSync(file)) return file;
    }
  }
  return fallback;
}

/** Fichier à incruster dans le PDF : logo téléversé, sinon le logo par défaut. */
export function logoFile(logoPath?: string | null) {
  return storedFile(logoPath, DEFAULT_LOGO);
}

/** Signature et cachet : image téléversée, sinon l'image fournie par défaut. */
export function signatureFile(signaturePath?: string | null) {
  return storedFile(signaturePath, DEFAULT_SIGNATURE);
}

export function readImageSize(file: string): { w: number; h: number } | null {
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const b = buf.subarray(0, n);
    if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50) {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) return null;
        const marker = b[o + 1];
        if (marker === 0xd8 || marker === 0xd9) { o += 2; continue; }
        const len = b.readUInt16BE(o + 2);
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
        }
        o += 2 + len;
      }
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
