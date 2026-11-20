export function normalizeIp(raw: string) {
  let ip = raw.trim().toLowerCase();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  return ip;
}

export function clientIpFromHeaders(h: { get(name: string): string | null }) {
  const real = h.get("x-real-ip");
  if (real?.trim()) return normalizeIp(real.split(",")[0] ?? "");
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return normalizeIp(last);
  }
  return "";
}
