"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from "lucide-react";
import { docTotals, lineTotal, type Line } from "@/lib/calc";

type Client = { id: number; name: string };
type Project = { id: number; title: string; clientId: number | null; type: string; eventTypeIds: number[] };
type Item = { id: number; kind: string; name: string; description: string | null; category: string | null; unit: string; unitPrice: number };
type EventType = { id: number; name: string; description: string | null; priceDjibouti: number; priceRegions: number };
type Zone = "djibouti" | "regions";

const COVERAGE = "Couverture vidéo + photo";

function eventPrice(e: EventType, zone: Zone) {
  return zone === "regions" ? e.priceRegions : e.priceDjibouti;
}

function isCoverageLine(l: Line, eventId: number) {
  return l.eventTypeId === eventId && l.catalogItemId == null && l.designation === COVERAGE;
}

export type DocInitial = {
  clientId: number | null;
  projectId: number | null;
  subject: string;
  issueDate: string;
  validUntil?: string | null;
  discount: number;
  depositPercent: number;
  notes: string;
  lines: Line[];
};

const fmt = (n: number) => Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ");

export function DocEditor({
  mode, action, clients, projects, catalog, eventTypes, initial, newClientHref, submitLabel, showDeposit = true,
}: {
  mode: "devis" | "facture";
  action: (fd: FormData) => void;
  clients: Client[];
  projects: Project[];
  catalog: Item[];
  eventTypes: EventType[];
  initial: DocInitial;
  newClientHref?: string;
  submitLabel: string;
  showDeposit?: boolean;
}) {
  const [clientId, setClientId] = useState<number | null>(initial.clientId);
  const [projectId, setProjectId] = useState<number | null>(initial.projectId);
  const [subject, setSubject] = useState(initial.subject);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? "");
  const [discount, setDiscount] = useState(initial.discount);
  const [deposit, setDeposit] = useState(initial.depositPercent);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wedding, setWedding] = useState(
    projects.find((p) => p.id === initial.projectId)?.type === "mariage" || initial.lines.some((l) => l.eventTypeId != null)
  );
  const [zone, setZone] = useState<Zone>(() => {
    const tagged = initial.lines.filter((l) => l.eventTypeId != null && l.catalogItemId == null && l.designation === COVERAGE);
    if (tagged.length && tagged.every((l) => {
      const e = eventTypes.find((x) => x.id === l.eventTypeId);
      return e && l.unitPrice === e.priceRegions && e.priceRegions !== e.priceDjibouti;
    })) return "regions";
    return "djibouti";
  });

  const clientProjects = projects.filter((p) => clientId == null || p.clientId === clientId);
  const project = projects.find((p) => p.id === projectId);
  const isWedding = wedding || project?.type === "mariage" || lines.some((l) => l.eventTypeId != null);
  const projectEvents = eventTypes;

  const totals = useMemo(() => docTotals(lines, discount), [lines, discount]);
  const depositAmount = Math.round((totals.total * deposit) / 100);

  const filtered = catalog.filter((i) => {
    const q = search.toLowerCase();
    return !q || i.name.toLowerCase().includes(q) || (i.category ?? "").toLowerCase().includes(q);
  });
  const grouped = filtered.reduce<Record<string, Item[]>>((acc, i) => {
    const k = i.category || (i.kind === "service" ? "Services" : "Produits");
    (acc[k] ??= []).push(i);
    return acc;
  }, {});

  const update = (idx: number, patch: Partial<Line>) => setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= lines.length) return;
    const next = [...lines];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLines(next);
  };
  const addItem = (it: Item) => {
    setLines([...lines, {
      catalogItemId: it.id, eventTypeId: isWedding ? currentEvent : null, designation: it.name,
      description: it.description ?? "", quantity: 1, unit: it.unit, unitPrice: it.unitPrice, discountPct: 0,
    }]);
    setPickerOpen(false);
    setSearch("");
  };
  const addBlank = () =>
    setLines([...lines, { catalogItemId: null, eventTypeId: isWedding ? currentEvent : null, designation: "", description: "", quantity: 1, unit: "forfait", unitPrice: 0, discountPct: 0 }]);

  const coverageLine = (e: EventType, z: Zone): Line => ({
    catalogItemId: null, eventTypeId: e.id, designation: COVERAGE, description: e.description ?? "",
    quantity: 1, unit: "forfait", unitPrice: eventPrice(e, z), discountPct: 0,
  });

  const sortByEvent = (next: Line[]) => {
    const rank = (l: Line) => {
      if (l.eventTypeId == null) return -1;
      const i = eventTypes.findIndex((e) => e.id === l.eventTypeId);
      return i === -1 ? 999 : i;
    };
    return [...next].sort((a, b) => rank(a) - rank(b));
  };

  const applyZone = (z: Zone) => {
    setZone(z);
    setLines((prev) => prev.map((l) => {
      if (l.catalogItemId != null || l.designation !== COVERAGE || l.eventTypeId == null) return l;
      const e = eventTypes.find((x) => x.id === l.eventTypeId);
      return e ? { ...l, unitPrice: eventPrice(e, z) } : l;
    }));
  };

  const toggleEvent = (e: EventType, on: boolean) => {
    setWedding(true);
    if (on) {
      setLines((prev) => prev.some((l) => isCoverageLine(l, e.id)) ? prev : sortByEvent([...prev, coverageLine(e, zone)]));
      if (!subject.trim()) setSubject("Couverture photo et vidéo du mariage");
    } else {
      setLines((prev) => prev.filter((l) => !isCoverageLine(l, e.id)));
    }
  };

  const chooseProject = (id: number | null) => {
    setProjectId(id);
    const p = projects.find((x) => x.id === id);
    if (p?.type !== "mariage" || p.eventTypeIds.length === 0) return;
    setWedding(true);
    setLines((prev) => {
      if (prev.some((l) => l.designation === COVERAGE)) return prev;
      const picked = p.eventTypeIds.map((eid) => eventTypes.find((e) => e.id === eid)).filter((e): e is EventType => !!e);
      return sortByEvent([...prev, ...picked.map((e) => coverageLine(e, zone))]);
    });
    if (!subject.trim()) setSubject(p.title);
  };

  const payload = JSON.stringify({
    clientId, projectId, subject, issueDate, validUntil: validUntil || null, discount, depositPercent: deposit, notes,
    lines: lines.filter((l) => l.designation.trim()),
  });

  return (
    <form action={action} onSubmit={() => setSubmitting(true)} className="grid 2xl:grid-cols-[1fr_320px] gap-6 items-start">
      <input type="hidden" name="payload" value={payload} />
      <div className="space-y-6 min-w-0">
        {/* En-tête */}
        <section className="card card-pad grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Client *</label>
            <select className="input" required value={clientId ?? ""} onChange={(e) => { const v = Number(e.target.value) || null; setClientId(v); if (project && project.clientId !== v) setProjectId(null); }}>
              <option value="">— Choisir —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {newClientHref && <Link href={newClientHref} className="text-sm link mt-1 inline-block">+ Nouveau client</Link>}
          </div>
          <div>
            <label className="label">Projet</label>
            <select className="input" value={projectId ?? ""} onChange={(e) => chooseProject(Number(e.target.value) || null)}>
              <option value="">— Aucun projet —</option>
              {clientProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Objet *</label>
            <input className="input" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ex. Couverture photo & vidéo du mariage" />
          </div>
          <div>
            <label className="label">Date {mode === "devis" ? "du devis" : "de facture"}</label>
            <input type="date" className="input" required value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          {mode === "devis" ? (
            <div>
              <label className="label">Valable jusqu'au</label>
              <input type="date" className="input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          ) : <div />}
        </section>

        {mode === "devis" && (
          <section className="card card-pad">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 font-bold text-navy cursor-pointer">
                <input type="checkbox" checked={wedding} onChange={(e) => setWedding(e.target.checked)} className="w-4 h-4 accent-[#F5A623]" />
                Devis mariage
              </label>
              {wedding && (
                <div className="flex rounded-lg border border-navy-100 overflow-hidden">
                  <button type="button" className={`px-3 h-8 text-sm font-bold ${zone === "djibouti" ? "bg-navy text-white" : "bg-white text-navy"}`} onClick={() => applyZone("djibouti")}>Djibouti-ville</button>
                  <button type="button" className={`px-3 h-8 text-sm font-bold ${zone === "regions" ? "bg-navy text-white" : "bg-white text-navy"}`} onClick={() => applyZone("regions")}>Régions</button>
                </div>
              )}
            </div>
            {wedding && (
              <div className="grid sm:grid-cols-2 gap-2 mt-3">
                {eventTypes.map((e) => {
                  const on = lines.some((l) => isCoverageLine(l, e.id));
                  return (
                    <label key={e.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer bg-white ${on ? "border-gold" : "border-navy-100"}`}>
                      <input type="checkbox" checked={on} onChange={(ev) => toggleEvent(e, ev.target.checked)} className="w-4 h-4 accent-[#F5A623]" />
                      <span className="font-bold flex-1">{e.name}</span>
                      <span className="tabular-nums text-sm text-navy-600 whitespace-nowrap">{fmt(eventPrice(e, zone))} FDJ</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Lignes */}
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
            <p className="h-section">Prestations</p>
            <div className="flex flex-wrap items-center gap-2">
              {isWedding && (
                <select className="input h-8 w-auto text-sm" value={currentEvent ?? ""} onChange={(e) => setCurrentEvent(Number(e.target.value) || null)} title="Événement attribué aux nouvelles lignes">
                  <option value="">Nouvelles lignes : sans événement</option>
                  {projectEvents.map((e) => <option key={e.id} value={e.id}>Nouvelles lignes : {e.name}</option>)}
                </select>
              )}
              <div className="relative">
                <button type="button" className="btn-gold btn-sm" onClick={() => setPickerOpen(!pickerOpen)}><Search size={15} /> Catalogue</button>
                {pickerOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-[min(420px,85vw)] card shadow-xl">
                    <div className="p-2 border-b border-navy-100">
                      <input autoFocus className="input" placeholder="Rechercher un service ou produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="max-h-80 overflow-y-auto p-1">
                      {Object.keys(grouped).length === 0 && <p className="p-3 text-sm text-navy-600/70">Aucun résultat. <Link className="link" href="/catalogue">Gérer le catalogue</Link></p>}
                      {Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat}>
                          <p className="px-2 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-navy-600/60">{cat}</p>
                          {items.map((it) => (
                            <button type="button" key={it.id} onClick={() => addItem(it)} className="w-full text-left flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-gold-50">
                              <span className="min-w-0"><span className="font-bold block truncate">{it.name}</span></span>
                              <span className="text-sm tabular-nums whitespace-nowrap text-navy-600">{fmt(it.unitPrice)} / {it.unit}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button type="button" className="btn-ghost btn-sm" onClick={addBlank}><Plus size={15} /> Ligne libre</button>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="px-5 pb-6 text-navy-600/70">Ajoutez des prestations depuis le catalogue ou une ligne libre.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-fixed min-w-0 md:min-w-[840px] [&_td]:px-2 [&_th]:px-2">
                <thead>
                  <tr>
                    {isWedding && <th className="w-[120px]">Événement</th>}
                    <th>Désignation</th>
                    <th className="w-[62px] num">Qté</th>
                    <th className="w-[82px]">Unité</th>
                    <th className="w-[100px] num">P.U. (FDJ)</th>
                    <th className="w-[66px] num">Remise %</th>
                    <th className="w-[95px] num">Total</th>
                    <th className="w-[78px]" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={idx} className="align-top">
                      {isWedding && (
                        <td>
                          <select className="input h-8 text-sm" value={l.eventTypeId ?? ""} onChange={(e) => update(idx, { eventTypeId: Number(e.target.value) || null })}>
                            <option value="">—</option>
                            {projectEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        </td>
                      )}
                      <td>
                        <input className="input h-8 font-bold" value={l.designation} onChange={(e) => update(idx, { designation: e.target.value })} placeholder="Désignation" />
                        <textarea className="input mt-1 !min-h-[32px] !h-8 text-sm py-1 resize-y" rows={1} value={l.description} onChange={(e) => update(idx, { description: e.target.value })} placeholder="Détail (facultatif)" />
                      </td>
                      <td><input className="input h-8 text-right px-1.5" type="number" min={0} step="any" value={l.quantity} onChange={(e) => update(idx, { quantity: Number(e.target.value) || 0 })} /></td>
                      <td><input className="input h-8" value={l.unit} onChange={(e) => update(idx, { unit: e.target.value })} /></td>
                      <td><input className="input h-8 text-right px-1.5" type="number" min={0} step={1} value={l.unitPrice} onChange={(e) => update(idx, { unitPrice: Math.round(Number(e.target.value)) || 0 })} /></td>
                      <td><input className="input h-8 text-right px-1.5" type="number" min={0} max={100} value={l.discountPct} onChange={(e) => update(idx, { discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></td>
                      <td className="num font-bold pt-4">{fmt(lineTotal(l.quantity, l.unitPrice, l.discountPct))}</td>
                      <td className="whitespace-nowrap pt-3">
                        <button type="button" className="p-1 text-navy-600/60 hover:text-navy" onClick={() => move(idx, -1)} aria-label="Monter"><ArrowUp size={16} /></button>
                        <button type="button" className="p-1 text-navy-600/60 hover:text-navy" onClick={() => move(idx, 1)} aria-label="Descendre"><ArrowDown size={16} /></button>
                        <button type="button" className="p-1 text-red-600/70 hover:text-red-700" onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Supprimer"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card card-pad">
          <label className="label">Notes / conditions particulières (imprimées sur le document)</label>
          <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>
      </div>

      {/* Totaux */}
      <aside className="card card-pad 2xl:sticky 2xl:top-6 space-y-3 max-w-xl 2xl:max-w-none">
        <p className="h-section">Récapitulatif</p>
        <div className="flex justify-between"><span>Sous-total</span><span className="tabular-nums font-bold">{fmt(totals.subtotal)} FDJ</span></div>
        <div className="flex items-center justify-between gap-3">
          <span>Remise globale</span>
          <input className="input h-8 w-32 text-right" type="number" min={0} step={1} value={discount} onChange={(e) => setDiscount(Math.max(0, Math.round(Number(e.target.value)) || 0))} />
        </div>
        <div className="flex justify-between items-baseline rounded-lg bg-navy text-white px-3 py-2.5">
          <span className="font-bold">TOTAL</span>
          <span className="tabular-nums font-bold text-gold text-xl">{fmt(totals.total)} FDJ</span>
        </div>
        {showDeposit && <>
        <div className="flex items-center justify-between gap-3 pt-2">
          <span>Acompte</span>
          <span className="flex items-center gap-1">
            <input className="input h-8 w-16 text-right" inputMode="numeric" value={deposit} onChange={(e) => setDeposit(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />%
          </span>
        </div>
        <div className="text-sm text-navy-600 space-y-1">
          <div className="flex justify-between"><span>Acompte à la commande</span><span className="tabular-nums">{fmt(depositAmount)} FDJ</span></div>
          <div className="flex justify-between"><span>Solde à la livraison</span><span className="tabular-nums">{fmt(totals.total - depositAmount)} FDJ</span></div>
        </div>
        </>}
        <button className="btn-primary w-full h-10 mt-2" disabled={submitting || !clientId || !subject || lines.length === 0}>
          {submitting ? "Enregistrement…" : submitLabel}
        </button>
      </aside>
    </form>
  );
}
