import Link from "next/link";
import { sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Hourglass, ListTodo, Network, TrendingUp, UsersRound } from "lucide-react";
import { db } from "@/db";
import { requirePerm } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { today as todayIso } from "@/lib/format";
import { Avatar, Empty, PageHeader, ProjectBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

type Person = { id: number; name: string; color: string; jobTitle?: string | null };
type Task = { id: number; projectId: number; title: string; status: string; due: string | null; createdAt: string; assignees: Person[] };

const PALETTE = ["#F5A623", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444", "#0EA5E9", "#F97316", "#14B8A6"];
const DAY = 86400000;
const toMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const addDays = (iso: string, n: number) => new Date(toMs(iso) + n * DAY).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
const short = (iso: string) => new Date(toMs(iso)).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

/** Simulation : au rythme observé (tâches terminées / jours écoulés), quand le projet sera-t-il fini ? */
function simulate(p: { start: string; deadline: string | null }, total: number, done: number, today: string) {
  const open = total - done;
  const elapsed = Math.max(1, diff(p.start, today));
  if (total === 0) return { kind: "vide" as const, open, elapsed };
  if (open === 0) return { kind: "fini" as const, open, elapsed };
  if (done === 0) return { kind: "inconnu" as const, open, elapsed };
  const perDay = done / elapsed;
  const daysLeft = Math.ceil(open / perDay);
  const forecast = addDays(today, daysLeft);
  const slack = p.deadline ? diff(forecast, p.deadline) : null;
  return { kind: "estime" as const, open, elapsed, perWeek: perDay * 7, daysLeft, forecast, slack };
}

export default async function SchemaPage({ searchParams }: { searchParams: { inclure?: string } }) {
  await requirePerm("suivi_equipe");
  const withProspects = searchParams.inclure === "prospects";
  const today = todayIso();
  const settings = await getSettings();
  const statuses = withProspects ? ["prospect", "confirme", "en_cours"] : ["confirme", "en_cours"];

  const projects = (await db.execute(sql`
    SELECT p.id, p.title, p.status, p.priority, p.start_date::text AS start_date, p.end_date::text AS end_date,
           p.created_at::date::text AS created, c.name AS client,
           u.id AS owner_id, u.name AS owner_name, u.color AS owner_color, u.job_title AS owner_job
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN users u ON u.id = p.owner_id
    WHERE p.status IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})
    ORDER BY p.end_date NULLS LAST, p.title`)).rows as {
      id: number; title: string; status: string; priority: string; start_date: string | null; end_date: string | null; created: string;
      client: string | null; owner_id: number | null; owner_name: string | null; owner_color: string | null; owner_job: string | null;
    }[];
  const ids = projects.map((p) => p.id);

  const tasks: Task[] = ids.length ? ((await db.execute(sql`
    SELECT t.id, t.project_id, t.title, t.status, t.due_date::text AS due, t.created_at::date::text AS created,
           COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'color', u.color, 'jobTitle', u.job_title) ORDER BY u.name)
             FILTER (WHERE u.id IS NOT NULL), '[]') AS assignees
    FROM tasks t
    LEFT JOIN task_assignees a ON a.task_id = t.id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) AND t.status <> 'annule'
    GROUP BY t.id`)).rows as { id: number; project_id: number; title: string; status: string; due: string | null; created: string; assignees: Person[] }[])
    .map((t) => ({ id: t.id, projectId: t.project_id, title: t.title, status: t.status, due: t.due, createdAt: t.created, assignees: t.assignees.map((a) => ({ ...a, color: a.color || "#2C3E50" })) }))
    : [];

  const members = ids.length ? (await db.execute(sql`
    SELECT pm.project_id, u.id, u.name, u.color, u.job_title
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`)).rows as { project_id: number; id: number; name: string; color: string | null; job_title: string | null }[]
    : [];

  const time = ids.length ? (await db.execute(sql`
    SELECT t.project_id, COALESCE(SUM(e.minutes), 0)::int AS minutes
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id
    WHERE t.project_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    GROUP BY t.project_id`)).rows as { project_id: number; minutes: number }[]
    : [];

  // Assemble chaque branche : projet → tâches → équipe, avec la simulation de fin.
  const branches = projects.map((p, index) => {
    const mine = tasks.filter((t) => t.projectId === p.id);
    const done = mine.filter((t) => t.status === "termine").length;
    const open = mine.filter((t) => t.status !== "termine").sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
    const late = open.filter((t) => t.due && t.due < today).length;
    const firstTask = mine.map((t) => t.createdAt).sort()[0];
    const start = p.start_date ?? firstTask ?? p.created;
    const lastDue = mine.map((t) => t.due).filter((d): d is string => !!d).sort().at(-1) ?? null;
    const deadline = p.end_date ?? lastDue;
    const team = new Map<number, Person & { open: number; owner: boolean }>();
    const add = (person: Person, owner = false) => {
      const cur = team.get(person.id);
      team.set(person.id, { ...person, color: person.color || "#2C3E50", open: cur?.open ?? 0, owner: owner || !!cur?.owner });
    };
    if (p.owner_id) add({ id: p.owner_id, name: p.owner_name!, color: p.owner_color || "#2C3E50", jobTitle: p.owner_job }, true);
    members.filter((m) => m.project_id === p.id).forEach((m) => add({ id: m.id, name: m.name, color: m.color || "#2C3E50", jobTitle: m.job_title }));
    open.forEach((t) => t.assignees.forEach((a) => { add(a); team.get(a.id)!.open += 1; }));
    return {
      ...p,
      color: PALETTE[index % PALETTE.length],
      start,
      deadline,
      total: mine.length,
      done,
      open,
      late,
      minutes: time.find((x) => x.project_id === p.id)?.minutes ?? 0,
      team: [...team.values()].sort((a, b) => Number(b.owner) - Number(a.owner) || b.open - a.open),
      sim: simulate({ start, deadline }, mine.length, done, today),
    };
  });

  // Charge de l'équipe, tous projets confondus.
  const people = new Map<number, Person & { open: number; late: number; projects: { id: number; title: string; color: string; open: number }[] }>();
  for (const b of branches) {
    for (const m of b.team) {
      const cur = people.get(m.id) ?? { id: m.id, name: m.name, color: m.color, jobTitle: m.jobTitle, open: 0, late: 0, projects: [] };
      cur.open += m.open;
      cur.late += b.open.filter((t) => t.due && t.due < today && t.assignees.some((a) => a.id === m.id)).length;
      cur.projects.push({ id: b.id, title: b.title, color: b.color, open: m.open });
      people.set(m.id, cur);
    }
  }
  const load = [...people.values()].sort((a, b) => b.open - a.open);
  const maxLoad = Math.max(1, ...load.map((p) => p.open));
  const totals = {
    projects: branches.length,
    open: branches.reduce((s, b) => s + b.open.length, 0),
    late: branches.reduce((s, b) => s + b.late, 0),
    atRisk: branches.filter((b) => b.sim.kind === "estime" && b.sim.slack !== null && b.sim.slack < 0).length,
    people: load.length,
  };

  return (
    <>
      <PageHeader
        title="Schéma des projets"
        subtitle="De l'entreprise à l'équipe : qui travaille sur quoi, et quand ça se termine."
        actions={
          <nav className="flex gap-1 rounded-xl bg-navy-50/80 p-1 ring-1 ring-navy-100/70" aria-label="Projets affichés">
            {[["", "En cours"], ["prospects", "Avec les prospects"]].map(([k, label]) => {
              const active = (k === "prospects") === withProspects;
              return (
                <Link key={label} href={k ? `/schema?inclure=${k}` : "/schema"} aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3.5 py-2 text-sm font-bold transition ${active ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/75 hover:text-navy"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
        }
      />

      {/* Niveau 1 : l'entreprise */}
      <section className="relative">
        <div className="card relative z-[1] flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-navy text-white"><Network size={26} /></span>
          <div className="min-w-0 flex-1">
            <p className="h-section">Entreprise</p>
            <h2 className="text-xl font-bold text-navy">{settings.companyName}</h2>
          </div>
          <div className="grid w-full grid-cols-4 gap-2 sm:w-auto sm:gap-4">
            {[
              [totals.projects, "projets"],
              [totals.open, "tâches ouvertes"],
              [totals.people, "personnes"],
              [totals.atRisk, "en risque"],
            ].map(([v, l]) => (
              <div key={String(l)} className="text-center">
                <p className={`text-2xl font-bold tabular-nums ${l === "en risque" && Number(v) > 0 ? "text-red-700" : "text-navy"}`}>{v}</p>
                <p className="text-[11px] font-semibold text-navy-600/70">{l}</p>
              </div>
            ))}
          </div>
        </div>
        {branches.length > 0 && <div aria-hidden className="ml-2 h-8 w-0.5 bg-navy-200 sm:ml-4" />}
      </section>

      {branches.length === 0 ? (
        <div className="card mt-6"><Empty title="Aucun projet en cours">Passez un projet en « Confirmé » ou « En cours » pour le voir ici.</Empty></div>
      ) : (
        <>
          {/* Niveau 2 à 4 : projet → tâches → équipe */}
          <div className="mb-2 hidden grid-cols-[minmax(0,1.15fr)_minmax(0,1.2fr)_minmax(0,0.85fr)] gap-10 pl-10 xl:grid">
            <p className="h-section">Projet & délai</p>
            <p className="h-section">Tâches en cours</p>
            <p className="h-section">Équipe</p>
          </div>
          <ol className="relative space-y-5 pl-6 sm:pl-10">
            <span aria-hidden className="absolute bottom-10 left-2 top-0 w-0.5 bg-navy-200 sm:left-4" />
            {branches.map((b) => (
              <li key={b.id} className="relative">
                <span aria-hidden className="absolute -left-4 top-10 h-0.5 w-4 bg-navy-200 sm:-left-6 sm:w-6" />
                <span aria-hidden className="absolute -left-[22px] top-[34px] h-3 w-3 rounded-full ring-4 ring-[#f5f6f8] sm:-left-[30px]" style={{ background: b.color }} />
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_auto_minmax(0,1.2fr)_auto_minmax(0,0.85fr)] xl:items-stretch xl:gap-2">
                  <ProjectCard b={b} today={today} />
                  <Arrow />
                  <TasksCard b={b} today={today} />
                  <Arrow />
                  <TeamCard b={b} />
                </div>
              </li>
            ))}
          </ol>

          {/* Charge de l'équipe */}
          <section className="card mt-10">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-4 sm:px-6">
              <h2 className="flex items-center gap-2 font-bold text-navy"><UsersRound size={18} className="text-gold-600" /> Charge de l'équipe</h2>
              <p className="text-sm text-navy-600/70">Tâches ouvertes sur les projets affichés</p>
            </div>
            {load.length === 0 ? <p className="px-5 py-6 text-sm text-navy-600/70 sm:px-6">Personne n'est encore affecté.</p> : (
              <ul className="divide-y divide-navy-100">
                {load.map((p) => (
                  <li key={p.id} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:px-6">
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={p.name} color={p.color} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-navy">{p.name}</span>
                        <span className="block truncate text-xs text-navy-600/70">{p.jobTitle || "—"}</span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                        <span className={`block h-full rounded-full ${p.open >= 6 ? "bg-red-400" : p.open >= 3 ? "bg-gold" : "bg-emerald-500"}`} style={{ width: `${(p.open / maxLoad) * 100}%` }} />
                      </span>
                      <span className="w-24 text-right text-sm tabular-nums">
                        <b className="text-navy">{p.open}</b> tâche{p.open > 1 ? "s" : ""}
                        {p.late > 0 && <span className="block text-xs font-bold text-red-700">{p.late} en retard</span>}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {p.projects.map((pr) => (
                        <Link key={pr.id} href={`/projets/${pr.id}`} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-navy-100 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 hover:border-gold/60">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: pr.color }} />
                          <span className="truncate">{pr.title}</span>
                          {pr.open > 0 && <span className="text-navy-600/60">· {pr.open}</span>}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

type Branch = {
  id: number; title: string; status: string; client: string | null; color: string; start: string; deadline: string | null;
  total: number; done: number; open: Task[]; late: number; minutes: number;
  team: (Person & { open: number; owner: boolean })[];
  sim: ReturnType<typeof simulate>;
};

function Arrow() {
  return (
    <span aria-hidden className="hidden items-center text-navy-200 xl:flex">
      <span className="h-0.5 w-3 bg-navy-200" />
      <ArrowRight size={16} className="-ml-1" />
    </span>
  );
}

function ProjectCard({ b, today }: { b: Branch; today: string }) {
  const pct = b.total ? Math.round((b.done / b.total) * 100) : 0;
  const s = b.sim;
  // Frise : du début à la plus tardive des dates (échéance, fin estimée, aujourd'hui).
  const ends = [b.deadline, s.kind === "estime" ? s.forecast : null, today].filter((d): d is string => !!d).sort();
  const span = Math.max(1, diff(b.start, ends.at(-1)!));
  const at = (iso: string) => `${Math.min(100, Math.max(0, (diff(b.start, iso) / span) * 100))}%`;
  const verdict =
    s.kind === "fini" ? { tone: "bg-emerald-50 text-emerald-800", icon: <CheckCircle2 size={15} />, text: "Toutes les tâches sont terminées" }
    : s.kind === "vide" ? { tone: "bg-navy-50 text-navy-700", icon: <ListTodo size={15} />, text: "Aucune tâche : ajoutez-en pour estimer la durée" }
    : s.kind === "inconnu" ? { tone: "bg-navy-50 text-navy-700", icon: <Hourglass size={15} />, text: `${s.open} tâche(s) à faire · estimation dès la 1re tâche terminée` }
    : s.slack === null ? { tone: "bg-sky-50 text-sky-800", icon: <TrendingUp size={15} />, text: `Au rythme actuel : fin le ${short(s.forecast)} (pas d'échéance fixée)` }
    : s.slack >= 0 ? { tone: "bg-emerald-50 text-emerald-800", icon: <CheckCircle2 size={15} />, text: `Au rythme actuel : fin le ${short(s.forecast)} · dans les temps, marge de ${s.slack} j` }
    : { tone: "bg-red-50 text-red-800", icon: <AlertTriangle size={15} />, text: `Au rythme actuel : fin le ${short(s.forecast)} · retard de ${-s.slack} j sur l'échéance` };

  return (
    <article className="card flex flex-col p-4" style={{ borderLeft: `4px solid ${b.color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/projets/${b.id}`} className="block truncate font-bold text-navy hover:text-gold-600">{b.title}</Link>
          <p className="truncate text-xs text-navy-600/70">{b.client ?? "Projet interne"}</p>
        </div>
        <ProjectBadge s={b.status} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-navy-600">
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50"><span className="block h-full rounded-full bg-navy" style={{ width: `${pct}%` }} /></span>
        <span className="tabular-nums"><b className="text-navy">{b.done}/{b.total}</b> tâches · {pct} %</span>
      </div>

      {/* Frise du temps */}
      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-navy-50">
          {b.deadline && <span className="absolute inset-y-0 left-0 rounded-full bg-navy-100" style={{ width: at(b.deadline) }} />}
          <span className="absolute -top-1 h-4 w-0.5 rounded bg-gold" style={{ left: at(today) }} title="Aujourd'hui" />
          {s.kind === "estime" && (
            <span className={`absolute -top-1 h-4 w-1.5 -translate-x-1/2 rounded ${s.slack !== null && s.slack < 0 ? "bg-red-500" : "bg-emerald-500"}`} style={{ left: at(s.forecast) }} title="Fin estimée" />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-navy-600/70">
          <span>Début {short(b.start)}</span>
          <span>{b.deadline ? `Échéance ${short(b.deadline)}` : "Pas d'échéance"}</span>
        </div>
      </div>

      <p className={`mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${verdict.tone}`}>
        <span className="mt-px shrink-0">{verdict.icon}</span>{verdict.text}
      </p>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-navy-600">
        {s.kind === "estime" && <><dt className="flex items-center gap-1"><CalendarClock size={13} /> Reste</dt><dd className="text-right font-semibold text-navy">≈ {s.daysLeft} j ({s.perWeek.toFixed(1).replace(".", ",")} tâches/sem.)</dd></>}
        <dt className="flex items-center gap-1"><Clock size={13} /> Temps passé</dt><dd className="text-right font-semibold text-navy">{b.minutes ? hours(b.minutes) : "—"}</dd>
        {b.deadline && <><dt className="flex items-center gap-1"><Hourglass size={13} /> Jusqu'à l'échéance</dt><dd className={`text-right font-semibold ${diff(today, b.deadline) < 0 ? "text-red-700" : "text-navy"}`}>{diff(today, b.deadline) >= 0 ? `${diff(today, b.deadline)} j` : `dépassée de ${-diff(today, b.deadline)} j`}</dd></>}
      </dl>
    </article>
  );
}

function TasksCard({ b, today }: { b: Branch; today: string }) {
  const shown = b.open.slice(0, 5);
  return (
    <section className="card flex flex-col p-4">
      <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-navy-600/65 xl:hidden"><span>Tâches en cours</span></p>
      {b.open.length === 0 ? <p className="my-auto text-sm text-navy-600/70">{b.total ? "Toutes les tâches sont terminées." : "Aucune tâche sur ce projet."}</p> : (
        <ul className="space-y-1.5">
          {shown.map((t) => {
            const late = !!t.due && t.due < today;
            return (
              <li key={t.id}>
                <Link href={`/taches/${t.id}`} className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm transition hover:border-gold/60 ${late ? "border-red-200 bg-red-50/60" : "border-navy-100"}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === "en_cours" ? "bg-sky-500" : t.status === "en_revue" ? "bg-gold" : t.status === "bloque" ? "bg-red-500" : "bg-navy-200"}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-navy">{t.title}</span>
                  {t.due && <span className={`shrink-0 text-xs tabular-nums ${late ? "font-bold text-red-700" : "text-navy-600/70"}`}>{short(t.due)}</span>}
                  <span className="flex shrink-0 -space-x-1.5">
                    {t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} color={a.color} size={20} />)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {b.open.length > shown.length && <Link href={`/projets/${b.id}`} className="link mt-2 text-xs">+ {b.open.length - shown.length} autre(s) tâche(s)</Link>}
      {b.late > 0 && <p className="mt-2 text-xs font-bold text-red-700">{b.late} tâche(s) en retard</p>}
    </section>
  );
}

function TeamCard({ b }: { b: Branch }) {
  return (
    <section className="card flex flex-col p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-600/65 xl:hidden">Équipe</p>
      {b.team.length === 0 ? <p className="my-auto text-sm text-navy-600/70">Personne n'est affecté.</p> : (
        <ul className="space-y-2">
          {b.team.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5">
              <Avatar name={m.name} color={m.color} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-navy">{m.name}{m.owner && <span className="ml-1.5 rounded bg-gold-100 px-1 py-px text-[10px] font-bold uppercase text-amber-800">Resp.</span>}</span>
                <span className="block truncate text-[11px] text-navy-600/65">{m.jobTitle || "—"}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-navy-600">{m.open ? <><b className="text-navy">{m.open}</b> tâche{m.open > 1 ? "s" : ""}</> : "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

