import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { FileCheck2, FolderKanban, Paperclip, Pencil, Plus, Receipt, Trash2, Wallet } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, dateFr, fdj, today } from "@/lib/format";
import { fileFrom, removeProof, storeProof } from "@/lib/proof";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Breakdown, Delta, MonthNav, href, inMonth, monthLabel, parseMonth, shiftMonth } from "./finance-ui";
import { ExpenseForm } from "./ExpenseForm";
import { Modal } from "@/components/Modal";
import { CAT_COLOR } from "./colors";

const PATH = "/depenses";

function values(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const cat = s("category");
  const method = s("method");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : today(),
    category: cat in EXPENSE_CATEGORIES ? cat : "autre",
    description: s("description") || "Dépense",
    supplier: s("supplier") || null,
    amount: Math.max(0, Math.round(Number(s("amount").replace(/\s/g, "")) || 0)),
    method: method in PAYMENT_METHODS ? method : null,
    projectId: Number(s("projectId")) || null,
  };
}

async function saveExpense(fd: FormData) {
  "use server";
  const user = await requirePerm("depenses", "write");
  const id = Number(fd.get("id")) || null;
  const v = values(fd);
  const month = v.date.slice(0, 7);
  const file = fileFrom(fd);
  const saved = file ? await storeProof(file) : null;
  if (saved && !saved.ok) redirect(href(PATH, { m: month, edit: id, nouveau: id ? null : 1, e: saved.code }));
  const current = id ? (await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)))[0] : undefined;
  const drop = !saved && current?.proofStored && fd.get("dropProof") ? { proofFilename: null, proofStored: null, proofMime: null, proofSize: null } : null;
  if (id) await db.update(schema.expenses).set({ ...v, ...(saved?.ok ? saved.proof : drop ?? {}) }).where(eq(schema.expenses.id, id));
  else await db.insert(schema.expenses).values({ ...v, ...(saved?.ok ? saved.proof : {}), createdBy: user.id });
  if (saved?.ok || drop) await removeProof(current?.proofStored);
  revalidatePath(PATH);
  revalidatePath("/");
  if (v.projectId) revalidatePath(`/projets/${v.projectId}`);
  redirect(href(PATH, { m: month, ok: id ? "maj" : "ajout" }));
}

async function removeExpense(id: number, month: string, cat: string) {
  "use server";
  await requirePerm("depenses", "write");
  const [row] = await db.delete(schema.expenses).where(eq(schema.expenses.id, id)).returning({ proofStored: schema.expenses.proofStored, projectId: schema.expenses.projectId });
  await removeProof(row?.proofStored);
  revalidatePath(PATH);
  revalidatePath("/");
  if (row?.projectId) revalidatePath(`/projets/${row.projectId}`);
  redirect(href(PATH, { m: parseMonth(month), cat: cat in EXPENSE_CATEGORIES ? cat : null, ok: "suppr" }));
}

const OK: Record<string, string> = { ajout: "Dépense ajoutée.", maj: "Dépense modifiée.", suppr: "Dépense supprimée.", "1": "Dépense enregistrée." };

