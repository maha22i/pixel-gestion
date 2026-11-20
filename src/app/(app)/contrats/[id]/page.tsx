import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { dateFr, fdj } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { CONTRACT_STATUS, displayStatus, endingSoon } from "@/lib/contractModel";
import { toDoc } from "@/lib/contractData";
import { collectMissing } from "@/lib/contractModel";
import { signatureMissing } from "@/lib/contractPdf";
import { deleteContract, duplicateContract, renewContract, saveAsTemplate, setContractStatus } from "../actions";
import { Status } from "../Status";

export default async function ContractPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const user = await requirePerm("contrats");
  const id = Number(params.id);
  const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
  if (!c) notFound();
  const company = await getSettings();
  const shown = displayStatus(c);
  const missing = collectMissing(toDoc(c), company);
  const noSign = signatureMissing(company, c.includeSignature);
  const write = can(user, "contrats", "write");
  const msgs: Record<string, string> = { "1": "Contrat enregistré.", statut: "Statut mis à jour.", copie: "Brouillon créé.", modele: "Modèle enregistré." };
  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{c.number} <Status s={shown} /></span>}
        subtitle={c.title.replaceAll("\n", " ")}
        back={{ href: "/contrats", label: "Contrats" }}
        actions={<>
          <a className="btn-gold" href={`/api/pdf/contrat/${id}`} target="_blank">PDF</a>
          <a className="btn-ghost" href={`/api/docx/contrat/${id}`}>Word</a>
          {write && <Link className="btn-ghost" href={`/contrats/${id}/modifier`}>Modifier</Link>}
          {write && <form action={duplicateContract.bind(null, id)}><button className="btn-ghost">Dupliquer</button></form>}
        </>}
      />
      <Flash message={searchParams.ok ? msgs[searchParams.ok] : ""} clear={["ok"]} />
      <Flash
        tone="error"
        clear={["e"]}
        message={
          searchParams.e === "suppr" ? "Seul un brouillon peut être supprimé."
          : searchParams.e === "resil" ? "La résiliation demande une date."
          : ""
        }
      />
      {missing.length > 0 && <p className="mb-4 rounded-lg bg-amber-50 text-amber-900 px-4 py-2 font-bold">Jetons vides dans le PDF : {missing.join(", ")}</p>}
      {noSign && <p className="mb-4 rounded-lg bg-amber-50 text-amber-900 px-4 py-2 font-bold">Aucune image de signature exploitable dans les Paramètres. Le bloc Prestataire restera vide.</p>}
      {endingSoon(c) && write && (
        <form action={renewContract.bind(null, id)} className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="font-bold">Ce contrat se termine dans moins de 30 jours.</span>
          <button className="btn-gold btn-sm">Renouveler</button>
        </form>
      )}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="card card-pad space-y-1">
          <p className="h-section">Parties</p>
          <p><b>{c.clientName}</b> {c.clientAcronym && `(${c.clientAcronym})`}</p>
          <p>{c.clientAddress}</p>
          <p>Représentant : {[c.repCivility, c.repName, c.repTitle].filter(Boolean).join(" · ") || "—"}</p>
          <p>Référent : {[c.contactName, c.contactRole, c.contactPhone, c.contactEmail].filter(Boolean).join(" · ") || "—"}</p>
          <p className="text-sm text-navy-600">Prestataire lu dans les Paramètres à chaque PDF : {company.companyName}, {company.phone}</p>
        </div>
        <div className="card card-pad space-y-1">
          <p className="h-section">Conditions</p>
          <p>{c.templateName}</p>
          <p>Du {dateFr(c.startDate)} au {dateFr(c.endDate)} · {c.durationUnit === "days" ? `${c.durationValue ?? "—"} jours` : c.durationUnit === "months" ? `${c.durationValue ?? "—"} mois` : "date de fin libre"}</p>
          <p>Signature : {c.signaturePlace}, {dateFr(c.signatureDate)}</p>
          <p className="font-bold">{c.amountMode === "flat" ? "Montant forfaitaire" : "Forfait mensuel"} : {fdj(c.amountMode === "flat" ? c.totalAmount : c.monthlyAmount)} · total {fdj(c.totalAmount)}</p>
          <p>{c.taxMode === "ht" ? "HT" : c.taxMode === "ttc" ? "TTC" : "Mention fiscale non précisée"}</p>
          <p>{c.paymentTerms}</p>
          {c.status === "resilie" && <p className="font-bold">Résilié le {dateFr(c.terminationDate)}{c.terminationReason ? ` — ${c.terminationReason}` : ""}</p>}
        </div>
      </div>
      {write && (
        <div className="card card-pad space-y-3 max-w-xl">
          <p className="h-section">Statut enregistré : {CONTRACT_STATUS[c.status as keyof typeof CONTRACT_STATUS] ?? c.status}</p>
          <p className="text-sm text-navy-600">« En cours » et « Terminé » s’affichent aussi selon les dates lorsque le contrat est signé.</p>
          <form action={setContractStatus.bind(null, id)} className="flex flex-wrap gap-2 items-end">
            <select name="status" className="input" defaultValue={c.status}>
              {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="text-sm">Date de résiliation
              <input name="terminationDate" type="date" className="input" defaultValue={c.terminationDate ?? ""} />
            </label>
            <input name="terminationReason" className="input" placeholder="Motif (facultatif)" defaultValue={c.terminationReason ?? ""} />
            <button className="btn-primary">Mettre à jour</button>
          </form>
          <form action={saveAsTemplate.bind(null, id)} className="flex flex-wrap gap-2">
            <input name="name" className="input" placeholder="Nom du modèle" />
            <button className="btn-ghost">Enregistrer comme modèle</button>
          </form>
          {c.status === "brouillon" && (
            <form action={deleteContract.bind(null, id)}><button className="btn-ghost">Supprimer le brouillon</button></form>
          )}
        </div>
      )}
    </>
  );
}
