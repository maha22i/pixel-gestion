import Link from "next/link";
import { sql } from "drizzle-orm";
import { ClipboardCheck, Download, FileUp, Printer } from "lucide-react";
import { db } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { Empty, Field, PageHeader, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { currentWeekStart, recentMondays, weekRangeLabel } from "@/lib/verification";
import { generateVerification } from "./actions";

export const dynamic = "force-dynamic";

type WeekRow = {
  id: number;
  week_start: string;
  generated_at: string;
  signed_stored_name: string | null;
  signed_uploaded_at: string | null;
  generated_name: string | null;
  signed_name: string | null;
  item_count: number;
};

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function VerificationPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("materiel");
  const write = can(user, "materiel", "write");
  const current = currentWeekStart();
  const res = await db.execute(sql`
    SELECT v.id, v.week_start::text AS week_start, v.generated_at, v.signed_stored_name, v.signed_uploaded_at,
      u.name AS generated_name, s.name AS signed_name,
      (SELECT COUNT(*)::int FROM equipment_verification_lines l WHERE l.verification_id = v.id) AS item_count
    FROM equipment_verifications v
    LEFT JOIN users u ON u.id = v.generated_by
    LEFT JOIN users s ON s.id = v.signed_uploaded_by
    ORDER BY v.week_start DESC`);
  const rows = res.rows as WeekRow[];
  const byWeek = new Map(rows.map((r) => [r.week_start, r]));
  const currentRow = byWeek.get(current) ?? null;
  const waiting = rows.filter((r) => !r.signed_stored_name).length;
  const done = rows.filter((r) => r.signed_stored_name).length;
  const missing = recentMondays(16).filter((w) => w !== current && !byWeek.has(w));
  const err = searchParams.err === "vide"
    ? "Aucun matériel enregistré. Ajoutez d’abord des fiches dans Matériel."
    : "";

  return (
    <>
      <PageHeader
        title="Vérification"
        subtitle="Chaque semaine : une fiche à imprimer pour le contrôle physique, puis le document rempli et signé à déposer. Les deux restent consultables à tout moment."
      />

      <Flash tone="error" message={err} clear={["err"]} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { n: "1", title: "Générer", text: "La liste du matériel est figée pour la semaine." },
          { n: "2", title: "Imprimer", text: "Le responsable coche disponible ou absent, et l’état, sur place." },
          { n: "3", title: "Déposer", text: "Le document signé est archivé à côté de la fiche." },
        ].map((s) => (
          <div key={s.n} className="card card-pad flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold font-bold text-navy-900">{s.n}</span>
            <div>
              <p className="font-bold text-navy">{s.title}</p>
              <p className="mt-0.5 text-sm text-navy-600/80">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Cette semaine" value={currentRow ? (currentRow.signed_stored_name ? "Complète" : "À signer") : "À générer"} tone={currentRow?.signed_stored_name ? "green" : "gold"} hint={weekRangeLabel(current)} />
        <Stat label="Semaines signées" value={done} tone="green" hint="Fiche et document déposé" />
        <Stat label="En attente de signature" value={waiting} tone={waiting ? "gold" : "navy"} hint="Fiche générée, scan manquant" />
      </div>

      <section className="card card-pad mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="h-section">Semaine en cours</p>
            <h2 className="mt-1 text-xl font-bold text-navy">Semaine {weekRangeLabel(current)}</h2>
            {currentRow ? (
              <p className="mt-1 text-sm text-navy-600/80">
                {currentRow.item_count} matériel{currentRow.item_count > 1 ? "s" : ""} · générée le {when(currentRow.generated_at)}
                {currentRow.generated_name ? ` par ${currentRow.generated_name}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-navy-600/80">Aucune fiche pour cette semaine. La génération prend une photo de tout le matériel actuel.</p>
            )}
          </div>
          {currentRow?.signed_stored_name
            ? <span className="badge-green">Document signé déposé</span>
            : currentRow
              ? <span className="badge-gold">En attente du document signé</span>
              : <span className="badge-gray">Pas encore générée</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {!currentRow && write && (
            <form action={generateVerification}>
              <input type="hidden" name="weekStart" value={current} />
              <button className="btn-gold"><ClipboardCheck size={16} /> Générer la fiche de cette semaine</button>
            </form>
          )}
          {currentRow && (
            <>
              <a className="btn-primary" href={`/api/pdf/verification/${currentRow.id}`}><Download size={16} /> Télécharger la fiche</a>
              <Link className="btn-ghost" href={`/verification/${currentRow.id}`}><Printer size={16} /> Ouvrir la semaine</Link>
              {!currentRow.signed_stored_name && write && (
                <Link className="btn-gold" href={`/verification/${currentRow.id}#depot`}><FileUp size={16} /> Déposer le document signé</Link>
              )}
            </>
          )}
          {!currentRow && !write && <p className="text-sm text-navy-600/75">Un responsable avec le droit d’écriture sur le matériel peut générer la fiche.</p>}
        </div>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5">
          <p className="h-section">Archives, semaine par semaine</p>
        </div>
        {rows.length === 0 ? (
          <Empty title="Aucune vérification">Générez la fiche de la semaine pour commencer l’historique.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Semaine</th>
                <th>Matériels</th>
                <th>Fiche générée</th>
                <th>Document signé</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable">
                  <td>
                    <a className="row-hit font-bold" href={`/verification/${r.id}`}>
                      {weekRangeLabel(r.week_start)}
                      {r.week_start === current && <span className="ml-2 badge-navy">En cours</span>}
                    </a>
                  </td>
                  <td className="tabular-nums">{r.item_count}</td>
                  <td>
                    <span className="block">{when(r.generated_at)}</span>
                    {r.generated_name && <span className="text-xs text-navy-600/70">{r.generated_name}</span>}
                  </td>
                  <td>
                    {r.signed_stored_name ? (
                      <>
                        <span className="block">{when(r.signed_uploaded_at)}</span>
                        {r.signed_name && <span className="text-xs text-navy-600/70">{r.signed_name}</span>}
                      </>
                    ) : "—"}
                  </td>
                  <td>{r.signed_stored_name ? <span className="badge-green">Complète</span> : <span className="badge-gold">À signer</span>}</td>
                  <td className="row-keep whitespace-nowrap">
                    <a className="btn-ghost btn-sm" href={`/api/pdf/verification/${r.id}`}>PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {write && missing.length > 0 && (
        <form action={generateVerification} className="card card-pad mt-6 flex flex-wrap items-end gap-3">
          <Field label="Rattraper une semaine passée" className="min-w-[260px]">
            <select name="weekStart" className="input" defaultValue={missing[0]}>
              {missing.map((w) => <option key={w} value={w}>Semaine {weekRangeLabel(w)}</option>)}
            </select>
          </Field>
          <button className="btn-ghost">Générer cette fiche</button>
        </form>
      )}
    </>
  );
}
