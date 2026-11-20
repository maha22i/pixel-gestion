"use client";
import { useMemo, useState } from "react";
import { CLIENT_TYPES } from "@/lib/format";
import type { Block, DefinitionRow, Section, ServiceRow } from "@/lib/contractModel";

type ClientOpt = { id: number; name: string; type: string; acronym: string | null; nif: string | null; address: string | null; repCivility: string | null; repName: string | null; repTitle: string | null; contactName: string | null; contactRole: string | null; phone: string | null; email: string | null };
type Catalog = { id: number; name: string; description: string | null };
type Clause = { key: string; kind: string; title: string; blocks: Block[] };

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

function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function ContractEditor({
  action, initial, clients, projects, quotes, catalog, clauses,   missing, contractId, asTemplate,
}: {
  action: (fd: FormData) => void;
  initial: EditorState;
  clients: ClientOpt[];
  projects: { id: number; title: string; clientId: number | null }[];
  quotes: { id: number; number: string; clientId: number }[];
  catalog: Catalog[];
  clauses: Clause[];
  missing: string[];
  contractId?: number;
  asTemplate?: boolean;
}) {
  const [s, set] = useState(initial);
  const [warn, setWarn] = useState(missing);
  const [previewing, setPreviewing] = useState(false);
  const patch = (p: Partial<EditorState>) => set((cur) => ({ ...cur, ...p }));
  const end = endFrom(s);
  const total = s.amountMode === "monthly" && s.durationUnit === "months" && Number(s.durationValue)
    ? Number(s.durationValue) * (Number(s.monthlyAmount) || 0)
    : Number(s.totalAmount) || 0;
  const payload = useMemo(() => ({ ...s, endDate: end, totalAmount: total, clientId: Number(s.clientId) || null, projectId: Number(s.projectId) || null, quoteId: Number(s.quoteId) || null }), [s, end, total]);

  function pickClient(id: string) {
    const c = clients.find((x) => String(x.id) === id);
    if (!c) return patch({ clientId: id, newClient: false });
    patch({
      clientId: id, newClient: false,
      clientName: c.name, clientAcronym: c.acronym ?? "", clientType: c.type, clientAddress: c.address ?? "", clientNif: c.nif ?? "",
      repCivility: c.repCivility ?? "", repName: c.repName ?? "", repTitle: c.repTitle ?? "",
      contactName: c.contactName ?? "", contactRole: c.contactRole ?? "", contactPhone: c.phone ?? "", contactEmail: c.email ?? "",
    });
  }

  async function preview() {
    setPreviewing(true);
    const res = await fetch("/api/pdf/contrat/apercu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => null);
    setPreviewing(false);
    if (!res.ok || !data?.pdf) { setWarn(["Aperçu indisponible"]); return; }
    setWarn(data.missing || []);
    const bin = atob(data.pdf);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    window.open(url, "_blank");
  }

  function addClause(key: string) {
    const c = clauses.find((x) => x.key === key);
    if (!c || s.sections.some((x) => x.key === key)) return;
    patch({ sections: [...s.sections, { key: c.key, kind: c.kind === "annex" ? "annex" : "article", title: c.title, blocks: c.blocks }] });
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {asTemplate && (
        <section className="card card-pad grid sm:grid-cols-2 gap-3">
          <label>Nom du modèle<input name="name" className="input mt-1" defaultValue={s.templateName} required /></label>
          <label>Description<input name="description" className="input mt-1" /></label>
        </section>
      )}
      {warn.length > 0 && (
        <p className="rounded-lg bg-amber-50 text-amber-900 px-4 py-2 font-bold">
          Jetons sans valeur, remplacés par ______ dans le PDF : {warn.join(", ")}
        </p>
      )}

      <section className="card card-pad space-y-3">
        <p className="h-section">Client</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">Client existant
            <select className="input mt-1" value={s.newClient ? "" : s.clientId} onChange={(e) => pickClient(e.target.value)}>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-end gap-2 font-bold text-navy pb-2">
            <input type="checkbox" checked={s.newClient} onChange={(e) => patch({ newClient: e.target.checked, clientId: "" })} />
            Créer un nouveau client
          </label>
          <Field label="Nom / raison sociale" value={s.clientName} onChange={(v) => patch({ clientName: v })} />
          <Field label="Sigle" value={s.clientAcronym} onChange={(v) => patch({ clientAcronym: v })} />
          <label className="block">Forme / nature
            <select className="input mt-1" value={s.clientType} onChange={(e) => patch({ clientType: e.target.value })}>
              {Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <Field label="NIF" value={s.clientNif} onChange={(v) => patch({ clientNif: v })} />
          <Field label="Adresse du siège" value={s.clientAddress} onChange={(v) => patch({ clientAddress: v })} wide />
          <Field label="Civilité du représentant" value={s.repCivility} onChange={(v) => patch({ repCivility: v })} />
          <Field label="Nom du représentant" value={s.repName} onChange={(v) => patch({ repName: v })} />
          <Field label="Qualité (Directeur général, Gérant…)" value={s.repTitle} onChange={(v) => patch({ repTitle: v })} />
          <Field label="Référent" value={s.contactName} onChange={(v) => patch({ contactName: v })} />
          <Field label="Fonction du référent" value={s.contactRole} onChange={(v) => patch({ contactRole: v })} />
          <Field label="Téléphone" value={s.contactPhone} onChange={(v) => patch({ contactPhone: v })} />
          <Field label="Email" value={s.contactEmail} onChange={(v) => patch({ contactEmail: v })} />
        </div>
      </section>

      <section className="card card-pad space-y-3">
        <p className="h-section">Contrat</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">Projet
            <select className="input mt-1" value={s.projectId} onChange={(e) => patch({ projectId: e.target.value })}>
              <option value="">—</option>
              {projects.filter((p) => !s.clientId || String(p.clientId) === s.clientId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </label>
          <label className="block">Devis
            <select className="input mt-1" value={s.quoteId} onChange={(e) => patch({ quoteId: e.target.value })}>
              <option value="">—</option>
              {quotes.filter((q) => !s.clientId || String(q.clientId) === s.clientId).map((q) => <option key={q.id} value={q.id}>{q.number}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">Intitulé de couverture (une ligne = une ligne)
            <textarea className="input mt-1" rows={2} value={s.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <Field label="Sous-titre" value={s.subtitle} onChange={(v) => patch({ subtitle: v })} wide />
          <label className="block sm:col-span-2">Préambule
            <textarea className="input mt-1" rows={5} value={s.preamble} onChange={(e) => patch({ preamble: e.target.value })} />
          </label>
          <Field label="Début" value={s.startDate} onChange={(v) => patch({ startDate: v })} type="date" />
          <label className="block">Durée
            <span className="flex gap-2 mt-1">
              <input className="input" type="number" min={1} disabled={s.durationUnit === "end"} value={s.durationValue} onChange={(e) => patch({ durationValue: e.target.value })} />
              <select className="input" value={s.durationUnit} onChange={(e) => patch({ durationUnit: e.target.value })}>
                <option value="months">mois</option>
                <option value="days">jours</option>
                <option value="end">date de fin libre</option>
              </select>
            </span>
          </label>
          <Field label="Fin" value={s.durationUnit === "end" ? s.endDate : end} onChange={(v) => patch({ endDate: v })} type="date" />
          <Field label="Date de signature (vide = ____)" value={s.signatureDate} onChange={(v) => patch({ signatureDate: v })} type="date" />
          <Field label="Lieu de signature" value={s.signaturePlace} onChange={(v) => patch({ signaturePlace: v })} />
          <label className="block">Montant
            <select className="input mt-1" value={s.amountMode} onChange={(e) => patch({ amountMode: e.target.value })}>
              <option value="monthly">Forfait mensuel</option>
              <option value="flat">Montant forfaitaire unique</option>
            </select>
          </label>
          {s.amountMode === "monthly" ? <Field label="Forfait mensuel (FDJ)" value={s.monthlyAmount} onChange={(v) => patch({ monthlyAmount: v })} /> : <Field label="Montant unique (FDJ)" value={s.totalAmount} onChange={(v) => patch({ totalAmount: v })} />}
          <p className="text-sm font-bold text-navy">Total : {total.toLocaleString("fr-FR")} FDJ</p>
          <label className="block">Mention fiscale
            <select className="input mt-1" value={s.taxMode} onChange={(e) => patch({ taxMode: e.target.value })}>
              <option value="unspecified">Non précisé</option>
              <option value="ht">HT</option>
              <option value="ttc">TTC</option>
            </select>
          </label>
          <Field label="Modalités de paiement" value={s.paymentTerms} onChange={(v) => patch({ paymentTerms: v })} wide />
          <Field label="Moyens de paiement" value={s.paymentMethods} onChange={(v) => patch({ paymentMethods: v })} wide />
          <label className="flex items-center gap-2 font-bold text-navy sm:col-span-2">
            <input type="checkbox" checked={s.includeSignature} onChange={(e) => patch({ includeSignature: e.target.checked })} />
            Inscrire la signature et le cachet de Pixel Nomade
          </label>
        </div>
      </section>

      <Rows title="Prestations incluses" addLabel="Ligne vide" onAdd={() => patch({ services: [...s.services, { prestation: "", contenu: "", volume: "" }] })}>
        <label className="text-sm font-bold">Depuis le catalogue
          <select className="input mt-1" defaultValue="" onChange={(e) => {
            const item = catalog.find((c) => String(c.id) === e.target.value);
            if (item) patch({ services: [...s.services, { prestation: item.name, contenu: item.description ?? "", volume: "" }] });
            e.target.value = "";
          }}>
            <option value="">Ajouter…</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {s.services.map((row, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_2fr_1fr_auto] gap-2">
            <input className="input" placeholder="Prestation" value={row.prestation} onChange={(e) => patch({ services: s.services.map((r, j) => j === i ? { ...r, prestation: e.target.value } : r) })} />
            <input className="input" placeholder="Contenu" value={row.contenu} onChange={(e) => patch({ services: s.services.map((r, j) => j === i ? { ...r, contenu: e.target.value } : r) })} />
            <input className="input" placeholder="Volume" value={row.volume} onChange={(e) => patch({ services: s.services.map((r, j) => j === i ? { ...r, volume: e.target.value } : r) })} />
            <span className="flex gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ services: move(s.services, i, -1) })}>↑</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ services: move(s.services, i, 1) })}>↓</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ services: s.services.filter((_, j) => j !== i) })}>✕</button>
            </span>
          </div>
        ))}
      </Rows>

      <Rows title="Définitions" addLabel="Terme" onAdd={() => patch({ definitions: [...s.definitions, { term: "", definition: "" }] })}>
        {s.definitions.map((row, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_2fr_auto] gap-2">
            <input className="input" value={row.term} placeholder="Terme" onChange={(e) => patch({ definitions: s.definitions.map((r, j) => j === i ? { ...r, term: e.target.value } : r) })} />
            <input className="input" value={row.definition} placeholder="Définition" onChange={(e) => patch({ definitions: s.definitions.map((r, j) => j === i ? { ...r, definition: e.target.value } : r) })} />
            <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ definitions: s.definitions.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
      </Rows>

      <section className="card card-pad space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="h-section">Articles et annexes</p>
          <select className="input max-w-xs" defaultValue="" onChange={(e) => { addClause(e.target.value); e.target.value = ""; }}>
            <option value="">Ajouter depuis la bibliothèque…</option>
            {clauses.map((c) => <option key={c.key} value={c.key}>{c.kind === "annex" ? "Annexe" : "Article"} — {c.title}</option>)}
          </select>
        </div>
        <p className="text-sm text-navy-600">La numérotation et les renvois {"{{art.clé}}"} se recalculent à la génération. Le gras s’écrit **ainsi**.</p>
        {s.sections.map((sec, i) => (
          <article key={`${sec.key}-${i}`} className="rounded-xl border border-navy-100 p-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="badge-gold">{sec.kind === "annex" ? "Annexe" : "Article"}</span>
              <input className="input flex-1" value={sec.title} onChange={(e) => patch({ sections: s.sections.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: move(s.sections, i, -1) })}>↑</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: move(s.sections, i, 1) })}>↓</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: s.sections.filter((_, j) => j !== i) })}>Supprimer</button>
            </div>
            {sec.blocks.map((b, bi) => (
              <BlockEdit key={bi} block={b} onChange={(block) => patch({ sections: s.sections.map((x, j) => j === i ? { ...x, blocks: x.blocks.map((bb, k) => k === bi ? block : bb) } : x) })} onRemove={() => patch({ sections: s.sections.map((x, j) => j === i ? { ...x, blocks: x.blocks.filter((_, k) => k !== bi) } : x) })} />
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "p", text: "" }) })}>+ Paragraphe</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "subs", items: [{ text: "" }] }) })}>+ Sous-articles</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "ul", items: [""] }) })}>+ Liste</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "table", id: "services" }) })}>+ Tableau prestations</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "table", id: "definitions" }) })}>+ Définitions</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => patch({ sections: withBlock(s.sections, i, { type: "table", id: "prices" }) })}>+ Prix</button>
            </div>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" type="submit">{contractId ? "Enregistrer" : "Enregistrer le brouillon"}</button>
        <button className="btn-gold" type="button" onClick={preview} disabled={previewing}>{previewing ? "Aperçu…" : "Aperçu PDF"}</button>
      </div>
    </form>
  );
}

