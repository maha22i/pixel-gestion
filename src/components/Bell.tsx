import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { markNotificationsRead } from "@/app/(app)/taches/actions";

export async function Bell({ userId, tone = "navy" }: { userId: number; tone?: "navy" | "light" }) {
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(8);
  const unread = rows.filter((r) => !r.readAt).length;
  return (
    <details className="relative">
      <summary className={`relative grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full [&::-webkit-details-marker]:hidden ${tone === "light" ? "text-white hover:bg-white/10" : "text-navy hover:bg-gold/15"}`} aria-label="Notifications">
        <BellIcon size={20} />
        {unread > 0 && (
          <span className="absolute right-0 top-0 grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-navy">{unread}</span>
        )}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border border-gold/40 bg-white p-3 text-navy shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[calc(3.5rem+env(safe-area-inset-top)+0.35rem)] max-sm:w-auto">
        <p className="mb-2 text-sm font-bold">Notifications</p>
        {rows.length === 0 ? <p className="text-sm text-navy-600">Aucune notification.</p> : rows.map((n) => (
          <form key={n.id} action={markNotificationsRead} className="border-b border-gold/20 py-2 text-sm">
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="taskId" value={n.taskId ?? ""} />
            <input type="hidden" name="link" value={n.link ?? ""} />
            <button className={`text-left ${n.readAt ? "text-navy-600" : "font-bold"}`}>{n.body}</button>
          </form>
        ))}
        <div className="mt-2 flex justify-between text-sm">
          <Link href="/notifications" className="font-bold text-gold-600">Tout voir</Link>
          <form action={markNotificationsRead}><button className="font-bold text-navy">Tout lu</button></form>
        </div>
      </div>
    </details>
  );
}
