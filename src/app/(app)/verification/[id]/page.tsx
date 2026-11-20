import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Download, FileUp, RefreshCw } from "lucide-react";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { AVAILABILITY, CONDITIONS } from "@/lib/equipmentLabels";
import { Empty, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton, SubmitButton } from "@/components/ConfirmButton";
import { equipmentTitle, weekRangeLabel } from "@/lib/verification";
import { regenerateVerification, uploadSignedVerification } from "../actions";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  gen: "Fiche générée. Téléchargez-la, imprimez-la, puis faites le contrôle sur place.",
  maj: "La liste a été mise à jour avec le matériel actuel.",
  signe: "Document signé enregistré. Cette semaine reste consultable dans les archives.",
};
const ERR: Record<string, string> = {
  vide: "Aucun matériel enregistré. Ajoutez d’abord des fiches dans Matériel.",
  fichier: "Déposez un PDF ou une photo (JPG, PNG, WEBP), 15 Mo maximum.",
  figee: "Un document signé est déjà déposé : la liste de cette semaine ne peut plus changer.",
};

function when(value: Date | null) {
  if (!value) return "—";
  return value.toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sizeLabel(n: number | null) {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export default async function VerificationDetailPage({
  params, searchParams,
}: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const user = await requirePerm("materiel");
  const write = can(user, "materiel", "write");
  const id = Number(params.id);
  const [row] = await db.select().from(schema.equipmentVerifications).where(eq(schema.equipmentVerifications.id, id));
  if (!row) notFound();
  const lines = await db.select().from(schema.equipmentVerificationLines)
    .where(eq(schema.equipmentVerificationLines.verificationId, id))
    .orderBy(asc(schema.equipmentVerificationLines.position));
  const [author] = row.generatedBy
    ? await db.select().from(schema.users).where(eq(schema.users.id, row.generatedBy))
    : [];
  const [signer] = row.signedUploadedBy
    ? await db.select().from(schema.users).where(eq(schema.users.id, row.signedUploadedBy))
    : [];
  const week = String(row.weekStart).slice(0, 10);
  const signed = Boolean(row.signedStoredName);
  const ok = searchParams.ok ? OK[searchParams.ok] : "";
  const err = searchParams.err ? ERR[searchParams.err] : "";

  return (
    <>
      <PageHeader
        title={`Semaine ${weekRangeLabel(week)}`}
        subtitle={`${lines.length} matériel${lines.length > 1 ? "s" : ""} figés au moment de la génération${author ? ` · ${author.name}` : ""} · ${when(row.generatedAt)}`}
        back={{ href: "/verification", label: "Vérifications" }}
        actions={
          <>
            <a className="btn-primary" href={`/api/pdf/verification/${id}`}><Download size={16} /> Télécharger la fiche</a>
            {signed
              ? <a className="btn-ghost" href={`/api/fichiers/verification/${id}`} target="_blank" rel="noreferrer">Voir le document signé</a>
              : <a className="btn-gold" href="#depot"><FileUp size={16} /> Déposer le signé</a>}
          </>
        }
      />

      <Flash message={ok} clear={["ok"]} />
      <Flash tone="error" message={err} clear={["err"]} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="card card-pad">
          <p className="h-section">Fiche à imprimer</p>
          <p className="mt-2 font-bold text-navy">Liste vierge, avec cases à cocher</p>
          <p className="mt-1 text-sm text-navy-600/80">Disponible ou absent, état constaté (bon, usé, panne, hors service) et une ligne pour les observations. La signature est en bas de la dernière page.</p>
        </div>
        <div className="card card-pad">
          <p className="h-section">Document signé</p>
          {signed ? (
            <>
              <p className="mt-2 font-bold text-navy">{row.signedFilename}</p>
              <p className="mt-1 text-sm text-navy-600/80">
                Déposé le {when(row.signedUploadedAt)}{signer ? ` par ${signer.name}` : ""}{row.signedSize ? ` · ${sizeLabel(row.signedSize)}` : ""}
              </p>
              <span className="badge-green mt-3">Semaine complète</span>
            </>
          ) : (
            <>
              <p className="mt-2 font-bold text-navy">Pas encore déposé</p>
              <p className="mt-1 text-sm text-navy-600/80">Après le contrôle physique, scannez ou photographiez la fiche remplie et signée.</p>
              <span className="badge-gold mt-3">En attente</span>
            </>
          )}
        </div>
      </div>

      <section id="depot" className="card card-pad mb-6">
        <p className="h-section">Dépôt du document rempli</p>
        <h2 className="mt-1 text-lg font-bold text-navy">{signed ? "Remplacer le document signé" : "Déposer le document signé"}</h2>
        <p className="mt-1 text-sm text-navy-600/80">PDF, JPG, PNG ou WEBP. Un nouveau fichier remplace le précédent pour cette semaine uniquement.</p>
        {write ? (
          <form action={uploadSignedVerification.bind(null, id)} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1">
              <span className="label">Fichier</span>
              <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="input py-1.5" />
            </label>
            <SubmitButton className="btn-gold"><FileUp size={16} /> {signed ? "Remplacer" : "Déposer"}</SubmitButton>
          </form>
        ) : (
          <p className="mt-3 text-sm text-navy-600/75">Le dépôt est réservé aux personnes qui peuvent modifier le matériel.</p>
        )}
        {signed && row.signedMime === "application/pdf" && (
          <iframe title="Document signé" src={`/api/fichiers/verification/${id}`} className="mt-5 h-[72vh] w-full rounded-xl border border-navy-100 bg-white" />
        )}
        {signed && row.signedMime?.startsWith("image/") && (
          <img src={`/api/fichiers/verification/${id}`} alt="Document signé" className="mt-5 max-h-[72vh] w-full rounded-xl border border-navy-100 object-contain bg-white" />
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <p className="h-section">Liste figée de la semaine</p>
            <p className="mt-1 text-sm text-navy-600/75">C’est cette liste qui est imprimée. L’état indiqué ici est celui enregistré dans le logiciel au moment de la génération.</p>
          </div>
          {write && !signed && (
            <form action={regenerateVerification.bind(null, id)}>
              <ConfirmButton className="btn-ghost btn-sm" message="Remplacer la liste par le matériel actuel ? La fiche PDF changera.">
                <RefreshCw size={14} /> Mettre à jour la liste
              </ConfirmButton>
            </form>
          )}
        </div>
        {lines.length === 0 ? <Empty title="Liste vide" /> : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Réf.</th>
                <th>Matériel</th>
                <th>Catégorie</th>
                <th>Qté</th>
                <th>Lieu</th>
                <th>État enregistré</th>
                <th>Dispo. enregistrée</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.id}>
                  <td className="tabular-nums text-navy-600/70">{i + 1}</td>
                  <td className="whitespace-nowrap font-mono text-sm">{line.equipmentId ? <Link className="link" href={`/materiel/${line.equipmentId}`}>{line.ref}</Link> : line.ref}</td>
                  <td className="font-bold">{equipmentTitle(line)}</td>
                  <td>{line.category || "—"}</td>
                  <td className="tabular-nums">{line.quantity}</td>
                  <td>{line.location || "—"}</td>
                  <td>{CONDITIONS[line.condition] ?? line.condition}</td>
                  <td>{AVAILABILITY[line.availability] ?? line.availability}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