type Search = { m?: string; cat?: string; edit?: string; projet?: string; nouveau?: string; ok?: string; e?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Search }) {
  const user = await requirePerm("depenses");
  const write = can(user, "depenses", "write");
  const month = parseMonth(searchParams.m);
  const cat = searchParams.cat && searchParams.cat in EXPENSE_CATEGORIES ? searchParams.cat : "";
  const all = month === "tout";
  const prevMonth = all ? "" : shiftMonth(month, -1);

  const res = await db.execute(sql`
    SELECT e.*, p.title AS project_title FROM expenses e LEFT JOIN projects p ON p.id = e.project_id
    WHERE (${month} = 'tout' OR to_char(e.date, 'YYYY-MM') = ${month})
    ORDER BY e.date DESC, e.id DESC`);
  const periodRows = res.rows as any[];
  const rows = cat ? periodRows.filter((r) => r.category === cat) : periodRows;
  const sum = (list: any[]) => list.reduce((s, r) => s + Number(r.amount), 0);
  const total = sum(rows);
  const onProjects = rows.filter((r) => r.project_id);
  const projectTotal = sum(onProjects);
  const withProof = rows.filter((r) => r.proof_stored).length;

  const prev = all ? null : ((await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::bigint AS total, COUNT(*)::int AS n FROM expenses
    WHERE to_char(date, 'YYYY-MM') = ${prevMonth} AND (${cat} = '' OR category = ${cat})`)).rows[0] as { total: string; n: number });
  const prevTotal = Number(prev?.total ?? 0);

  const slices = Object.entries(EXPENSE_CATEGORIES)
    .map(([k, label]) => {
      const list = periodRows.filter((r) => r.category === k);
      return { key: k, label, amount: sum(list), count: list.length, color: CAT_COLOR[k] ?? "bg-navy-200", href: href(PATH, { m: month, cat: k }) };
    })
    .sort((a, b) => b.amount - a.amount);

  // Formulaire : ouvert par le bouton « Nouvelle dépense », un lien « Modifier », ou depuis la fiche projet (?projet=).
  const editing = write && searchParams.edit ? (await db.select().from(schema.expenses).where(eq(schema.expenses.id, Number(searchParams.edit))))[0] : undefined;
  const formOpen = write && (!!editing || !!searchParams.nouveau || !!searchParams.projet);
  const projects = formOpen ? await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title)) : [];
  const suppliers = formOpen
    ? ((await db.execute(sql`SELECT DISTINCT supplier FROM expenses WHERE supplier IS NOT NULL AND supplier <> '' ORDER BY supplier LIMIT 300`)).rows as { supplier: string }[]).map((r) => r.supplier)
    : [];
  const defaultProject = editing?.projectId ?? (Number(searchParams.projet) || "");

  const keep = { m: month, cat };
  const here = href(PATH, keep);
  const catLabel = cat ? EXPENSE_CATEGORIES[cat] : "";
  const n = rows.length;

  const actions = (r: any) => (
    <div className="flex items-center justify-end gap-1">
      {r.proof_stored ? (
        <a href={`/api/fichiers/depense/${r.id}`} target="_blank" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100" title="Voir le justificatif" aria-label={`Voir le justificatif de « ${r.description} »`}>
          <Paperclip size={15} />
        </a>
      ) : (
        <span className="grid h-8 w-8 place-items-center text-navy-200 max-md:hidden" title="Pas de justificatif">
          <Paperclip size={15} aria-hidden /><span className="sr-only">Pas de justificatif</span>
        </span>
      )}
      {write && (
        <>
          <Link href={href(PATH, { ...keep, edit: r.id })} scroll={false} className="btn-ghost btn-sm w-8 px-0" title="Modifier" aria-label={`Modifier « ${r.description} »`}>
            <Pencil size={14} />
          </Link>
          <form action={removeExpense.bind(null, r.id, month, cat)} title="Supprimer">
            <ConfirmButton message={`Supprimer la dépense « ${r.description} » (${fdj(r.amount)}) ?`} className="btn-danger btn-sm w-8 px-0">
              <Trash2 size={14} aria-hidden /><span className="sr-only">Supprimer « {r.description} »</span>
            </ConfirmButton>
          </form>
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle="Charges de l'agence, rattachables à un projet pour calculer sa marge."
        actions={write ? (
          <Link href={href(PATH, { ...keep, nouveau: 1 })} scroll={false} className="btn-gold"><Plus size={16} aria-hidden /> Nouvelle dépense</Link>
        ) : undefined}
      />
      <Flash message={OK[searchParams.ok ?? ""] ?? ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "taille" ? "Le fichier dépasse 15 Mo." : searchParams.e === "type" ? "Le justificatif doit être un PDF ou une photo." : searchParams.e ? "Le justificatif n'a pas pu être enregistré." : ""} clear={["e"]} />

      {formOpen && (
        <Modal closeHref={here} labelledBy="exp-title" width="max-w-4xl">
          <ExpenseForm
            key={editing?.id ?? "new"}
            action={saveExpense}
            editing={editing}
            projects={projects}
            suppliers={suppliers}
            defaultProject={defaultProject}
            closeHref={here}
          />
        </Modal>
      )}

      <div className="space-y-5">

        <MonthNav path={PATH} month={month} keep={{ cat }} />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat
            label={cat ? `Total · ${catLabel}` : "Total dépensé"}
            value={fdj(total)}
            tone="red"
            icon={<Wallet size={18} />}
            hint={all ? `${n} dépense${n > 1 ? "s" : ""} au total` : <Delta cur={total} prev={prevTotal} prevMonth={prevMonth} upIsGood={false} />}
          />
          <Stat
            label="Nombre de dépenses"
            value={n}
            icon={<Receipt size={18} />}
            hint={n ? `Moyenne ${fdj(total / n)}` : "Aucune sur la période"}
          />
          <Stat
            label="Sur des projets"
            value={fdj(projectTotal)}
            tone="blue"
            icon={<FolderKanban size={18} />}
            hint={total ? `${Math.round((projectTotal / total) * 100)} % du total · ${fdj(total - projectTotal)} de frais généraux` : "Aucune dépense rattachée"}
          />
          <Stat
            label="Justificatifs"
            value={`${withProof} / ${n}`}
            tone={withProof < n ? "gold" : "green"}
            icon={<FileCheck2 size={18} />}
            hint={withProof < n ? `${n - withProof} dépense${n - withProof > 1 ? "s" : ""} sans justificatif` : n ? "Tout est justifié" : "—"}
          />
        </div>

        <Breakdown
          title={`Répartition par catégorie · ${monthLabel(month)}`}
          slices={slices}
          active={cat || undefined}
          resetHref={href(PATH, { m: month })}
          empty={`Aucune dépense ${inMonth(month)}.`}
          unit={["dépense", "dépenses"]}
        />

        <section className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5 sm:px-6">
            <h2 className="h-section">
              {cat ? `${catLabel} · ` : ""}{monthLabel(month)}
            </h2>
            {n > 0 && <span className="text-sm text-navy-600/70">{n} ligne{n > 1 ? "s" : ""}</span>}
          </div>
          {n === 0 ? (
            <Empty title={cat ? `Aucune dépense « ${catLabel} » ${inMonth(month)}` : `Aucune dépense ${inMonth(month)}`}>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {write && <Link href={href(PATH, { ...keep, nouveau: 1 })} scroll={false} className="btn-gold btn-sm"><Plus size={14} aria-hidden /> Ajouter une dépense</Link>}
                {cat && <Link href={href(PATH, { m: month })} className="btn-ghost btn-sm">Toutes les catégories</Link>}
                {!all && prev && prev.n > 0 && <Link href={href(PATH, { ...keep, m: prevMonth })} className="btn-ghost btn-sm">Voir {monthLabel(prevMonth)} ({prev.n})</Link>}
              </div>
            </Empty>
          ) : (
            <>
              <div className="hidden md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-[7.5rem]">Date</th>
                    <th>Dépense</th>
                    <th>Catégorie</th>
                    <th>Projet</th>
                    <th className="num">Montant</th>
                    <th aria-label="Actions" className="w-px" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={editing?.id === r.id ? "bg-gold-50" : ""}>
                      <td className="whitespace-nowrap text-navy-600">{dateFr(r.date)}</td>
                      <td className="min-w-[12rem]">
                        <span className="font-bold text-navy-900">{r.description}</span>
                        {(r.supplier || r.method) && (
                          <div className="text-sm text-navy-600/70">
                            {[r.supplier, r.method ? PAYMENT_METHODS[r.method] ?? r.method : null].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${CAT_COLOR[r.category] ?? "bg-navy-200"}`} aria-hidden />
                          {EXPENSE_CATEGORIES[r.category] ?? r.category}
                        </span>
                      </td>
                      <td className="max-w-[14rem] text-sm">
                        {r.project_title ? (
                          <Link href={`/projets/${r.project_id}`} className="link block truncate font-normal" title={r.project_title}>{r.project_title}</Link>
                        ) : <span className="text-navy-600/50">Frais généraux</span>}
                      </td>
                      <td className="num font-bold">{fdj(r.amount)}</td>
                      <td className="whitespace-nowrap">
                        {actions(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <ul className="divide-y divide-navy-50 border-t border-navy-50 md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className={`px-4 py-3 ${editing?.id === r.id ? "bg-gold-50" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold leading-snug text-navy-900">{r.description}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-navy-600/75">
                          <span>{dateFr(r.date)}</span>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${CAT_COLOR[r.category] ?? "bg-navy-200"}`} aria-hidden />
                            {EXPENSE_CATEGORIES[r.category] ?? r.category}
                          </span>
                          {r.supplier && <><span aria-hidden>·</span><span>{r.supplier}</span></>}
                        </p>
                      </div>
                      <b className="shrink-0 tabular-nums text-navy-900">{fdj(r.amount)}</b>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm">
                        {r.project_title ? (
                          <Link href={`/projets/${r.project_id}`} className="link font-normal">{r.project_title}</Link>
                        ) : <span className="text-navy-600/50">Frais généraux</span>}
                      </span>
                      <div className="shrink-0">{actions(r)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t-2 border-gold/30 bg-gold/5 px-5 py-3 sm:px-6">
                <span className="text-sm font-bold text-navy-700">Total {cat ? `${catLabel.toLowerCase()} ` : ""}{inMonth(month)}</span>
                <span className="text-lg font-bold tabular-nums text-red-700">{fdj(total)}</span>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
