"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  AlertTriangle, ArrowDown, ArrowUp, Building2, CalendarDays, Check, Eye, ListOrdered,
  LoaderCircle, Pencil, Plus, Save, Trash2, Wallet,
} from "lucide-react";
import { CLIENT_TYPES } from "@/lib/format";
import { articleNumbers, type DefinitionRow, type Section, type ServiceRow } from "@/lib/contractModel";
import { AutoTextarea, IconBtn, Segmented, StepCard, SubHead, TextInput, TokenPalette, TokenProvider } from "./editor/parts";
import { ArticlesEditor, move, type Clause, type TemplateArticles } from "./editor/ArticlesEditor";

type ClientOpt = { id: number; name: string; type: string; acronym: string | null; nif: string | null; address: string | null; repCivility: string | null; repName: string | null; repTitle: string | null; contactName: string | null; contactRole: string | null; phone: string | null; email: string | null };
type Catalog = { id: number; name: string; description: string | null };

export type EditorState = {
  clientId: string; projectId: string; quoteId: string; templateName: string; newClient: boolean;
  title: string; subtitle: string; preamble: string;
  startDate: string; endDate: string; durationValue: string; durationUnit: string; signatureDate: string; signaturePlace: string;
  amountMode: string; monthlyAmount: string; totalAmount: string; taxMode: string;
  paymentTerms: string; paymentMethods: string; includeSignature: boolean;
  clientName: string; clientAcronym: string; clientType: string; clientAddress: string; clientNif: string;
  repCivility: string; repName: string; repTitle: string;
  contactName: string; contactRole: string; contactPhone: string; contactEmail: string;
  services: ServiceRow[]; definitions: DefinitionRow[]; sections: Section[];
};

