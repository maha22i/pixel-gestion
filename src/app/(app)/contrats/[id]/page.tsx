import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertTriangle, Building2, CalendarDays, Check, Copy, FileDown, FileText, Pencil, RefreshCw, Send, FileSignature, Wallet } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { CLIENT_TYPES, dateFr, fdj } from "@/lib/format";
import { PageHeader, SectionCard, Stat } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CONTRACT_STATUS, articleNumbers, collectMissing, displayStatus, endingSoon } from "@/lib/contractModel";
import { asSections, asServices, toDoc } from "@/lib/contractData";
import { signatureMissing } from "@/lib/contractPdf";
import { deleteContract, duplicateContract, renewContract, saveAsTemplate, setContractStatus } from "../actions";
import { Status } from "../Status";

const FLOW = ["brouillon", "envoye", "signe", "en_cours", "termine"] as const;

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
  const sections = asSections(c.sections);
  const services = asServices(c.services);
  const numbers = articleNumbers(sections);
  const msgs: Record<string, string> = { "1": "Contrat enregistré.", statut: "Statut mis à jour.", copie: "Brouillon créé.", modele: "Modèle enregistré." };
  const duree = c.durationUnit === "days" ? `${c.durationValue ?? "—"} jours` : c.durationUnit === "months" ? `${c.durationValue ?? "—"} mois` : "date de fin libre";
  const step = shown === "resilie" ? -1 : FLOW.indexOf(shown as (typeof FLOW)[number]);
  const next = c.status === "brouillon" ? { status: "envoye", label: "Marquer comme envoyé", icon: <Send size={15} /> }
    : c.status === "envoye" ? { status: "signe", label: "Marquer comme signé", icon: <FileSignature size={15} /> }
    : null;
  const editable = c.status === "brouillon" || c.status === "envoye";

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{c.number} <Status s={shown} /></span>}
        subtitle={<><b className="text-navy">{c.clientName}</b>{c.title && <> · {c.title.replaceAll("\n", " ")}</>}</>}
        back={{ href: "/contrats", label: "Contrats" }}
        actions={<>
          <a className="btn-gold" href={`/api/pdf/contrat/${id}`} target="_blank" rel="noreferrer"><FileText size={16} /> PDF</a>
          <a className="btn-ghost" href={`/api/docx/contrat/${id}`}><FileDown size={16} /> Word</a>
          {write && <Link className={editable ? "btn-primary" : "btn-ghost"} href={`/contrats/${id}/modifier`}><Pencil size={15} /> Modifier</Link>}
        </>}
      />
      <Flash message={searchParams.ok ? msgs[searchParams.ok] : ""} clear={["ok"]} />
      <Flash
        tone="error"
        clear={["e"]}
        message={searchParams.e === "suppr" ? "Seul un brouillon peut être supprimé." : searchParams.e === "resil" ? "La résiliation demande une date." : ""}
      />

      {(missing.length > 0 || noSign) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> À compléter avant d’envoyer</p>
          {missing.length > 0 && <p className="mt-1">Laissé en blanc (______) dans le PDF : {missing.join(", ")}.</p>}
          {noSign && <p className="mt-1">Aucune image de signature exploitable dans les Paramètres : le bloc Prestataire restera vide.</p>}
          {write && <Link href={`/contrats/${id}/modifier`} className="mt-2 inline-block font-bold underline">Compléter le contrat</Link>}
        </div>
      )}
      {endingSoon(c) && write && (
        <form action={renewContract.bind(null, id)} className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
          <span className="font-bold">Ce contrat se termine le {dateFr(c.endDate)}.</span>
          <button className="btn-gold btn-sm"><RefreshCw size={13} /> Renouveler</button>
        </form>
      )}

      {/* Progression du statut */}
      <div className="card card-pad mb-5">
        {shown === "resilie" ? (
          <p className="font-bold text-red-700">Résilié le {dateFr(c.terminationDate)}{c.terminationReason ? ` — ${c.terminationReason}` : ""}</p>
        ) : (
          <ol className="grid grid-cols-5 gap-1.5">
            {FLOW.map((k, i) => (
              <li key={k} className="min-w-0">
                <div className={`h-1.5 rounded-full ${i <= step ? "bg-emerald-500" : "bg-navy-50"}`} />
                <p className={`mt-1.5 flex items-center gap-1 truncate text-[12px] font-bold ${i === step ? "text-navy" : i < step ? "text-emerald-700" : "text-navy-600/50"}`}>
                  {i < step && <Check size={12} strokeWidth={3} />}{CONTRACT_STATUS[k]}
                </p>
              </li>
            ))}
          </ol>
        )}
        {write && next && (
          <form action={setContractStatus.bind(null, id)} className="mt-4 flex flex-wrap items-center gap-3">
            <input type="hidden" name="status" value={next.status} />
            <button className="btn-primary btn-sm">{next.icon} {next.label}</button>
            <span className="text-[12px] text-navy-600/70">« En cours » et « Terminé » s’affichent ensuite automatiquement selon les dates.</span>
          </form>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Montant total" value={fdj(c.totalAmount)} icon={<Wallet size={18} />} hint={c.taxMode === "ht" ? "Hors taxes" : c.taxMode === "ttc" ? "TTC" : "Mention fiscale non précisée"} />
        <Stat label={c.amountMode === "flat" ? "Formule" : "Forfait mensuel"} value={c.amountMode === "flat" ? "Forfait" : fdj(c.monthlyAmount)} tone="gold" hint={c.amountMode === "flat" ? "montant unique" : `sur ${duree}`} />
        <Stat label="Période" value={<span className="text-[1.05rem] sm:text-[1.2rem]">{dateFr(c.startDate)} → {dateFr(c.endDate)}</span>} icon={<CalendarDays size={18} />} hint={duree} tone="blue" />
        <Stat label="Signature" value={<span className="text-[1.05rem] sm:text-[1.2rem]">{c.signatureDate ? dateFr(c.signatureDate) : "À dater"}</span>} hint={c.signaturePlace} tone={c.signatureDate ? "green" : "navy"} icon={<FileSignature size={18} />} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <SectionCard title="Client">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy"><Building2 size={18} /></span>
            <div className="min-w-0 space-y-1 text-[15px]">
              <p className="font-bold text-navy">
                {c.clientId ? <Link className="link" href={`/clients/${c.clientId}`}>{c.clientName}</Link> : c.clientName} {c.clientAcronym && <span className="font-normal text-navy-600/70">({c.clientAcronym})</span>}
              </p>
              <p className="text-navy-600/80">{[CLIENT_TYPES[c.clientType] ?? c.clientType, c.clientNif && `NIF ${c.clientNif}`].filter(Boolean).join(" · ")}</p>
              <p>{c.clientAddress || <span className="text-amber-700">Adresse à compléter</span>}</p>
              <p><span className="text-navy-600/70">Représentant :</span> {[c.repCivility, c.repName].filter(Boolean).join(" ") || "—"}{c.repTitle && `, ${c.repTitle}`}</p>
              <p><span className="text-navy-600/70">Référent :</span> {[c.contactName, c.contactRole, c.contactPhone, c.contactEmail].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-navy-600/60">Prestataire lu dans les Paramètres à chaque PDF : {company.companyName}, {company.phone}</p>
        </SectionCard>
        <SectionCard title="Conditions">
          <dl className="grid gap-x-6 gap-y-2 text-[15px] sm:grid-cols-2">
            <div><dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Modèle</dt><dd>{c.templateName || "—"}</dd></div>
            <div><dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Durée</dt><dd>{duree}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Modalités de paiement</dt><dd className="whitespace-pre-line">{c.paymentTerms || "—"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Moyens de paiement</dt><dd className="whitespace-pre-line">{c.paymentMethods || "—"}</dd></div>
          </dl>
        </SectionCard>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <SectionCard title={`Prestations (${services.length})`} flush>
          {services.length === 0 ? <p className="px-6 pb-6 text-sm text-navy-600/70">Aucune prestation listée.</p> : (
            <ul className="divide-y divide-navy-100/70">
              {services.map((sv, i) => (
                <li key={i} className="flex gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0 flex-1"><p className="font-bold text-navy">{sv.prestation}</p>{sv.contenu && <p className="text-sm text-navy-600/80">{sv.contenu}</p>}</div>
                  {sv.volume && <span className="badge-gray shrink-0 self-start">{sv.volume}</span>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={`Sommaire (${sections.length})`} flush>
          {sections.length === 0 ? <p className="px-6 pb-6 text-sm text-navy-600/70">Aucun article.</p> : (
            <ol className="grid gap-x-4 px-5 pb-4 sm:grid-cols-2 sm:px-6">
              {sections.map((s) => (
                <li key={s.key} className="flex gap-2 border-b border-navy-100/50 py-1.5 text-sm">
                  <span className="w-16 shrink-0 font-bold text-amber-800">{s.kind === "annex" ? numbers[s.key] : `Art. ${numbers[s.key]}`}</span>
                  <span className="min-w-0 truncate">{s.title}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      {write && (
        <SectionCard title="Gestion">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-2">
              <p className="font-bold text-navy">Statut</p>
              <form action={setContractStatus.bind(null, id)} className="space-y-2">
                <select name="status" className="input" defaultValue={c.status}>
                  {Object.entries(CONTRACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <details className="rounded-xl border border-navy-100 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-bold text-navy-700">Résiliation : date et motif</summary>
                  <div className="mt-2 space-y-2">
                    <label className="block"><span className="label">Date de résiliation</span><input name="terminationDate" type="date" className="input" defaultValue={c.terminationDate ?? ""} /></label>
                    <input name="terminationReason" className="input" placeholder="Motif (facultatif)" defaultValue={c.terminationReason ?? ""} />
                  </div>
                </details>
                <button className="btn-ghost btn-sm">Mettre à jour le statut</button>
              </form>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-navy">Réutiliser</p>
              <form action={duplicateContract.bind(null, id)}><button className="btn-ghost btn-sm"><Copy size={13} /> Dupliquer en brouillon</button></form>
              <form action={saveAsTemplate.bind(null, id)} className="flex flex-wrap gap-2">
                <input name="name" className="input flex-1" placeholder="Nom du modèle" />
                <button className="btn-ghost btn-sm self-center">Enregistrer comme modèle</button>
              </form>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-navy">Supprimer</p>
              {c.status === "brouillon" ? (
                <form action={deleteContract.bind(null, id)}>
                  <ConfirmButton message={`Supprimer définitivement le brouillon ${c.number} ?`}>Supprimer le brouillon</ConfirmButton>
                </form>
              ) : (
                <p className="text-sm text-navy-600/70">Seul un brouillon peut être supprimé. Pour arrêter ce contrat, passez-le en « Résilié ».</p>
              )}
            </div>
          </div>
        </SectionCard>
      )}
    </>
  );
}
