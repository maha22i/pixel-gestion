export const TZ = "Africa/Djibouti";

export type DjiboutiClock = { day: string; time: string; minutes: number };

export function djiboutiClock(d = new Date()): DjiboutiClock {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour");
  const minute = get("minute");
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${minute}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

export function weekdayIndex(day: string) {
  return new Date(`${day}T12:00:00+03:00`).getUTCDay();
}

export function parseHM(hm: string) {
  const [h, m] = hm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function formatHM(total: number) {
  const mins = Math.max(0, Math.round(total));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatClock(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function daysOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= count; d++) out.push(`${ym}-${String(d).padStart(2, "0")}`);
  return out;
}

export function addIsoDays(day: string, days: number) {
  const dt = new Date(`${day}T12:00:00+03:00`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function monthOf(day: string) {
  return day.slice(0, 7);
}

export function djiboutiStamp(day: string, time: string) {
  const hm = /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  return new Date(`${day}T${hm}:00+03:00`);
}

export function formatDjiboutiTime(d: Date) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function formatDjiboutiDate(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}