function endFrom(s: EditorState) {
  if (!s.startDate || !s.durationValue || s.durationUnit === "end") return s.endDate;
  const n = Number(s.durationValue);
  if (!n) return s.endDate;
  const [y, m, d] = s.startDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (s.durationUnit === "months") dt.setUTCMonth(dt.getUTCMonth() + n);
  else dt.setUTCDate(dt.getUTCDate() + n);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

const amount = (v: string) => Number(String(v).replace(/[\s  ]/g, "").replace(",", ".")) || 0;
const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");
const money = (n: number) => `${fmt(n)} FDJ`;
function dfr(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const TOKEN_LABEL: Record<string, string> = {
  "client.nif": "NIF du client", "client.adresse": "adresse du client", representant: "représentant du client", "representant.nom": "nom du représentant",
  "representant.qualite": "qualité du représentant", "referent.nom": "référent", "referent.telephone": "téléphone du référent", "referent.email": "email du référent",
  "paiement.modalites": "modalités de paiement", "paiement.moyens": "moyens de paiement", signature: "image de signature (Paramètres)",
};

export function ContractEditor({
  action, initial, clients, projects, quotes, catalog, clauses, missing, contractId, asTemplate, templates = [], templateMeta, cancelHref = "/contrats",
}: {
  action: (fd: FormData) => void;
  initial: EditorState;
  clients: ClientOpt[];
  projects: { id: number; title: string; clientId: number | null }[];
  quotes: { id: number; number: string; clientId: number; subject?: string | null }[];
  catalog: Catalog[];
  clauses: Clause[];
  missing: string[];
  contractId?: number;
  asTemplate?: boolean;
  templates?: TemplateArticles[];
  templateMeta?: { name: string; description: string };
  cancelHref?: string;
}) {
  const [s, set] = useState(initial);
  const [warn, setWarn] = useState(missing);
  const [previewing, setPreviewing] = useState(false);
  const [clientError, setClientError] = useState(false);
  const [editClient, setEditClient] = useState(false);
  const [active, setActive] = useState("");
  const dirty = useRef(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const patch = (p: Partial<EditorState> | ((cur: EditorState) => Partial<EditorState>)) => {
    dirty.current = true;
    set((cur) => ({ ...cur, ...(typeof p === "function" ? p(cur) : p) }));
  };
  const end = endFrom(s);
  const months = s.durationUnit === "months" ? Number(s.durationValue) || 0 : 0;
  const total = s.amountMode === "monthly" && months ? months * amount(s.monthlyAmount) : amount(s.totalAmount);
  const payload = useMemo(
    () => ({ ...s, endDate: end, totalAmount: total, clientId: Number(s.clientId) || null, projectId: Number(s.projectId) || null, quoteId: Number(s.quoteId) || null }),
    [s, end, total],
  );
  const numbers = useMemo(() => articleNumbers(s.sections), [s.sections]);
  const nArticles = s.sections.filter((x) => x.kind !== "annex").length;
  const nAnnexes = s.sections.length - nArticles;
  const clientMode: "existing" | "new" | "none" = s.clientId && !s.newClient ? "existing" : s.newClient || s.clientName ? "new" : "none";

  const steps = asTemplate
    ? [
        { id: "objet", label: "Objet", done: !!s.title.trim() },
        { id: "duree", label: "Durée & montant", done: true },
        { id: "articles", label: "Articles", done: s.sections.length > 0 },
      ]
    : [
        { id: "client", label: "Client", done: !!s.clientName.trim() },
        { id: "objet", label: "Objet & prestations", done: !!s.title.trim() && s.services.length > 0 },
        { id: "duree", label: "Durée & montant", done: !!s.startDate && total > 0 },
        { id: "articles", label: "Articles", done: s.sections.length > 0 },
        { id: "signature", label: "Signature", done: !!s.signaturePlace.trim() },
      ];
  const doneCount = steps.filter((x) => x.done).length;

  // Étape visible → surlignée dans la navigation.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-step]")];
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive((vis[0].target as HTMLElement).dataset.step ?? "");
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [asTemplate]);

  useEffect(() => {
    if (active) document.querySelector(`[data-pill="${active}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  // Alerte avant de quitter avec des modifications non enregistrées ; Ctrl/Cmd+S enregistre.
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current && !submitting.current) { e.preventDefault(); e.returnValue = ""; }
    };
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); formRef.current?.requestSubmit(); }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("beforeunload", before); window.removeEventListener("keydown", key); };
  }, []);

  function pickClient(id: string) {
    setClientError(false);
    if (id === "new") {
      setEditClient(true);
      return patch({
        clientId: "", newClient: true, clientName: "", clientAcronym: "", clientType: "entreprise", clientAddress: "", clientNif: "",
        repCivility: "", repName: "", repTitle: "", contactName: "", contactRole: "", contactPhone: "", contactEmail: "", projectId: "", quoteId: "",
      });
    }
    const c = clients.find((x) => String(x.id) === id);
    if (!c) return patch({ clientId: "", newClient: false });
    setEditClient(false);
    patch((cur) => ({
      clientId: id, newClient: false,
      clientName: c.name, clientAcronym: c.acronym ?? "", clientType: c.type, clientAddress: c.address ?? "", clientNif: c.nif ?? "",
      repCivility: c.repCivility ?? "", repName: c.repName ?? "", repTitle: c.repTitle ?? "",
      contactName: c.contactName ?? "", contactRole: c.contactRole ?? "", contactPhone: c.phone ?? "", contactEmail: c.email ?? "",
      projectId: projects.some((p) => String(p.id) === cur.projectId && String(p.clientId) === id) ? cur.projectId : "",
      quoteId: quotes.some((q) => String(q.id) === cur.quoteId && String(q.clientId) === id) ? cur.quoteId : "",
    }));
  }

  async function preview() {
    setPreviewing(true);
    // Fenêtre ouverte tout de suite (sinon bloquée par le navigateur après l'attente).
    const w = window.open("", "_blank");
    if (w) w.document.write("<title>Aperçu du contrat</title><p style=\"font:16px system-ui;padding:2rem;color:#2C3E50\">Génération de l’aperçu…</p>");
    try {
      const res = await fetch("/api/pdf/contrat/apercu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.pdf) throw new Error("pdf");
      setWarn(data.missing || []);
      const bin = atob(data.pdf);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      if (w && !w.closed) w.location.href = url;
      else window.open(url, "_blank");
    } catch {
      w?.close();
      setWarn(["Aperçu indisponible"]);
    } finally {
      setPreviewing(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!asTemplate && !s.clientName.trim()) {
      e.preventDefault();
      setClientError(true);
      setEditClient(true);
      document.getElementById("client")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    submitting.current = true;
  }

  const clientProjects = projects.filter((p) => !s.clientId || String(p.clientId) === s.clientId);
  const clientQuotes = quotes.filter((q) => !s.clientId || String(q.clientId) === s.clientId);
  const setService = (i: number, p: Partial<ServiceRow>) => patch((cur) => ({ services: cur.services.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const setDef = (i: number, p: Partial<DefinitionRow>) => patch((cur) => ({ definitions: cur.definitions.map((r, j) => (j === i ? { ...r, ...p } : r)) }));
  const warnLabels = warn.map((k) => TOKEN_LABEL[k] ?? k);
  let n = 0;

  return (
    <TokenProvider>
      <form ref={formRef} action={action} onSubmit={onSubmit} onChange={() => { dirty.current = true; }}>
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />

        {/* Navigation entre étapes */}
        <nav
          aria-label="Étapes du contrat"
          className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-3 mb-5 border-b border-navy-100/70 bg-[#f6f7f9]/90 px-3 py-2 backdrop-blur sm:-mx-8 sm:px-8 lg:top-14 lg:-mx-10 lg:px-10"
        >
          <ol className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {steps.map((st, i) => (
              <li key={st.id} className="shrink-0">
                <a
                  href={`#${st.id}`}
                  data-pill={st.id}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
                    active === st.id ? "border-navy bg-navy text-white" : "border-navy-100 bg-white text-navy-700 hover:border-navy-300"
                  }`}
                >
                  <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${st.done ? "bg-emerald-500 text-white" : active === st.id ? "bg-white/20" : "bg-navy-50 text-navy-700"}`}>
                    {st.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  {st.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            {asTemplate && (
              <section className="card card-pad grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="label">Nom du modèle</span><input name="name" className="input" defaultValue={templateMeta?.name ?? s.templateName} required /></label>
                <label className="block"><span className="label">Description (affichée au choix du modèle)</span><input name="description" className="input" defaultValue={templateMeta?.description ?? ""} placeholder="Ex. : Événement ponctuel, montant unique" /></label>
              </section>
            )}

            {/* 1. Client */}
            {!asTemplate && (
              <StepCard
                id="client" n={++n} title="Client" done={steps[0].done}
                hint="Choisissez un client : ses coordonnées (adresse, NIF, représentant…) sont reprises automatiquement."
              >
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="block">
                    <span className="label">Client du contrat</span>
                    <select
                      className={`input ${clientError ? "border-red-400 ring-2 ring-red-100" : ""}`}
                      value={clientMode === "existing" ? s.clientId : clientMode === "new" ? "new" : ""}
                      onChange={(e) => pickClient(e.target.value)}
                    >
                      <option value="">— Choisir un client —</option>
                      <option value="new">+ Nouveau client (créé à l’enregistrement)</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.acronym ? ` (${c.acronym})` : ""}</option>)}
                    </select>
                  </label>
                  {clientMode === "existing" && !editClient && (
                    <button type="button" className="btn-ghost" onClick={() => setEditClient(true)}><Pencil size={15} /> Modifier les informations</button>
                  )}
                </div>
                {clientError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">Choisissez un client ou saisissez le nom du nouveau client avant d’enregistrer.</p>}

                {clientMode === "existing" && !editClient && <ClientSummary s={s} onEdit={() => setEditClient(true)} />}

                {(clientMode === "new" || editClient) && (
                  <div className="space-y-5">
                    {clientMode === "existing" && (
                      <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">Ces informations seront aussi mises à jour sur la fiche du client à l’enregistrement.</p>
                    )}
                    <div className="space-y-3">
                      <SubHead>Identité</SubHead>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextInput label="Nom / raison sociale *" value={s.clientName} onChange={(v) => { setClientError(false); patch({ clientName: v }); }} invalid={clientError} />
                        <TextInput label="Sigle" value={s.clientAcronym} onChange={(v) => patch({ clientAcronym: v })} placeholder="Ex. : ONTD" />
                        <label className="block"><span className="label">Forme / nature</span>
                          <select className="input" value={s.clientType} onChange={(e) => patch({ clientType: e.target.value })}>
                            {Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </label>
                        <TextInput label="NIF" value={s.clientNif} onChange={(v) => patch({ clientNif: v })} />
                        <TextInput label="Adresse du siège" value={s.clientAddress} onChange={(v) => patch({ clientAddress: v })} className="sm:col-span-2" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <SubHead>Représentant légal (signataire)</SubHead>
                      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
                        <label className="block"><span className="label">Civilité</span>
                          <select className="input" value={s.repCivility} onChange={(e) => patch({ repCivility: e.target.value })}>
                            <option value="">—</option>
                            {["M.", "Mme", "Dr", "Pr"].map((c) => <option key={c} value={c}>{c}</option>)}
                            {s.repCivility && !["M.", "Mme", "Dr", "Pr"].includes(s.repCivility) && <option value={s.repCivility}>{s.repCivility}</option>}
                          </select>
                        </label>
                        <TextInput label="Nom" value={s.repName} onChange={(v) => patch({ repName: v })} />
                        <TextInput label="Qualité" value={s.repTitle} onChange={(v) => patch({ repTitle: v })} placeholder="Directeur général, Gérant…" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <SubHead>Référent au quotidien</SubHead>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextInput label="Nom" value={s.contactName} onChange={(v) => patch({ contactName: v })} />
                        <TextInput label="Fonction" value={s.contactRole} onChange={(v) => patch({ contactRole: v })} />
                        <TextInput label="Téléphone" type="tel" value={s.contactPhone} onChange={(v) => patch({ contactPhone: v })} />
                        <TextInput label="Email" type="email" value={s.contactEmail} onChange={(v) => patch({ contactEmail: v })} />
                      </div>
                    </div>
                    {clientMode === "existing" && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditClient(false)}>Replier</button>
                    )}
                  </div>
                )}
              </StepCard>
            )}

            {/* 2. Objet & prestations */}
            <StepCard id="objet" n={++n} title="Objet & prestations" done={steps.find((x) => x.id === "objet")?.done}
              hint="L’intitulé apparaît en couverture ; les prestations alimentent le tableau de l’article « Description des prestations ».">
              {!asTemplate && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="label">Projet lié (facultatif)</span>
                    <select className="input" value={s.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
                      <option value="">— Aucun —</option>
                      {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </label>
                  <label className="block"><span className="label">Devis lié (facultatif)</span>
                    <select className="input" value={s.quoteId} onChange={(e) => patch({ quoteId: e.target.value })}>
                      <option value="">— Aucun —</option>
                      {clientQuotes.map((q) => <option key={q.id} value={q.id}>{q.number}{q.subject ? ` — ${q.subject}` : ""}</option>)}
                    </select>
                  </label>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Intitulé de couverture</span>
                  <AutoTextarea ariaLabel="Intitulé" value={s.title} onChange={(v) => patch({ title: v })} min={2} max={4} placeholder={"Production audiovisuelle\net communication digitale"} />
                  <span className="mt-1 block text-[12px] text-navy-600/70">Chaque ligne s’affiche sur une ligne de la couverture.</span>
                </label>
                <label className="block">
                  <span className="label">Sous-titre</span>
                  <AutoTextarea ariaLabel="Sous-titre" value={s.subtitle} onChange={(v) => patch({ subtitle: v })} min={2} max={4} />
                </label>
              </div>
              <details className="group rounded-xl border border-navy-100" open={!s.preamble}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="font-bold text-navy">Préambule <span className="font-normal text-navy-600/70">— le contexte avant les articles</span></span>
                  <span className="text-[12px] font-bold text-navy-600/70 group-open:hidden">Afficher</span>
                </summary>
                <div className="space-y-2 border-t border-navy-100 p-3">
                  <AutoTextarea ariaLabel="Préambule" value={s.preamble} onChange={(v) => patch({ preamble: v })} min={4} />
                  <TokenPalette />
                </div>
              </details>

              <div className="space-y-3">
                <SubHead aside={<span className="text-[12px] text-navy-600/70">{s.services.length} ligne{s.services.length > 1 ? "s" : ""}</span>}>Prestations incluses</SubHead>
                {s.services.length > 0 && (
                  <div className="space-y-2">
                    <div className="hidden gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-navy-600/60 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_9rem_6.5rem]">
                      <span>Prestation</span><span>Contenu</span><span>Volume</span><span />
                    </div>
                    {s.services.map((row, i) => (
                      <div key={i} className="grid gap-2 rounded-xl border border-navy-100 bg-white p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_9rem_6.5rem] md:border-0 md:bg-transparent md:p-0">
                        <input className="input font-bold" aria-label="Prestation" placeholder="Prestation" value={row.prestation} onChange={(e) => setService(i, { prestation: e.target.value })} />
                        <input className="input" aria-label="Contenu" placeholder="Contenu, livrables…" value={row.contenu} onChange={(e) => setService(i, { contenu: e.target.value })} />
                        <input className="input" aria-label="Volume" placeholder="4 / mois" value={row.volume} onChange={(e) => setService(i, { volume: e.target.value })} />
                        <span className="flex justify-end gap-1 md:items-center">
                          <IconBtn label="Monter" disabled={i === 0} onClick={() => patch((cur) => ({ services: move(cur.services, i, -1) }))}><ArrowUp size={15} /></IconBtn>
                          <IconBtn label="Descendre" disabled={i === s.services.length - 1} onClick={() => patch((cur) => ({ services: move(cur.services, i, 1) }))}><ArrowDown size={15} /></IconBtn>
                          <IconBtn label="Supprimer la ligne" tone="danger" onClick={() => patch((cur) => ({ services: cur.services.filter((_, j) => j !== i) }))}><Trash2 size={15} /></IconBtn>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {s.services.length === 0 && <p className="rounded-xl border-2 border-dashed border-navy-100 px-4 py-4 text-center text-sm text-navy-600/75">Aucune prestation. Ajoutez une ligne ou piochez dans le catalogue.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => patch((cur) => ({ services: [...cur.services, { prestation: "", contenu: "", volume: "" }] }))}><Plus size={14} /> Ajouter une ligne</button>
                  {catalog.length > 0 && (
                    <select
                      className="input h-8 w-auto max-w-full rounded-lg text-[12px] font-bold"
                      value=""
                      aria-label="Ajouter depuis le catalogue"
                      onChange={(e) => {
                        const item = catalog.find((c) => String(c.id) === e.target.value);
                        if (item) patch((cur) => ({ services: [...cur.services, { prestation: item.name, contenu: item.description ?? "", volume: "" }] }));
                      }}
                    >
                      <option value="">+ Depuis le catalogue…</option>
                      {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <details className="rounded-xl border border-navy-100" open={s.definitions.length > 0 || s.sections.some((x) => x.key === "definitions")}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span className="font-bold text-navy">Définitions <span className="font-normal text-navy-600/70">— facultatif, pour l’article « Définitions »</span></span>
                  <span className="text-[12px] font-bold text-navy-600/70">{s.definitions.length} terme{s.definitions.length > 1 ? "s" : ""}</span>
                </summary>
                <div className="space-y-2 border-t border-navy-100 p-3">
                  {s.definitions.map((row, i) => (
                    <div key={i} className="grid gap-2 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                      <input className="input font-bold" value={row.term} placeholder="Terme" aria-label="Terme" onChange={(e) => setDef(i, { term: e.target.value })} />
                      <input className="input" value={row.definition} placeholder="Définition" aria-label="Définition" onChange={(e) => setDef(i, { definition: e.target.value })} />
                      <span className="flex justify-end"><IconBtn label="Supprimer le terme" tone="danger" onClick={() => patch((cur) => ({ definitions: cur.definitions.filter((_, j) => j !== i) }))}><Trash2 size={15} /></IconBtn></span>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => patch((cur) => ({ definitions: [...cur.definitions, { term: "", definition: "" }] }))}><Plus size={14} /> Ajouter un terme</button>
                </div>
              </details>
            </StepCard>

            {/* 3. Durée & montant */}
            <StepCard id="duree" n={++n} title="Durée & montant" done={steps.find((x) => x.id === "duree")?.done}
              hint={asTemplate ? "Valeurs proposées par défaut à la création d’un contrat." : "La date de fin et le montant total se calculent tout seuls."}>
              <div className="space-y-3">
                <SubHead>Durée</SubHead>
                <div className="flex flex-wrap items-end gap-3">
                  {!asTemplate && (
                    <TextInput label="Début des prestations" type="date" value={s.startDate} onChange={(v) => patch({ startDate: v })} className="w-full sm:w-48" invalid={!s.startDate} />
                  )}
                  <div>
                    <span className="label">Durée</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {s.durationUnit !== "end" && (
                        <input className="input w-24" type="number" min={1} inputMode="numeric" aria-label="Durée" value={s.durationValue} onChange={(e) => patch({ durationValue: e.target.value })} />
                      )}
                      <Segmented
                        label="Unité de durée"
                        value={s.durationUnit as "months" | "days" | "end"}
                        onChange={(v) => patch({ durationUnit: v })}
                        options={[{ value: "months", label: "mois" }, { value: "days", label: "jours" }, { value: "end", label: "Date de fin libre" }]}
                      />
                    </div>
                  </div>
                  {!asTemplate && (s.durationUnit === "end" ? (
                    <TextInput label="Fin" type="date" value={s.endDate} onChange={(v) => patch({ endDate: v })} className="w-full sm:w-48" />
                  ) : (
                    <div className="min-w-[10rem]">
                      <span className="label">Fin (calculée)</span>
                      <p className="flex h-10 items-center rounded-xl border border-dashed border-navy-200 bg-navy-50/40 px-3 font-bold text-navy">
                        {end ? dfr(end) : <span className="font-normal text-navy-600/60">indiquez début + durée</span>}
                      </p>
                    </div>
                  ))}
                </div>
                {!asTemplate && s.durationUnit === "months" && s.startDate && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[12px] font-bold text-navy-600/70">Raccourcis :</span>
                    {[1, 3, 6, 12].map((m) => (
                      <button key={m} type="button" onClick={() => patch({ durationValue: String(m) })}
                        className={`rounded-full border px-2.5 py-0.5 text-[12px] font-bold ${String(m) === s.durationValue ? "border-navy bg-navy text-white" : "border-navy-200 bg-white text-navy-700 hover:border-navy-400"}`}>
                        {m} mois
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <SubHead>Montant</SubHead>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    ["monthly", "Forfait mensuel", "Un montant chaque mois × la durée"],
                    ["flat", "Montant unique", "Un prix global pour la prestation"],
                  ] as const).map(([v, l, h]) => (
                    <button key={v} type="button" onClick={() => patch({ amountMode: v })} aria-pressed={s.amountMode === v}
                      className={`rounded-xl border-2 px-4 py-3 text-left transition ${s.amountMode === v ? "border-gold bg-gold-50" : "border-navy-100 bg-white hover:border-navy-200"}`}>
                      <span className="flex items-center gap-2 font-bold text-navy">
                        <span className={`grid h-4 w-4 place-items-center rounded-full border-2 ${s.amountMode === v ? "border-gold-600" : "border-navy-200"}`}>
                          {s.amountMode === v && <span className="h-2 w-2 rounded-full bg-gold-600" />}
                        </span>
                        {l}
                      </span>
                      <span className="mt-0.5 block pl-6 text-[12px] text-navy-600/75">{h}</span>
                    </button>
                  ))}
                </div>
                {!asTemplate && (
                  <div className="grid items-end gap-3 sm:grid-cols-2">
                    {s.amountMode === "monthly" ? (
                      <TextInput label="Forfait mensuel" suffix="FDJ" inputMode="numeric" value={s.monthlyAmount} onChange={(v) => patch({ monthlyAmount: v })} placeholder="150 000"
                        hint={s.durationUnit !== "months" ? "Le total se calcule automatiquement quand la durée est en mois. Sinon, saisissez-le à droite." : undefined} />
                    ) : (
                      <TextInput label="Montant forfaitaire" suffix="FDJ" inputMode="numeric" value={s.totalAmount} onChange={(v) => patch({ totalAmount: v })} placeholder="500 000" />
                    )}
                    {s.amountMode === "monthly" && s.durationUnit !== "months" ? (
                      <TextInput label="Montant total" suffix="FDJ" inputMode="numeric" value={s.totalAmount} onChange={(v) => patch({ totalAmount: v })} />
                    ) : (
                      <div className="rounded-xl bg-navy px-4 py-2.5 text-white">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-white/70">Total du contrat</p>
                        <p className="text-xl font-bold tabular-nums">{money(total)}</p>
                        {s.amountMode === "monthly" && months > 0 && <p className="text-[12px] text-white/70">{fmt(amount(s.monthlyAmount))} × {months} mois</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!asTemplate && (
                <div className="space-y-3">
                  <SubHead>Paiement</SubHead>
                  <div>
                    <span className="label">Mention fiscale</span>
                    <Segmented label="Mention fiscale" value={s.taxMode as "unspecified" | "ht" | "ttc"} onChange={(v) => patch({ taxMode: v })}
                      options={[{ value: "unspecified", label: "Non précisée" }, { value: "ht", label: "HT" }, { value: "ttc", label: "TTC" }]} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block"><span className="label">Modalités de paiement</span><AutoTextarea ariaLabel="Modalités de paiement" value={s.paymentTerms} onChange={(v) => patch({ paymentTerms: v })} min={2} max={6} /></label>
                    <label className="block"><span className="label">Moyens de paiement</span><AutoTextarea ariaLabel="Moyens de paiement" value={s.paymentMethods} onChange={(v) => patch({ paymentMethods: v })} min={2} max={6} /></label>
                  </div>
                </div>
              )}
            </StepCard>

            {/* 4. Articles */}
            <StepCard id="articles" n={++n} title="Articles et annexes" done={s.sections.length > 0}
              hint="Cliquez sur un article pour le modifier. La numérotation et les renvois se recalculent automatiquement.">
              <ArticlesEditor
                sections={s.sections}
                numbers={numbers}
                clauses={clauses}
                templates={templates}
                onChange={(fn) => patch((cur) => ({ sections: fn(cur.sections) }))}
              />
            </StepCard>

            {/* 5. Signature */}
            {!asTemplate && (
              <StepCard id="signature" n={++n} title="Signature" done={steps.find((x) => x.id === "signature")?.done}
                hint="Laissez la date vide pour obtenir « ____ / ____ » à compléter à la main.">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Date de signature" type="date" value={s.signatureDate} onChange={(v) => patch({ signatureDate: v })} />
                  <TextInput label="Lieu de signature" value={s.signaturePlace} onChange={(v) => patch({ signaturePlace: v })} />
                </div>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 transition ${s.includeSignature ? "border-gold bg-gold-50" : "border-navy-100"}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-[#2C3E50]" checked={s.includeSignature} onChange={(e) => patch({ includeSignature: e.target.checked })} />
                  <span>
                    <span className="block font-bold text-navy">Apposer la signature et le cachet de Pixel Nomade</span>
                    <span className="block text-[12px] text-navy-600/75">Image définie dans les Paramètres. Décochez pour signer à la main.</span>
                  </span>
                </label>
              </StepCard>
            )}
          </div>

          {/* Récapitulatif (bureau) */}
          <aside className="hidden xl:sticky xl:top-32 xl:block">
            <div className="card overflow-hidden">
              <div className="bg-navy px-5 py-4 text-white">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">{asTemplate ? "Modèle" : "Récapitulatif"}</p>
                <p className="mt-1 line-clamp-2 font-bold leading-snug">{s.title.replaceAll("\n", " ") || "Contrat sans intitulé"}</p>
                {s.templateName && !asTemplate && <p className="mt-1 text-[12px] text-white/60">{s.templateName}</p>}
              </div>
              <dl className="space-y-3 px-5 py-4 text-sm">
                {!asTemplate && (
                  <Recap icon={<Building2 size={15} />} label="Client">
                    {s.clientName || <span className="text-amber-700">À choisir</span>}
                    {clientMode === "new" && s.clientName && <span className="ml-1 badge-blue">nouveau</span>}
                  </Recap>
                )}
                <Recap icon={<CalendarDays size={15} />} label="Période">
                  {asTemplate
                    ? s.durationUnit === "end" ? "Date de fin libre" : `${s.durationValue || "—"} ${s.durationUnit === "days" ? "jours" : "mois"}`
                    : s.startDate ? <>{dfr(s.startDate)} → {end ? dfr(end) : "…"}{s.durationUnit !== "end" && s.durationValue && <span className="text-navy-600/70"> · {s.durationValue} {s.durationUnit === "days" ? "j" : "mois"}</span>}</> : <span className="text-amber-700">Date de début à indiquer</span>}
                </Recap>
                <Recap icon={<Wallet size={15} />} label={asTemplate ? "Montant" : s.amountMode === "monthly" ? "Forfait mensuel" : "Montant unique"}>
                  {asTemplate ? (s.amountMode === "monthly" ? "Forfait mensuel" : "Montant unique") : (
                    <>
                      <span className="text-lg font-bold tabular-nums text-navy">{money(total)}</span>
                      {s.amountMode === "monthly" && months > 0 && <span className="block text-[12px] text-navy-600/70">{fmt(amount(s.monthlyAmount))} FDJ × {months} mois</span>}
                      <span className="block text-[12px] text-navy-600/70">{s.taxMode === "ht" ? "Hors taxes" : s.taxMode === "ttc" ? "TTC" : "Mention fiscale non précisée"}</span>
                    </>
                  )}
                </Recap>
                <Recap icon={<ListOrdered size={15} />} label="Contenu">
                  {nArticles} article{nArticles > 1 ? "s" : ""}{nAnnexes > 0 && `, ${nAnnexes} annexe${nAnnexes > 1 ? "s" : ""}`} · {s.services.length} prestation{s.services.length > 1 ? "s" : ""}
                </Recap>
              </dl>
              <div className="border-t border-navy-100 px-5 py-3">
                <div className="mb-1.5 flex items-center justify-between text-[12px] font-bold text-navy-600/80">
                  <span>Avancement</span><span>{doneCount}/{steps.length}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-navy-50"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
              </div>
              {warnLabels.length > 0 && <MissingNote labels={warnLabels} />}
              <div className="space-y-2 border-t border-navy-100 px-5 py-4">
                <SaveButton label={asTemplate ? "Enregistrer le modèle" : contractId ? "Enregistrer" : "Créer le contrat"} full />
                {!asTemplate && (
                  <button className="btn-gold w-full" type="button" onClick={preview} disabled={previewing}>
                    {previewing ? <LoaderCircle size={16} className="animate-spin" /> : <Eye size={16} />} {previewing ? "Génération…" : "Aperçu PDF"}
                  </button>
                )}
                <Link href={cancelHref} className="block pt-1 text-center text-[13px] font-bold text-navy-600/70 hover:text-navy">Annuler</Link>
                <p className="text-center text-[11px] text-navy-600/50">Astuce : Ctrl/⌘ + S pour enregistrer</p>
              </div>
            </div>
          </aside>
        </div>

        {/* Barre d'actions (mobile / tablette) */}
        <div className="sticky bottom-0 z-10 -mx-3 mt-6 border-t border-navy-100 bg-white/95 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_-24px_rgba(24,34,44,0.6)] backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:hidden">
          {warnLabels.length > 0 && <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-amber-800"><AlertTriangle size={14} /> À compléter : {warnLabels.join(", ")}</p>}
          <div className="flex items-center gap-2">
            {!asTemplate && (
              <div className="mr-auto min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">Total</p>
                <p className="truncate font-bold tabular-nums text-navy">{money(total)}</p>
              </div>
            )}
            {!asTemplate && (
              <button className="btn-gold" type="button" onClick={preview} disabled={previewing} aria-label="Aperçu PDF">
                {previewing ? <LoaderCircle size={16} className="animate-spin" /> : <Eye size={16} />}<span className="max-sm:hidden">Aperçu PDF</span><span className="sm:hidden">Aperçu</span>
              </button>
            )}
            <SaveButton label={asTemplate ? "Enregistrer le modèle" : contractId ? "Enregistrer" : "Créer"} />
          </div>
        </div>
      </form>
    </TokenProvider>
  );
}

function Recap({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">{label}</dt>
        <dd className="break-words text-navy-900">{children}</dd>
      </div>
    </div>
  );
}

function MissingNote({ labels }: { labels: string[] }) {
  return (
    <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-[13px] text-amber-900">
      <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={14} /> Laissé en blanc (______) dans le PDF</p>
      <p className="mt-1">{labels.join(", ")}</p>
    </div>
  );
}

function SaveButton({ label, full }: { label: string; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className={`btn-primary ${full ? "w-full" : ""}`} type="submit" disabled={pending}>
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} {pending ? "Enregistrement…" : label}
    </button>
  );
}

function ClientSummary({ s, onEdit }: { s: EditorState; onEdit: () => void }) {
  const rep = [s.repCivility, s.repName].filter(Boolean).join(" ");
  const rows: [string, string, boolean][] = [
    ["Forme", CLIENT_TYPES[s.clientType] ?? s.clientType, false],
    ["NIF", s.clientNif, true],
    ["Adresse", s.clientAddress, true],
    ["Représentant", [rep, s.repTitle].filter(Boolean).join(", "), true],
    ["Référent", [s.contactName, s.contactRole, s.contactPhone, s.contactEmail].filter(Boolean).join(" · "), false],
  ];
  const holes = rows.filter(([, v, req]) => req && !v).length;
  return (
    <div className="rounded-xl border border-navy-100 bg-navy-50/40 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-navy ring-1 ring-navy-100"><Building2 size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy">{s.clientName}{s.clientAcronym && <span className="font-normal text-navy-600/70"> ({s.clientAcronym})</span>}</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {rows.map(([k, v, req]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-navy-600/60">{k}</dt>
                <dd className={`break-words ${v ? "text-navy-900" : req ? "font-bold text-amber-700" : "text-navy-600/50"}`}>{v || (req ? "À compléter" : "—")}</dd>
              </div>
            ))}
          </dl>
          {holes > 0 && (
            <button type="button" onClick={onEdit} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-amber-800 hover:underline">
              <AlertTriangle size={14} /> {holes} information{holes > 1 ? "s" : ""} manquante{holes > 1 ? "s" : ""} dans le contrat — compléter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
