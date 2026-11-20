import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, dateFr, fdj, today } from "@/lib/format";
import { fileFrom, removeProof, storeProof } from "@/lib/proof";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";

function values(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const cat = s("category");
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(s("date")) ? s("date") : today(),
    category: cat in EXPENSE_CATEGORIES ? cat : "autre",
    description: s("description") || "Dépense",
    supplier: s("supplier") || null,
    amount: Math.max(0, Math.round(Number(s("amount").replace(/\s/g, "")) || 0)),
    method: s("method") || null,
    projectId: Number(s("projectId")) || null,
  };
}

async function saveExpense(fd: FormData) {
  "use server";
  const user = await requirePerm("depenses", "write");
  const id = Number(fd.get("id")) || null;
  const v = values(fd);
  const back = `/depenses?m=${v.date.slice(0, 7)}${id ? `&edit=${id}` : ""}`;
  const file = fileFrom(fd);
  const saved = file ? await storeProof(file) : null;
  if (saved && !saved.ok) redirect(`${back}&e=${saved.code}`);
  const current = id ? (await db.select().from(schema.expenses).where(eq(schema.expenses.id, id)))[0] : undefined;
  if (id) await db.update(schema.expenses).set({ ...v, ...(saved?.ok ? saved.proof : {}) }).where(eq(schema.expenses.id, id));
  else await db.insert(schema.expenses).values({ ...v, ...(saved?.ok ? saved.proof : {}), createdBy: user.id });
  if (saved?.ok) await removeProof(current?.proofStored);
  revalidatePath("/depenses");
  revalidatePath("/");
  redirect(`/depenses?m=${v.date.slice(0, 7)}&ok=1`);
}

async function removeExpense(id: number) {
  "use server";
  await requirePerm("depenses", "write");
  const [row] = await db.delete(schema.expenses).where(eq(schema.expenses.id, id)).returning({ proofStored: schema.expenses.proofStored });
  await removeProof(row?.proofStored);
  revalidatePath("/depenses");
  redirect("/depenses");
}

