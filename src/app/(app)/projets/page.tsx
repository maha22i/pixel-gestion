import Link from "next/link";
import { sql } from "drizzle-orm";
import { CalendarClock, Columns3, FolderKanban, LayoutList, Plus, Search, TriangleAlert, Wallet, CircleCheck } from "lucide-react";
import { db } from "@/db";
import { requirePerm, can, canFinance } from "@/lib/auth";
import { PROJECT_STATUS, PROJECT_TYPES, fdj, today, addDays } from "@/lib/format";
import { PageHeader, ProjectBadge, Empty, Stat, Avatar } from "@/components/ui";
import { AutoFilter, FilterPending } from "./AutoFilter";
import { CLOSED, Due, PriorityFlag, TaskProgress, isLate } from "./bits";

type SP = { q?: string; type?: string; status?: string; nature?: string; late?: string; vue?: string; tri?: string };

type Row = {
  id: number; title: string; type: string; nature: string; status: string; priority: string;
  client_name: string | null; owner_name: string | null; owner_color: string | null;
  start_iso: string | null; end_iso: string | null; created_iso: string;
  task_total: number; task_done: number; task_late: number;
  invoiced: number; paid: number; events: string | null;
};

const BOARD = ["prospect", "confirme", "en_cours", "livre", "publie", "cloture", "annule"];
const BOARD_ALWAYS = ["prospect", "confirme", "en_cours", "livre"];

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePerm("projets");
  const finance = canFinance(user);
  const write = can(user, "projets", "write");
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const type = searchParams.type && searchParams.type in PROJECT_TYPES ? searchParams.type : "";
  const status = searchParams.status && searchParams.status in PROJECT_STATUS ? searchParams.status : "";
  const nature = searchParams.nature === "client" || searchParams.nature === "interne" ? searchParams.nature : "";
  const late = searchParams.late === "1";
  const board = searchParams.vue === "statut";
  const sort = searchParams.tri === "echeance" || searchParams.tri === "titre" ? searchParams.tri : "";
  const day = today();
  const soon = addDays(day, 14);

  // Tous les projets visibles par l'utilisateur (même règle qu'avant : admin, responsable ou membre).
  const res = await db.execute(sql`
    SELECT p.id, p.title, p.type, p.nature, p.status, p.priority,
      p.start_date::text AS start_iso, p.end_date::text AS end_iso, p.created_at::date::text AS created_iso,
      c.name AS client_name, u.name AS owner_name, u.color AS owner_color,
      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'annule'), 0)::int AS task_total,
      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'termine'), 0)::int AS task_done,
      COALESCE((SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status NOT IN ('termine','annule') AND t.due_date < ${day}::date), 0)::int AS task_late,
      COALESCE((SELECT SUM(total) FROM invoices i WHERE i.project_id = p.id AND i.status <> 'annulee'), 0)::int AS invoiced,
      COALESCE((SELECT SUM(pa.amount) FROM payments pa JOIN invoices i ON i.id = pa.invoice_id WHERE i.project_id = p.id AND i.status <> 'annulee'), 0)::int AS paid,
      (SELECT string_agg(et.name, ', ' ORDER BY et.position) FROM project_event_types pet JOIN event_types et ON et.id = pet.event_type_id WHERE pet.project_id = p.id) AS events
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN users u ON u.id = p.owner_id
    WHERE (${user.role} = 'admin' OR p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${user.id}))
    ORDER BY COALESCE(p.start_date, p.created_at::date) DESC, p.id DESC`);
  const visible = (res.rows as Row[]).map((r) => ({ ...r, late: isLate(r.status, r.end_iso, day) }));

  // Portée = onglet de type ; les indicateurs et compteurs portent sur cette portée.
  const scope = visible.filter((p) => !type || p.type === type);
  const rows = scope.filter((p) =>
    (!status || board || p.status === status) &&
    (!nature || p.nature === nature) &&
    (!late || p.late) &&
    (!q || p.title.toLowerCase().includes(q) || (p.client_name ?? "").toLowerCase().includes(q) || (p.events ?? "").toLowerCase().includes(q))
  );
  if (sort === "echeance") rows.sort((a, b) => (a.end_iso ?? "9999").localeCompare(b.end_iso ?? "9999"));
  if (sort === "titre") rows.sort((a, b) => a.title.localeCompare(b.title, "fr"));

  const active = scope.filter((p) => p.status === "confirme" || p.status === "en_cours");
  const prospects = scope.filter((p) => p.status === "prospect").length;
  const lateList = scope.filter((p) => p.late);
  const lateTasks = scope.filter((p) => !CLOSED.includes(p.status)).reduce((s, p) => s + p.task_late, 0);
  const dueSoon = scope.filter((p) => !CLOSED.includes(p.status) && p.end_iso && p.end_iso >= day && p.end_iso <= soon).length;
  const clientRows = scope.filter((p) => p.nature !== "interne");
  const invoiced = clientRows.reduce((s, p) => s + p.invoiced, 0);
  const paid = clientRows.reduce((s, p) => s + p.paid, 0);
  const delivered = scope.filter((p) => ["livre", "publie", "cloture"].includes(p.status)).length;

  const statusCount = (s: string) => scope.filter((p) => p.status === s).length;
  const typeCount = (t: string) => visible.filter((p) => p.type === t).length;
  const filtered = Boolean(q || status || nature || late);

  const link = (patch: Partial<SP>) => {
    const sp = new URLSearchParams();
    const merged: SP = { q: searchParams.q, type, status, nature, late: late ? "1" : "", vue: board ? "statut" : "", tri: sort, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/projets?${s}` : "/projets";
  };

  return (
    <>
      <PageHeader
        title="Projets"
        subtitle={`${visible.length} projet${visible.length > 1 ? "s" : ""}${user.role === "admin" ? "" : " dont vous faites partie"}`}
        actions={write && <Link href={type ? `/projets/nouveau?type=${type}` : "/projets/nouveau"} className="btn-primary"><Plus size={16} aria-hidden /> Nouveau projet</Link>}
      />

      {visible.length === 0 ? (
        <div className="card">
          <Empty title={user.role === "admin" ? "Aucun projet pour l'instant" : "Vous n'êtes affecté à aucun projet"}>
            {user.role === "admin"
              ? "Créez un projet pour suivre ses tâches, son équipe, ses devis et ses factures au même endroit."
              : "Les projets apparaissent ici dès qu'un responsable vous y ajoute."}
            {write && <div className="mt-5"><Link href="/projets/nouveau" className="btn-primary"><Plus size={16} aria-hidden /> Créer un projet</Link></div>}
          </Empty>
        </div>
      ) : (
        <>
          <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-navy-100" aria-label="Types de projet">
            {[["", "Tous", visible.length] as const, ...Object.entries(PROJECT_TYPES).map(([k, v]) => [k, v, typeCount(k)] as const).filter(([k, , n]) => n > 0 || k === type)].map(([k, v, n]) => {
              const on = type === k;
              return (
                <Link key={k || "all"} href={link({ type: k, status: "" })} aria-current={on ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-[14px] font-bold transition sm:px-4 ${on ? "border-gold text-navy" : "border-transparent text-navy-600/60 hover:text-navy"}`}>
                  {v}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${on ? "bg-gold-100 text-amber-900" : "bg-navy-50 text-navy-600/70"}`}>{n}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <Stat label="Projets actifs" value={active.length} hint={`${statusCount("en_cours")} en cours · ${statusCount("confirme")} confirmé${statusCount("confirme") > 1 ? "s" : ""} · ${prospects} prospect${prospects > 1 ? "s" : ""}`} icon={<FolderKanban size={18} />} tone="blue" />
            <Link href={link({ late: lateList.length ? "1" : "", status: "" })} className="block rounded-2xl transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <Stat label="En retard" value={lateList.length} hint={lateTasks ? `${lateTasks} tâche${lateTasks > 1 ? "s" : ""} en retard au total` : "Aucune tâche en retard"} icon={<TriangleAlert size={18} />} tone={lateList.length || lateTasks ? "red" : "green"} />
            </Link>
            {finance ? (
              <>
                <Stat label="Facturé" value={fdj(invoiced)} hint={`Encaissé : ${fdj(paid)}`} icon={<Wallet size={18} />} tone="navy" />
                <Stat label="Reste dû" value={fdj(invoiced - paid)} hint={invoiced ? `${Math.round((paid / invoiced) * 100)} % encaissé` : "Rien de facturé"} icon={<Wallet size={18} />} tone={invoiced - paid > 0 ? "gold" : "green"} />
              </>
            ) : (
              <>
                <Stat label="Échéance ≤ 14 jours" value={dueSoon} hint="Projets à livrer bientôt" icon={<CalendarClock size={18} />} tone="gold" />
                <Stat label="Livrés" value={delivered} hint="Livrés, publiés ou clôturés" icon={<CircleCheck size={18} />} tone="green" />
              </>
            )}
          </div>

          <AutoFilter className="card mb-4 space-y-3 p-3 sm:p-4">
            {type && <input type="hidden" name="type" value={type} />}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-600/50" aria-hidden />
                <input type="search" name="q" defaultValue={searchParams.q} placeholder="Projet, client, événement…" className="input pl-9" aria-label="Rechercher un projet" />
              </div>
              <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
                <select name="nature" defaultValue={nature} className="input sm:w-auto" aria-label="Nature">
                  <option value="">Client et interne</option>
                  <option value="client">Projets clients</option>
                  <option value="interne">Projets internes</option>
                </select>
                <select name="tri" defaultValue={sort} className="input sm:w-auto" aria-label="Trier">
                  <option value="">Plus récents</option>
                  <option value="echeance">Échéance proche</option>
                  <option value="titre">Titre (A → Z)</option>
                </select>
                <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-[14px] font-bold transition has-[:checked]:border-red-300 has-[:checked]:bg-red-50 has-[:checked]:text-red-700 ${lateList.length ? "border-navy-200 text-navy-700" : "border-navy-100 text-navy-600/60"}`}>
                  <input type="checkbox" name="late" value="1" defaultChecked={late} className="h-4 w-4 accent-red-600" />
                  En retard{lateList.length > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[11px] text-red-700">{lateList.length}</span>}
                </label>
                <fieldset className="grid grid-cols-2 rounded-xl border border-navy-200 bg-navy-50/60 p-1 sm:inline-flex" aria-label="Affichage">
                  {([["", "Liste", LayoutList], ["statut", "Par statut", Columns3]] as const).map(([k, v, Icon]) => (
                    <label key={k} className="cursor-pointer" title={v}>
                      <input type="radio" name="vue" value={k} defaultChecked={(board ? "statut" : "") === k} className="peer sr-only" />
                      <span className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-bold text-navy-600/75 transition peer-checked:bg-white peer-checked:text-navy peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
                        <Icon size={15} aria-hidden className="shrink-0" /> {v}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </div>
            </div>
            {!board && (
              <fieldset className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="Statut">
                {[["", "Tous", scope.length] as const, ...Object.entries(PROJECT_STATUS).map(([k, v]) => [k, v, statusCount(k)] as const).filter(([k, , n]) => n > 0 || k === status)].map(([k, v, n]) => (
                  <label key={k || "all"} className="shrink-0 cursor-pointer">
                    <input type="radio" name="status" value={k} defaultChecked={status === k} className="peer sr-only" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-100 bg-white px-3 py-1 text-[13px] font-bold text-navy-600/80 transition hover:border-navy-200 peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
                      {v} <span className="tabular-nums opacity-70">{n}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex min-h-[1rem] items-center justify-between gap-2 text-sm text-navy-600/75">
              <span><b className="text-navy">{rows.length}</b> projet{rows.length > 1 ? "s" : ""} affiché{rows.length > 1 ? "s" : ""}{(filtered || type) && ` sur ${visible.length}`}</span>
              <span className="flex items-center gap-3">
                <FilterPending />
                {filtered && <Link href={link({ q: "", status: "", nature: "", late: "" })} className="link">Effacer les filtres</Link>}
              </span>
            </div>
          </AutoFilter>

          {rows.length === 0 ? (
            <div className="card">
              <Empty title="Aucun projet ne correspond">
                {late && !lateList.length ? "Bonne nouvelle : aucun projet n'est en retard. " : "Modifiez la recherche ou les filtres. "}
                <Link href={link({ q: "", status: "", nature: "", late: "" })} className="link">Voir tous les projets</Link>
              </Empty>
            </div>
          ) : board ? (
            <Board rows={rows} day={day} finance={finance} />
          ) : (
            <div className="card overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Projet</th><th>Client</th><th>Responsable</th><th>Échéance</th><th>Avancement</th><th>Statut</th>
                    {finance && <th className="num">Reste dû</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className={`clickable ${p.late ? "task-late" : ""}`}>
                      <td className="min-w-[14rem]">
                        <Link href={`/projets/${p.id}`} className="link row-hit">{p.title}</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={p.type === "mariage" ? "badge-gold" : p.nature === "interne" ? "badge-navy" : "badge-gray"}>{p.nature === "interne" ? "Interne" : PROJECT_TYPES[p.type]}</span>
                          <PriorityFlag priority={p.priority} />
                          {p.events && <span className="text-xs text-navy-600/70">{p.events}</span>}
                        </div>
                      </td>
                      <td className="text-navy-600">{p.nature === "interne" ? <span className="text-navy-600/60">Pixel Nomade</span> : (p.client_name ?? "—")}</td>
                      <td>
                        {p.owner_name ? (
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={p.owner_name} color={p.owner_color} size={26} />
                            <span className="text-sm">{p.owner_name}</span>
                          </span>
                        ) : <span className="text-sm text-navy-600/50">Non attribué</span>}
                      </td>
                      <td><Due endIso={p.end_iso} status={p.status} day={day} /></td>
                      <td><TaskProgress done={p.task_done} total={p.task_total} late={CLOSED.includes(p.status) ? 0 : p.task_late} /></td>
                      <td><ProjectBadge s={p.status} /></td>
                      {finance && (
                        <td className="num">
                          {p.nature === "interne" ? <span className="text-navy-600/50">—</span> : <Money invoiced={p.invoiced} paid={p.paid} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Money({ invoiced, paid }: { invoiced: number; paid: number }) {
  if (!invoiced) return <span className="text-sm text-navy-600/50">Non facturé</span>;
  const due = invoiced - paid;
  return (
    <span className="block">
      {due > 0 ? <span className="font-bold text-red-700">{fdj(due)}</span> : <span className="font-bold text-emerald-700">Soldé</span>}
      <span className="block text-xs text-navy-600/65">sur {fdj(invoiced)} facturés</span>
    </span>
  );
}

function Board({ rows, day, finance }: { rows: (Row & { late: boolean })[]; day: string; finance: boolean }) {
  const cols = BOARD.filter((s) => BOARD_ALWAYS.includes(s) || rows.some((r) => r.status === s));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid auto-cols-[minmax(15.5rem,1fr)] grid-flow-col gap-4">
        {cols.map((s) => {
          const list = rows.filter((r) => r.status === s);
          return (
            <section key={s} className="flex min-h-[10rem] flex-col rounded-2xl border border-navy-100/80 bg-navy-50/50 p-2.5" aria-label={PROJECT_STATUS[s]}>
              <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <ProjectBadge s={s} />
                <span className="text-xs font-bold tabular-nums text-navy-600/60">{list.length}</span>
              </header>
              <div className="space-y-2.5">
                {list.length === 0 && <p className="rounded-xl border border-dashed border-navy-200 px-3 py-6 text-center text-xs text-navy-600/50">Aucun projet</p>}
                {list.map((p) => (
                  <article key={p.id} className={`group relative rounded-xl border bg-white p-3.5 shadow-[0_10px_24px_-20px_rgba(24,34,44,0.6)] transition hover:-translate-y-0.5 hover:border-gold/60 ${p.late ? "border-red-200" : "border-white"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/projets/${p.id}`} className="font-bold leading-snug text-navy after:absolute after:inset-0 after:rounded-xl group-hover:text-navy-800">{p.title}</Link>
                      {p.owner_name && <Avatar name={p.owner_name} color={p.owner_color} size={26} />}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-navy-600/75">{p.nature === "interne" ? "Projet interne" : (p.client_name ?? "—")}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className={p.type === "mariage" ? "badge-gold" : p.nature === "interne" ? "badge-navy" : "badge-gray"}>{p.nature === "interne" ? "Interne" : PROJECT_TYPES[p.type]}</span>
                      <PriorityFlag priority={p.priority} />
                    </div>
                    <div className="mt-3"><Due endIso={p.end_iso} status={p.status} day={day} compact /></div>
                    {p.task_total > 0 && <TaskProgress className="mt-2.5" done={p.task_done} total={p.task_total} late={CLOSED.includes(p.status) ? 0 : p.task_late} />}
                    {finance && p.nature !== "interne" && p.invoiced > 0 && (
                      <p className="mt-2.5 flex items-baseline justify-between border-t border-navy-100/70 pt-2 text-xs text-navy-600/70">
                        <span>Reste dû</span>
                        <span className={`text-sm font-bold tabular-nums ${p.invoiced - p.paid > 0 ? "text-red-700" : "text-emerald-700"}`}>{p.invoiced - p.paid > 0 ? fdj(p.invoiced - p.paid) : "Soldé"}</span>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
