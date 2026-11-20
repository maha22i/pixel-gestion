import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { markNotificationsRead } from "../taches/actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt));
  return (
    <>
      <PageHeader title="Toutes mes notifications" actions={<form action={markNotificationsRead}><button className="btn-ghost">Tout marquer comme lu</button></form>} />
      <div className="card">
        {rows.map((n) => (
          <form key={n.id} action={markNotificationsRead} className="flex items-center justify-between border-b px-4 py-3">
            <input type="hidden" name="id" value={n.id} />
            <input type="hidden" name="taskId" value={n.taskId ?? ""} />
            <input type="hidden" name="link" value={n.link ?? ""} />
            <button className={n.readAt ? "text-navy-600" : "font-bold"}>{n.body}</button>
            <span className="text-xs text-navy-600/60">{n.createdAt.toLocaleString("fr-FR")}</span>
          </form>
        ))}
      </div>
    </>
  );
}