export default async function ExpensesPage({ searchParams }: { searchParams: { m?: string; cat?: string; edit?: string; projet?: string; ok?: string; e?: string } }) {
  const user = await requirePerm("depenses");
  const write = can(user, "depenses", "write");
  const now = new Date();
  const month = searchParams.m ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cat = searchParams.cat ?? "";
  const res = await db.execute(sql`
    SELECT e.*, p.title AS project_title FROM expenses e LEFT JOIN projects p ON p.id = e.project_id
    WHERE (${month} = 'tout' OR to_char(e.date, 'YYYY-MM') = ${month}) AND (${cat} = '' OR e.category = ${cat})
    ORDER BY e.date DESC, e.id DESC`);
  const rows = res.rows as any[];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const byCat = Object.entries(EXPENSE_CATEGORIES)
    .map(([k, v]) => [v, rows.filter((r) => r.category === k).reduce((s, r) => s + Number(r.amount), 0)] as const)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const projects = await db.select({ id: schema.projects.id, title: schema.projects.title }).from(schema.projects).orderBy(asc(schema.projects.title));
  const editing = searchParams.edit ? (await db.select().from(schema.expenses).where(eq(schema.expenses.id, Number(searchParams.edit))))[0] : undefined;
  const defaultProject = editing?.projectId ?? (Number(searchParams.projet) || "");

  const months: string[] = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthLabel = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Dépenses" subtitle="Charges de l'agence, rattachables à un projet pour calculer sa marge." />
      <Flash message={searchParams.ok ? "Dépense enregistrée." : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e === "taille" ? "Le fichier dépasse 15 Mo." : searchParams.e === "type" ? "Le justificatif doit être un PDF ou une photo." : ""} clear={["e"]} />
      <div className={`grid gap-6 items-start ${write ? "xl:grid-cols-[1fr_360px]" : ""}`}>
        <div className="space-y-4 min-w-0">
          <form className="flex flex-wrap gap-2">
            <select name="m" defaultValue={month} className="input w-auto">
              <option value="tout">Toute la période</option>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select name="cat" defaultValue={cat} className="input w-auto">
              <option value="">Toutes catégories</option>
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn-ghost">Filtrer</button>
          </form>
          <div className="grid sm:grid-cols-[240px_1fr] gap-4">
            <Stat label="Total dépenses" value={fdj(total)} hint={`${rows.length} ligne${rows.length > 1 ? "s" : ""}`} tone="red" />
            <div className="card card-pad">
              <p className="h-section mb-2">Par catégorie</p>
              {byCat.length === 0 ? <p className="text-navy-600/60">—</p> : (
                <div className="space-y-1.5">
                  {byCat.map(([k, v]) => (
                    <div key={k} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-bold">{k}</span>
                        <span className="shrink-0 tabular-nums">{fdj(v)}</span>
                      </div>
                      <span className="mt-1 block h-2 overflow-hidden rounded-full bg-navy-50"><span className="block h-full bg-navy" style={{ width: `${(v / total) * 100}%` }} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="card overflow-x-auto">
            {rows.length === 0 ? <Empty title="Aucune dépense sur la période" /> : (
              <table className="table">
                <thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th>Projet</th><th className="num">Montant</th>{write && <th />}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{dateFr(r.date)}</td>
                      <td>
                        <span className="font-bold">{r.description}</span>
                        {r.supplier && <div className="text-sm text-navy-600/70">{r.supplier}</div>}
                        {r.proof_stored && <div><a href={`/api/fichiers/depense/${r.id}`} target="_blank" className="text-sm link font-normal">Justificatif</a></div>}
                      </td>
                      <td><span className="badge-gray">{EXPENSE_CATEGORIES[r.category] ?? r.category}</span></td>
                      <td className="text-sm">{r.project_title ? <Link href={`/projets/${r.project_id}`} className="link font-normal">{r.project_title}</Link> : "—"}</td>
                      <td className="num font-bold">{fdj(r.amount)}</td>
                      {write && (
                        <td className="whitespace-nowrap">
                          <Link href={`/depenses?m=${month}&edit=${r.id}`} className="btn-ghost btn-sm mr-1">Modifier</Link>
                          <form action={removeExpense.bind(null, r.id)} className="inline">
                            <ConfirmButton message="Supprimer cette dépense ?">Suppr.</ConfirmButton>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {write && (
          <form action={saveExpense} key={editing?.id ?? "new"} encType="multipart/form-data" className="card card-pad space-y-3 xl:sticky xl:top-6">
            <p className="h-section">{editing ? "Modifier la dépense" : "Nouvelle dépense"}</p>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
              <div><label className="label">Date</label><input name="date" type="date" className="input" defaultValue={editing?.date ?? today()} required /></div>
              <div><label className="label">Montant (FDJ)</label><input name="amount" type="number" min={1} className="input" defaultValue={editing?.amount} required /></div>
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select name="category" className="input" defaultValue={editing?.category ?? "materiel"}>
                {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Description</label><input name="description" className="input" defaultValue={editing?.description} required placeholder="ex. Carburant tournage Tadjourah" /></div>
            <div><label className="label">Fournisseur / bénéficiaire</label><input name="supplier" className="input" defaultValue={editing?.supplier ?? ""} /></div>
            <div>
              <label className="label">Mode de paiement</label>
              <select name="method" className="input" defaultValue={editing?.method ?? "especes"}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Projet (facultatif)</label>
              <select name="projectId" className="input" defaultValue={defaultProject}>
                <option value="">— Frais généraux —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Justificatif</label>
              <input name="file" type="file" accept="application/pdf,image/*" className="block w-full text-sm text-navy-700 file:mr-3 file:rounded-lg file:border file:border-navy-200 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-navy" />
              <p className="mt-1 text-xs text-navy-600/60">PDF ou photo, 15 Mo maximum. Facultatif.</p>
              {editing?.proofStored && (
                <a href={`/api/fichiers/depense/${editing.id}`} target="_blank" className="mt-1 inline-block text-sm link">
                  Fichier actuel : {editing.proofFilename || "justificatif"}
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{editing ? "Enregistrer" : "Ajouter la dépense"}</SubmitButton>
              {editing && <Link href={`/depenses?m=${month}`} className="btn-ghost">Annuler</Link>}
            </div>
          </form>
        )}
      </div>
    </>
  );
}
