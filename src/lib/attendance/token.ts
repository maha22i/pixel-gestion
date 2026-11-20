import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newQrSecret() {
  return randomBytes(32).toString("base64url");
}

export function secretsEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