function withBlock(sections: Section[], i: number, block: Block) {
  return sections.map((x, j) => j === i ? { ...x, blocks: [...x.blocks, block] } : x);
}

function Field({ label, value, onChange, wide, type = "text" }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string }) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>{label}
      <input className="input mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Rows({ title, children, onAdd, addLabel }: { title: string; children: React.ReactNode; onAdd: () => void; addLabel: string }) {
  return (
    <section className="card card-pad space-y-2">
      <div className="flex justify-between"><p className="h-section">{title}</p><button type="button" className="btn-ghost btn-sm" onClick={onAdd}>+ {addLabel}</button></div>
      {children}
    </section>
  );
}

function BlockEdit({ block, onChange, onRemove }: { block: Block; onChange: (b: Block) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg bg-navy/[0.03] p-2 space-y-1">
      <div className="flex justify-between text-xs font-bold uppercase text-navy-600">
        <span>{block.type === "table" ? `Tableau ${block.id}` : block.type}</span>
        <button type="button" onClick={onRemove}>Retirer</button>
      </div>
      {block.type === "p" && <textarea className="input" rows={3} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />}
      {block.type === "ul" && <textarea className="input" rows={3} value={block.items.join("\n")} onChange={(e) => onChange({ ...block, items: e.target.value.split("\n") })} />}
      {block.type === "subs" && <textarea className="input" rows={4} value={block.items.map((i) => i.text).join("\n")} onChange={(e) => onChange({ ...block, items: e.target.value.split("\n").map((text) => ({ text })) })} />}
      {block.type === "table" && block.id === "custom" && (
        <textarea className="input" rows={4} value={[...(block.headers || []), ...(block.rows || []).map((r) => r.join(" | "))].join("\n")} onChange={(e) => {
          const lines = e.target.value.split("\n");
          onChange({ ...block, headers: (lines[0] || "").split("|").map((x) => x.trim()), rows: lines.slice(1).filter(Boolean).map((l) => l.split("|").map((x) => x.trim())) });
        }} />
      )}
      {block.type === "table" && block.id !== "custom" && <p className="text-sm text-navy-600">Ce tableau reprend les lignes saisies plus haut, ou les montants du contrat.</p>}
    </div>
  );
}
