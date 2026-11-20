"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CONDITIONS } from "@/lib/equipmentLabels";
import { Field } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { saveSlip, warnOverlaps } from "./actions";

type Eq = {
  id: number; ref: string; name: string; quantity: number; condition: string;
  availability: string; categoryId: number | null; available: number; catLabel: string;
};
type Line = { equipmentId: number; quantity: number; conditionOut: string; noteOut: string };

export function SlipForm({
  actionId, people, projects, equipment, initial,
}: {
  actionId?: number;
  people: { id: number; name: string }[];
  projects: { id: number; title: string; clientName: string | null }[];
  equipment: Eq[];
  initial?: {
    projectId: number | null; offProjectReason: string | null;
    outAt: string; expectedReturn: string; location: string;
    responsibleUserId: number | null; memberIds: number[]; notes: string | null;
    lines: Line[];
  };
}) {
  const [projectId, setProjectId] = useState(String(initial?.projectId ?? ""));
  const [members, setMembers] = useState<number[]>(initial?.memberIds ?? []);
  const [responsible, setResponsible] = useState(String(initial?.responsibleUserId ?? ""));
  const [outAt, setOutAt] = useState(initial?.outAt ?? "");
  const [expectedReturn, setExpectedReturn] = useState(initial?.expectedReturn ?? "");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [warn, setWarn] = useState<{ text: string; at: number } | null>(null);
  const [overlapMsg, setOverlapMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const cats = useMemo(() => [...new Set(equipment.map((e) => e.catLabel))], [equipment]);
  const filtered = equipment.filter((e) => {
    if (q && !(`${e.name} ${e.ref} ${e.catLabel}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (cat && e.catLabel !== cat) return false;
    return true;
  });
  const client = projects.find((p) => String(p.id) === projectId)?.clientName;

  function toggleMember(id: number) {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  function refreshOverlaps(nextLines = lines, a = outAt, b = expectedReturn) {
    if (!a || !b || !nextLines.length) {
      setOverlapMsg(null);
      return;
    }
    startTransition(async () => {
      const hits: string[] = [];
      for (const l of nextLines) {
        const rows = await warnOverlaps(l.equipmentId, a, b, actionId);
        for (const r of rows) {
          const e = equipment.find((x) => x.id === l.equipmentId);
          hits.push(`${e?.name ?? l.equipmentId} déjà sur ${r.number} (qté ${r.quantity})`);
        }
      }
      setOverlapMsg(hits.length ? `Chevauchement possible : ${[...new Set(hits)].join(" · ")}` : null);
    });
  }

  useEffect(() => {
    refreshOverlaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outAt, expectedReturn, lines.map((l) => l.equipmentId).join(",")]);

  function addLine(e: Eq) {
    if (e.available <= 0 || e.condition === "en_panne" || e.condition === "en_reparation" || e.availability === "en_maintenance") {
      setWarn({ text: `${e.name} n'est pas disponible.`, at: Date.now() });
      return;
    }
    if (lines.some((l) => l.equipmentId === e.id)) return;
    const next = [...lines, { equipmentId: e.id, quantity: 1, conditionOut: e.condition in CONDITIONS ? e.condition : "bon", noteOut: "" }];
    setLines(next);
    setWarn(null);
    refreshOverlaps(next);
  }

  function updateLine(id: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.equipmentId === id ? { ...l, ...patch } : l)));
  }

  return (
    <form action={saveSlip} className="space-y-5">
      {actionId ? <input type="hidden" name="id" value={actionId} /> : null}
      {members.map((id) => <input key={id} type="hidden" name="memberIds" value={id} />)}
      {lines.map((l) => (
        <span key={l.equipmentId}>
          <input type="hidden" name="equipmentId" value={l.equipmentId} />
          <input type="hidden" name="qty" value={l.quantity} />
          <input type="hidden" name="conditionOut" value={l.conditionOut} />
          <input type="hidden" name="noteOut" value={l.noteOut} />
        </span>
      ))}

      <section className="card card-pad grid gap-4 md:grid-cols-2">
        <p className="h-section md:col-span-2">Cadre de la sortie</p>
        <Field label="Projet">
          <select name="projectId" className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— Hors projet —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        {projectId ? (
          <Field label="Client"><input className="input" value={client ?? "—"} readOnly /></Field>
        ) : (
          <Field label="Motif hors projet"><input name="offProjectReason" className="input" defaultValue={initial?.offProjectReason ?? ""} required={!projectId} /></Field>
        )}
        <Field label="Date et heure de sortie">
          <input name="outAt" type="datetime-local" className="input" value={outAt} onChange={(e) => setOutAt(e.target.value)} required />
        </Field>
        <Field label="Retour prévu">
          <input name="expectedReturn" type="datetime-local" className="input" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} required />
        </Field>
        <Field label="Lieu du tournage" className="md:col-span-2"><input name="location" className="input" defaultValue={initial?.location ?? ""} required /></Field>
        <Field label="Notes" className="md:col-span-2"><textarea name="notes" className="input" rows={2} defaultValue={initial?.notes ?? ""} /></Field>
      </section>

      <section className="card card-pad">
        <p className="h-section mb-3">Équipe</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleMember(p.id)}
              className={members.includes(p.id) ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
            >
              {p.name}
            </button>
          ))}
        </div>
        <Field label="Responsable du matériel">
          <select name="responsibleUserId" className="input" value={responsible} onChange={(e) => setResponsible(e.target.value)} required>
            <option value="">—</option>
            {(members.length ? people.filter((p) => members.includes(p.id)) : people).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
      </section>

      <section className="card card-pad">
        <p className="h-section mb-3">Matériel emporté</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="input w-auto min-w-48" placeholder="Recherche" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Toutes catégories</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {warn && <Flash key={warn.at} className="mb-2" tone="warning" message={warn.text} />}
        {overlapMsg && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">{overlapMsg}</p>}
        <div className="mb-4 max-h-56 overflow-y-auto rounded-xl border border-navy-100">
          <table className="table">
            <thead><tr><th>Réf.</th><th>Nom</th><th>Dispo</th><th></th></tr></thead>
            <tbody>
              {filtered.map((e) => {
                const blocked = e.available <= 0 || e.condition === "en_panne" || e.condition === "en_reparation" || e.availability === "en_maintenance";
                return (
                  <tr key={e.id} className={blocked ? "opacity-40" : ""}>
                    <td className="font-mono text-sm">{e.ref}</td>
                    <td>{e.name}<div className="text-xs text-navy-600/70">{e.catLabel}</div></td>
                    <td>{e.available}/{e.quantity}</td>
                    <td>
                      <button type="button" className="btn-ghost btn-sm" disabled={blocked || lines.some((l) => l.equipmentId === e.id)} onClick={() => addLine(e)}>
                        Ajouter
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {lines.length === 0 ? <p className="text-sm text-navy-600/70">Aucun matériel sélectionné.</p> : (
          <ul className="space-y-2">
            {lines.map((l) => {
              const e = equipment.find((x) => x.id === l.equipmentId)!;
              return (
                <li key={l.equipmentId} className="rounded-xl border border-navy-100 bg-navy-50/30 p-3 grid gap-2 md:grid-cols-[1fr_90px_140px_1fr_auto] md:items-end">
                  <div>
                    <p className="font-bold text-navy">{e.name}</p>
                    <p className="text-xs text-navy-600/70">{e.ref} · dispo {e.available}</p>
                  </div>
                  <Field label="Qté">
                    <input type="number" min={1} max={e.available} className="input" value={l.quantity}
                      onChange={(ev) => updateLine(l.equipmentId, { quantity: Math.max(1, Math.min(e.available, Number(ev.target.value) || 1)) })} />
                  </Field>
                  <Field label="État départ">
                    <select className="input" value={l.conditionOut} onChange={(ev) => updateLine(l.equipmentId, { conditionOut: ev.target.value })}>
                      {Object.entries(CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Remarque">
                    <input className="input" value={l.noteOut} placeholder="2 batteries + chargeur" onChange={(ev) => updateLine(l.equipmentId, { noteOut: ev.target.value })} />
                  </Field>
                  <button type="button" className="btn-danger btn-sm" onClick={() => {
                    const next = lines.filter((x) => x.equipmentId !== l.equipmentId);
                    setLines(next);
                    refreshOverlaps(next);
                  }}>Retirer</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button className="btn-gold">Enregistrer le brouillon</button>
    </form>
  );
}
