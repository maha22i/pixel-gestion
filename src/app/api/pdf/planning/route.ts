import path from "node:path";
import PDFDocument from "pdfkit";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUser } from "@/lib/auth";
import { addDays, today } from "@/lib/format";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  if (user.perms.planning === "none") return new Response("Accès refusé", { status: 403 });
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get("offset") ?? 0) || 0;
  const write = user.perms.planning === "write" || user.role === "admin";
  // Sans droit d'écriture : uniquement ses propres tâches (comme à l'écran).
  const personId = write ? Number(url.searchParams.get("personne") ?? 0) || 0 : user.id;
  const start = new Date(today() + "T00:00:00");
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(iso, i));
  const rows = (await db.execute(sql`
    SELECT u.name, t.title, t.due_date, t.due_time
    FROM tasks t
    JOIN task_assignees a ON a.task_id = t.id
    JOIN users u ON u.id = a.user_id
    WHERE t.due_date >= ${days[0]} AND t.due_date <= ${days[6]} AND t.status <> 'annule'
      AND (${personId} = 0 OR u.id = ${personId})
    ORDER BY t.due_date, t.due_time NULLS LAST, u.name`)).rows as { name: string; title: string; due_date: string; due_time: string | null }[];
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  const font = path.join(process.cwd(), "public", "fonts", "Carlito-Regular.ttf");
  const bold = path.join(process.cwd(), "public", "fonts", "Carlito-Bold.ttf");
  doc.registerFont("R", font);
  doc.registerFont("B", bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.rect(0, 0, doc.page.width, 48).fill("#2C3E50");
  const fr = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const who = personId ? rows[0]?.name ?? "" : "";
  doc.fillColor("#F5A623").font("B").fontSize(16).text(`Pixel Nomade — Planning du ${fr(days[0])} au ${fr(days[6])}${who ? ` · ${who}` : ""}`, 36, 16);
  doc.fillColor("#22303E").font("R").fontSize(11);
  let y = 70;
  for (const day of days) {
    doc.font("B").text(fr(day), 36, y);
    y += 16;
    const mine = rows.filter((r) => String(r.due_date).slice(0, 10) === day);
    doc.font("R");
    if (!mine.length) { doc.text("—", 48, y); y += 16; }
    for (const r of mine) { doc.text(`${r.due_time ? `${String(r.due_time).slice(0, 5)}  ` : ""}${personId ? "" : `${r.name} · `}${r.title}`, 48, y); y += 14; if (y > 520) { doc.addPage(); y = 40; } }
    y += 8;
  }
  doc.end();
  const buf = await done;
  return new Response(buf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=planning.pdf" } });
}
