import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { MODULES, levelLabel, roleLabel } from "@/lib/modules";
import { PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ConfirmButton";
import { changeOwnPassword, saveNotifyPrefs } from "../utilisateurs/actions";
import { NOTIFY_GROUPS } from "@/lib/notifyTypes";

export default async function Profile({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const u = await requireUser();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  const stats = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'termine' AND t.due_date >= date_trunc('week', now())::date)::int AS week,
      COUNT(*) FILTER (WHERE t.status = 'termine' AND t.due_date >= date_trunc('month', now())::date)::int AS month,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status NOT IN ('termine','annule'))::int AS late
    FROM tasks t JOIN task_assignees a ON a.task_id = t.id AND a.user_id = ${u.id}`)).rows[0] as any;
  const prefs = (row?.notifyPrefs ?? {}) as Record<string, boolean>;
  return (
    <>
      <PageHeader title="Mon profil" subtitle={`${u.name} · ${u.email} · ${roleLabel(u.role)}`} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Terminées cette semaine" value={stats?.week ?? 0} />
        <Stat label="Terminées ce mois" value={stats?.month ?? 0} />
        <Stat label="En retard" value={stats?.late ?? 0} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <form action={changeOwnPassword} className="card card-pad space-y-4">
          <p className="h-section">Changer mon mot de passe</p>
          <Flash message={searchParams.ok === "1" ? "Mot de passe mis à jour." : ""} clear={["ok"]} />
          <Flash
            tone="error"
            clear={["e"]}
            message={
              searchParams.e === "actuel" ? "Mot de passe actuel incorrect."
              : searchParams.e === "nouveau" ? "Le nouveau mot de passe doit faire 8 caractères et être confirmé à l'identique."
              : ""
            }
          />
          <div><label className="label">Mot de passe actuel</label><input name="current" type="password" className="input" required /></div>
          <div><label className="label">Nouveau mot de passe</label><input name="next" type="password" className="input" minLength={8} required /></div>
          <div><label className="label">Confirmer</label><input name="confirm" type="password" className="input" minLength={8} required /></div>
          <SubmitButton>Mettre à jour</SubmitButton>
        </form>
        <form action={saveNotifyPrefs} className="card card-pad space-y-4">
          <div>
            <p className="h-section">Notifications par e-mail</p>
            <p className="mt-1 text-sm text-navy-600/75">Toutes les alertes restent visibles dans la cloche. Cochez celles à recevoir aussi par e-mail.</p>
          </div>
          <Flash message={searchParams.ok === "notif" ? "Préférences enregistrées." : ""} clear={["ok"]} />
          {NOTIFY_GROUPS.map((g) => (
            <fieldset key={g.label}>
              <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-navy-600/70">{g.label}</legend>
              {g.items.map((i) => (
                <label key={i.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-navy-50/70">
                  <input type="checkbox" name={`mail_${i.key}`} defaultChecked={!!prefs[i.key]} className="mt-0.5 h-4 w-4 shrink-0 accent-[#2C3E50]" />
                  <span className="text-navy-800">{i.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
          <SubmitButton>Enregistrer</SubmitButton>
        </form>
        <div className="card">
          <p className="h-section px-5 pt-5 pb-3">Mes droits</p>
          <table className="table">
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.key}><td className="font-bold">{m.label}</td><td className="text-navy-600">{levelLabel(m.key, u.perms[m.key])}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
