import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, sql, type SQL } from "drizzle-orm";
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Flag, Layers, ListTodo, Plus } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PRIORITY, TASK_STATUS, today } from "@/lib/format";
import { canEditTask, taskScope } from "@/lib/tasks";
import { Avatar, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { Modal } from "@/components/Modal";
import { TaskWizard } from "./[id]/TaskWizard";
import { TaskFilters } from "./TaskFilters";
import { createTask, setStatus } from "./actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const VIEWS = [
  { key: "a_faire", label: "À faire" },
  { key: "mes", label: "Mes tâches" },
  { key: "retard", label: "En retard" },
  { key: "semaine", label: "7 prochains jours" },
  { key: "revue", label: "À valider" },
  { key: "bloquees", label: "Bloquées" },
  { key: "terminees", label: "Terminées" },
  { key: "toutes", label: "Toutes" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];
type GroupKey = "echeance" | "projet" | "liste";

type Row = {
  id: number; title: string; status: string; priority: string;
  due_date: string | null; due_time: string | null; start_date: string | null;
  project_id: number | null; project_title: string | null; client_name: string | null;
  assignees: { id: number; name: string; color: string | null }[] | null;
  mine: boolean;
};

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

function dueLabel(due: string | null, time: string | null, day: string, done: boolean) {
  if (!due) return { text: "Sans échéance", tone: "text-navy-600/45" };
  const d = daysBetween(day, due);
  const hm = time ? ` · ${time}` : "";
  if (!done && d < 0) return { text: d === -1 ? "Hier" : `Retard de ${-d} j`, tone: "font-bold text-red-700" };
  if (d === 0) return { text: `Aujourd'hui${hm}`, tone: done ? "text-navy-600/70" : "font-bold text-amber-800" };
  if (d === 1) return { text: `Demain${hm}`, tone: "font-semibold text-navy" };
  const date = new Date(`${due}T12:00:00`);
  const sameYear = due.slice(0, 4) === day.slice(0, 4);
  const text = date.toLocaleDateString("fr-FR", { weekday: d > 0 && d < 7 ? "long" : "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  return { text: text.charAt(0).toUpperCase() + text.slice(1) + (d > 0 && d < 7 ? hm : ""), tone: "text-navy-600/80" };
}

function bucketOf(t: Row, day: string) {
  if (!t.due_date) return { key: "z", label: "Sans échéance", tone: "text-navy-600/60" };
  const open = t.status !== "termine" && t.status !== "annule";
  const d = daysBetween(day, t.due_date);
  if (open && d < 0) return { key: "a", label: "En retard", tone: "text-red-700" };
  if (d < 0) return { key: "a2", label: "Passées", tone: "text-navy-600/60" };
  if (d === 0) return { key: "b", label: "Aujourd'hui", tone: "text-amber-800" };
  if (d === 1) return { key: "c", label: "Demain", tone: "text-navy" };
  if (d < 7) return { key: "d", label: "Cette semaine", tone: "text-navy" };
  if (d < 31) return { key: "e", label: "Dans le mois", tone: "text-navy-600" };
  return { key: "f", label: "Plus tard", tone: "text-navy-600/70" };
}

export default async function TasksPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("taches");
  const scope = taskScope(user);
  const own = scope === "own";
  const openId = Number(searchParams.t) || 0;
  if (openId > 0) redirect(`/taches/${openId}`);
  if (searchParams.filtre === "revue" && !searchParams.vue) redirect("/taches?vue=revue");

  const day = today();
  const view: ViewKey = (VIEWS.find((v) => v.key === searchParams.vue)?.key ?? "a_faire") as ViewKey;
  const group: GroupKey = searchParams.groupe === "projet" || searchParams.groupe === "liste" ? searchParams.groupe : view === "terminees" || view === "toutes" ? "liste" : "echeance";
  const q = (searchParams.q ?? "").trim();
  const projectId = Number(searchParams.projet) || 0;
  const personId = own ? 0 : Number(searchParams.personne) || 0;
  const priority = searchParams.priorite && searchParams.priorite in PRIORITY ? searchParams.priorite : "";
  const page = Math.max(1, Number(searchParams.page) || 1);

  // Ce que la personne a le droit de voir, puis les filtres de la barre.
  const where: SQL[] = [
    sql`(${own} = false OR EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${user.id}))`,
    sql`(${user.role} = 'admin' OR t.project_id IS NULL OR p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ${user.id}))`,
  ];
  if (q) where.push(sql`(t.title ILIKE ${"%" + q + "%"} OR p.title ILIKE ${"%" + q + "%"} OR c.name ILIKE ${"%" + q + "%"})`);
  if (projectId) where.push(sql`t.project_id = ${projectId}`);
  if (personId) where.push(sql`EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${personId})`);
  if (priority) where.push(sql`t.priority = ${priority}`);
  const base = sql.join(where, sql` AND `);

  const OPEN = sql`t.status NOT IN ('termine', 'annule')`;
  const MINE = sql`EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id AND a.user_id = ${user.id})`;
  const week = addDays(day, 6);
  const viewSql: Record<ViewKey, SQL> = {
    a_faire: OPEN,
    mes: sql`${OPEN} AND ${MINE}`,
    retard: sql`${OPEN} AND t.due_date < ${day}`,
    semaine: sql`${OPEN} AND t.due_date BETWEEN ${day} AND ${week}`,
    revue: sql`t.status = 'en_revue'`,
    bloquees: sql`t.status = 'bloque'`,
    terminees: sql`t.status = 'termine'`,
    toutes: sql`TRUE`,
  };

  const FROM = sql`FROM tasks t LEFT JOIN projects p ON p.id = t.project_id LEFT JOIN clients c ON c.id = t.client_id`;
  const [counts] = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ${viewSql.a_faire})::int AS a_faire,
      COUNT(*) FILTER (WHERE ${viewSql.mes})::int AS mes,
      COUNT(*) FILTER (WHERE ${viewSql.retard})::int AS retard,
      COUNT(*) FILTER (WHERE ${viewSql.semaine})::int AS semaine,
      COUNT(*) FILTER (WHERE ${viewSql.revue})::int AS revue,
      COUNT(*) FILTER (WHERE ${viewSql.bloquees})::int AS bloquees,
      COUNT(*) FILTER (WHERE ${viewSql.terminees})::int AS terminees,
      COUNT(*)::int AS toutes
    ${FROM} WHERE ${base}`)).rows as Record<ViewKey, number>[];
  const total = counts?.[view] ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);

  const PRIO = sql`CASE t.priority WHEN 'urgente' THEN 0 WHEN 'haute' THEN 1 WHEN 'normale' THEN 2 ELSE 3 END`;
  const order = view === "terminees"
    ? sql`t.due_date DESC NULLS LAST, t.id DESC`
    : group === "projet"
      ? sql`p.title NULLS LAST, t.project_id, t.due_date NULLS LAST, ${PRIO}, t.id`
      : sql`t.due_date NULLS LAST, t.due_time NULLS LAST, ${PRIO}, t.id`;
  const rows = (await db.execute(sql`
    SELECT t.id, t.title, t.status, t.priority, t.due_date::text AS due_date, t.due_time, t.start_date::text AS start_date,
      t.project_id, p.title AS project_title, c.name AS client_name,
      (SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color) ORDER BY u.name)
         FROM task_assignees a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id) AS assignees,
      ${MINE} AS mine
    ${FROM}
    WHERE ${base} AND ${viewSql[view]}
    ORDER BY ${order}
    LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`)).rows as Row[];

  // Totaux réels de chaque groupe (la page n'en montre qu'une partie).
  const groupTotals = new Map<string, number>();
  if (rows.length && group === "echeance") {
    const BUCKET = sql`CASE
      WHEN t.due_date IS NULL THEN 'z'
      WHEN t.due_date < ${day} AND t.status NOT IN ('termine', 'annule') THEN 'a'
      WHEN t.due_date < ${day} THEN 'a2'
      WHEN t.due_date = ${day} THEN 'b'
      WHEN t.due_date = ${addDays(day, 1)} THEN 'c'
      WHEN t.due_date < ${addDays(day, 7)} THEN 'd'
      WHEN t.due_date < ${addDays(day, 31)} THEN 'e'
      ELSE 'f' END`;
    const r = (await db.execute(sql`SELECT ${BUCKET} AS k, COUNT(*)::int AS n ${FROM} WHERE ${base} AND ${viewSql[view]} GROUP BY 1`)).rows as { k: string; n: number }[];
    for (const x of r) groupTotals.set(x.k, x.n);
  } else if (rows.length && group === "projet") {
    const ids = [...new Set(rows.map((t) => t.project_id ?? 0))];
    const r = (await db.execute(sql`SELECT COALESCE(t.project_id, 0) AS k, COUNT(*)::int AS n ${FROM}
      WHERE ${base} AND ${viewSql[view]} AND COALESCE(t.project_id, 0) IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) GROUP BY 1`)).rows as { k: number; n: number }[];
    for (const x of r) groupTotals.set(`p${x.k}`, x.n);
  }

  const people = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const projects = (await db.execute(user.role === "admin"
    ? sql`SELECT p.id, p.title, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id ORDER BY p.id DESC`
    : sql`SELECT p.id, p.title, c.name AS client FROM projects p LEFT JOIN clients c ON c.id = p.client_id
          WHERE p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id})
          ORDER BY p.id DESC`)).rows as { id: number; title: string; client: string | null }[];
  const types = searchParams.nouvelle
    ? await db.select({ id: schema.taskTypes.id, name: schema.taskTypes.name }).from(schema.taskTypes).orderBy(asc(schema.taskTypes.position))
    : [];

  // Adresse de la liste avec ses filtres (sans fenêtre ni message), pour revenir au même endroit.
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (v && !["nouvelle", "ok", "e", "t", "filtre"].includes(k)) keep.set(k, v);
  const here = `/taches${keep.toString() ? `?${keep}` : ""}`;
  const link = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(keep);
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    const s = u.toString();
    return `/taches${s ? `?${s}` : ""}`;
  };
  const withParam = (extra: string) => `${here}${here.includes("?") ? "&" : "?"}${extra}`;
  const editor = canEditTask(user);
  const filtered = !!(q || projectId || personId || priority);
  const visibleViews = VIEWS.filter((v) => !(own && v.key === "mes"));

  // Regroupement de la page courante.
  const groups: { key: string; label: string; tone: string; href?: string; sub?: string; items: Row[] }[] = [];
  for (const t of rows) {
    const g = group === "projet"
      ? { key: `p${t.project_id ?? 0}`, label: t.project_title ?? "Sans projet", tone: "text-navy", sub: t.client_name ?? undefined, href: t.project_id && !projectId ? link({ projet: String(t.project_id), page: null }) : undefined }
      : group === "echeance" ? bucketOf(t, day) : { key: "all", label: "", tone: "" };
    const last = groups[groups.length - 1];
    if (last && last.key === g.key) last.items.push(t);
    else groups.push({ ...g, items: [t] });
  }

  return (
    <div>
      <PageHeader
        title="Tâches"
        subtitle={own ? "Les tâches qui vous sont confiées." : "Toutes les tâches de l'équipe, par échéance ou par projet."}
        actions={
          <>
            <Link href="/taches/modeles" className="btn-ghost">Modèles</Link>
            <Link href={withParam("nouvelle=1")} scroll={false} className="btn-gold"><Plus size={16} /> Ajouter</Link>
          </>
        }
      />
      <Flash message={searchParams.ok === "creee" ? "Tâche créée." : searchParams.ok === "statut" ? "Tâche mise à jour." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "titre" ? "Le titre de la tâche est obligatoire." : ""} clear={["e"]} />

      {searchParams.nouvelle && (
        <Modal closeHref={here} labelledBy="task-edit-title" width="max-w-2xl">
          <TaskWizard
            mode="create"
            action={createTask}
            back={withParam("ok=creee")}
            closeHref={here}
            priorities={PRIORITY}
            projects={projects}
            types={types}
            people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, color: p.color || "#2C3E50", jobTitle: p.jobTitle }))}
            canAssign={user.role === "admin"}
            me={{ id: user.id, name: user.name, color: people.find((p) => p.id === user.id)?.color || "#2C3E50", jobTitle: null }}
            task={{
              title: "", description: "", typeId: null, priority: "normale",
              projectId: projectId || null, externalUrl: "",
              startDate: "", startTime: "", dueDate: "", dueTime: "",
              assignees: user.role === "admin" ? [] : [user.id],
              subtasks: [],
            }}
          />
        </Modal>
      )}

      {/* Vues rapides */}
      <nav aria-label="Vues" className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {visibleViews.map((v) => {
          const n = counts?.[v.key] ?? 0;
          const active = v.key === view;
          const alert = (v.key === "retard" || v.key === "bloquees") && n > 0;
          return (
            <Link
              key={v.key}
              href={link({ vue: v.key === "a_faire" ? null : v.key, page: null, groupe: null })}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-navy text-white" : "text-navy-600 hover:bg-white hover:text-navy"}`}
            >
              {v.label}
              <span className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${active ? "bg-white/20 text-white" : alert ? "bg-red-100 text-red-700" : "bg-navy-100/70 text-navy-600"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <div className="card mb-4 p-3">
        <TaskFilters
          projects={projects}
          people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          showPerson={!own}
          priorities={PRIORITY}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-3">
          <p className="text-sm text-navy-600">
            <b className="text-navy">{total}</b> tâche{total > 1 ? "s" : ""}
            {filtered && <> · <Link href={link({ q: null, projet: null, personne: null, priorite: null, page: null })} className="font-semibold text-navy underline-offset-2 hover:underline">effacer les filtres</Link></>}
          </p>
          <div className="flex items-center gap-1 rounded-lg bg-navy-50 p-0.5" role="group" aria-label="Regrouper">
            {([["echeance", "Échéance", CalendarClock], ["projet", "Projet", Layers], ["liste", "Liste", ListTodo]] as const).map(([k, label, Icon]) => (
              <Link key={k} href={link({ groupe: k, page: null })} aria-pressed={group === k}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${group === k ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/70 hover:text-navy"}`}>
                <Icon size={13} /> {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={22} /></span>
          <p className="font-bold text-navy">{filtered ? "Aucune tâche ne correspond à ces filtres" : view === "retard" ? "Aucune tâche en retard" : view === "revue" ? "Rien à valider" : view === "bloquees" ? "Aucune tâche bloquée" : "Aucune tâche ici"}</p>
          <p className="text-sm text-navy-600/70">{filtered ? "Essayez une autre recherche ou effacez les filtres." : "Changez de vue ou ajoutez une tâche."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <section key={`${g.key}-${gi}`} className="card overflow-hidden">
              {g.label && (
                <header className="flex items-center justify-between gap-3 border-b border-navy-100 bg-navy-50/50 px-4 py-2.5">
                  <span className="min-w-0">
                    {g.href
                      ? <Link href={g.href} className={`font-bold ${g.tone} hover:underline`} title="Afficher seulement ce projet">{g.label}</Link>
                      : <span className={`font-bold ${g.tone}`}>{g.label}</span>}
                    {g.sub && <span className="ml-2 text-xs text-navy-600/60">{g.sub}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-navy-600/60">
                    {(() => {
                      const n = groupTotals.get(g.key) ?? g.items.length;
                      return n > g.items.length ? `${g.items.length} affichées sur ${n}` : `${n} tâche${n > 1 ? "s" : ""}`;
                    })()}
                  </span>
                </header>
              )}
              <ul className="divide-y divide-navy-100">
                {g.items.map((t) => (
                  <TaskRow key={t.id} t={t} day={day} here={here} canFinish={editor || t.mine} showProject={group !== "projet" && !projectId} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-navy-600/80">{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, total)} sur {total}</span>
          <span className="flex items-center gap-1">
            {current > 1
              ? <Link href={link({ page: current - 1 > 1 ? String(current - 1) : null })} className="btn-ghost btn-sm"><ChevronLeft size={15} /> Précédent</Link>
              : <span className="btn-ghost btn-sm pointer-events-none opacity-40"><ChevronLeft size={15} /> Précédent</span>}
            <span className="px-2 font-semibold text-navy">Page {current} / {pages}</span>
            {current < pages
              ? <Link href={link({ page: String(current + 1) })} className="btn-ghost btn-sm">Suivant <ChevronRight size={15} /></Link>
              : <span className="btn-ghost btn-sm pointer-events-none opacity-40">Suivant <ChevronRight size={15} /></span>}
          </span>
        </nav>
      )}
    </div>
  );
}

function TaskRow({ t, day, here, canFinish, showProject }: { t: Row; day: string; here: string; canFinish: boolean; showProject: boolean }) {
  const done = t.status === "termine";
  const cancelled = t.status === "annule";
  const due = dueLabel(t.due_date, t.due_time, day, done || cancelled);
  const people = t.assignees ?? [];
  const href = `/taches/${t.id}?back=${encodeURIComponent(here)}`;
  const statusBadge = t.status === "en_cours" ? "badge-blue" : t.status === "en_revue" ? "badge-gold" : t.status === "bloque" ? "badge-red" : null;
  return (
    <li className={`group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-navy-50/50 ${done || cancelled ? "opacity-70" : ""}`}>
      {/* Terminer en un clic */}
      {canFinish && !done && !cancelled ? (
        <form action={setStatus.bind(null, t.id)} className="relative z-10 shrink-0">
          <input type="hidden" name="status" value="termine" />
          <input type="hidden" name="back" value={`${here}${here.includes("?") ? "&" : "?"}ok=statut`} />
          <button className="grid h-6 w-6 place-items-center rounded-full border-2 border-navy-200 text-transparent transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600" title="Marquer comme terminée" aria-label={`Terminer « ${t.title} »`}>
            <Check size={13} strokeWidth={3} />
          </button>
        </form>
      ) : (
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-500 text-white" : "border-2 border-dashed border-navy-200"}`} aria-hidden>
          {done && <Check size={13} strokeWidth={3} />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <Link href={href} className={`block truncate font-semibold text-navy after:absolute after:inset-0 after:content-[""] group-hover:underline ${done || cancelled ? "line-through decoration-navy-300" : ""}`}>{t.title}</Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-navy-600/70">
          {showProject && (t.project_title
            ? <span className="max-w-[260px] truncate">{t.project_title}{t.client_name ? ` · ${t.client_name}` : ""}</span>
            : <span className="italic">Sans projet</span>)}
          <span className={`sm:hidden ${due.tone}`}>{due.text}</span>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 md:flex">
        {(t.priority === "urgente" || t.priority === "haute") && !done && (
          <span className={`inline-flex items-center gap-1 text-xs font-bold ${t.priority === "urgente" ? "text-red-700" : "text-amber-700"}`} title={`Priorité ${PRIORITY[t.priority]}`}>
            <Flag size={13} /> {PRIORITY[t.priority]}
          </span>
        )}
        {statusBadge && <span className={statusBadge}>{t.status === "bloque" && <AlertTriangle size={11} />}{TASK_STATUS[t.status]}</span>}
      </div>

      <span className="hidden w-14 shrink-0 justify-end sm:flex" title={people.map((p) => p.name).join(", ") || "Non assignée"}>
        {people.length === 0
          ? <span className="text-xs text-navy-600/45">—</span>
          : <span className="flex -space-x-2">
              {people.slice(0, 3).map((p) => <Avatar key={p.id} name={p.name} color={p.color} size={26} />)}
              {people.length > 3 && <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-navy-100 text-[10px] font-bold text-navy ring-2 ring-white">+{people.length - 3}</span>}
            </span>}
      </span>

      <span className={`hidden w-36 shrink-0 text-right text-sm sm:block ${due.tone}`}>{due.text}</span>
    </li>
  );
}
