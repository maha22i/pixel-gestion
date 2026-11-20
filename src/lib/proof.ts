import "server-only";
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "data", "finance-files");
const MAX = 15 * 1024 * 1024;

const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export type Proof = {
  proofFilename: string;
  proofStored: string;
  proofMime: string;
  proofSize: number;
};

export function proofPath(stored: string) {
  return path.join(DIR, path.basename(stored));
}

export function fileFrom(fd: FormData, key = "file") {
  const file = fd.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  return file;
}

function mimeOf(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = BY_EXT[ext];
  const raw = (file.type || "").toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (fromExt && (!raw || raw === "application/octet-stream")) return fromExt;
  if (raw.startsWith("image/") || raw === "application/pdf") return raw;
  return fromExt ?? "";
}

export async function storeProof(file: File): Promise<{ ok: true; proof: Proof } | { ok: false; code: "taille" | "type" }> {
  if (file.size > MAX) return { ok: false, code: "taille" };
  const mime = mimeOf(file);
  if (!mime) return { ok: false, code: "type" };
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.promises.mkdir(DIR, { recursive: true });
  const stored = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fs.promises.writeFile(path.join(DIR, stored), buf);
  return {
    ok: true,
    proof: {
      proofFilename: (file.name || "justificatif").slice(0, 180),
      proofStored: stored,
      proofMime: mime,
      proofSize: file.size,
    },
  };
}

export async function removeProof(stored: string | null | undefined) {
  if (!stored) return;
  await fs.promises.unlink(proofPath(stored)).catch(() => {});
}
