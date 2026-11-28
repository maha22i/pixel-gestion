"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, FilePlus2, Library, Plus, Trash2, X } from "lucide-react";
import type { Block, Section } from "@/lib/contractModel";
import { AutoTextarea, IconBtn, Segmented, TokenPalette } from "./parts";

export type Clause = { key: string; kind: string; title: string; blocks: Block[] };
export type TemplateArticles = { id: number; name: string; sections: Section[] };

export function move<T>(arr: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const TABLE_LABEL: Record<string, string> = {
  services: "Tableau des prestations",
  definitions: "Tableau des définitions",
  prices: "Tableau des prix",
  custom: "Tableau libre",
};
const TABLE_HINT: Record<string, string> = {
  services: "Reprend automatiquement les prestations saisies à l’étape 2.",
  definitions: "Reprend automatiquement les définitions saisies à l’étape 2.",
  prices: "Calculé automatiquement depuis la durée et le montant (étape 3).",
};

function blockLabel(b: Block) {
  if (b.type === "p") return "Paragraphe";
  if (b.type === "ul") return "Liste à puces · une puce par ligne";
  if (b.type === "subs") return "Sous-articles numérotés · un par ligne";
  return TABLE_LABEL[b.id] ?? "Tableau";
}

function preview(sec: Section) {
  for (const b of sec.blocks) {
    const t = b.type === "p" ? b.text : b.type === "subs" ? b.items[0]?.text : b.type === "ul" ? b.items[0] : "";
    if (t?.trim()) return t.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, "«$1»").replace(/\*\*/g, "");
  }
  return "";
}

export function ArticlesEditor({
  sections, numbers, onChange, clauses, templates,
}: {
  sections: Section[];
  numbers: Record<string, string>;
  onChange: (fn: (cur: Section[]) => Section[]) => void;
  clauses: Clause[];
  templates: TemplateArticles[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const idOf = (sec: Section) => sec.key;
  const allOpen = sections.length > 0 && sections.every((s) => open[idOf(s)]);
  const available = clauses.filter((c) => !sections.some((s) => s.key === c.key));

  function addClause(key: string) {
    const c = clauses.find((x) => x.key === key);
    if (!c) return;
    onChange((cur) => cur.some((x) => x.key === key) ? cur : [...cur, { key: c.key, kind: c.kind === "annex" ? "annex" : "article", title: c.title, blocks: c.blocks }]);
    setOpen((o) => ({ ...o, [c.key]: true }));
  }
  function addBlank() {
    const key = `perso_${Date.now().toString(36)}`;
    onChange((cur) => [...cur, { key, kind: "article", title: "Nouvel article", blocks: [{ type: "p", text: "" }] }]);
    setOpen((o) => ({ ...o, [key]: true }));
  }
  const refs = sections.map((x) => ({ key: x.key, label: `${x.kind === "annex" ? numbers[x.key] : `Art. ${numbers[x.key]}`} — ${x.title}` }));
  const patchSec = (i: number, fn: (s: Section) => Section) => onChange((cur) => cur.map((x, j) => (j === i ? fn(x) : x)));
  const patchBlock = (i: number, bi: number, block: Block) => patchSec(i, (x) => ({ ...x, blocks: x.blocks.map((b, k) => (k === bi ? block : b)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-auto sm:min-w-[14rem] sm:flex-1">
          <span className="sr-only">Ajouter un article de la bibliothèque</span>
          <Library size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-600/60" />
          <select className="input pl-9" value="" onChange={(e) => addClause(e.target.value)} disabled={available.length === 0}>
            <option value="">{available.length ? `Ajouter depuis la bibliothèque (${available.length})…` : "Tous les articles de la bibliothèque sont inclus"}</option>
            {available.filter((c) => c.kind !== "annex").length > 0 && (
              <optgroup label="Articles">
                {available.filter((c) => c.kind !== "annex").map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
              </optgroup>
            )}
            {available.filter((c) => c.kind === "annex").length > 0 && (
              <optgroup label="Annexes">
                {available.filter((c) => c.kind === "annex").map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}
              </optgroup>
            )}
          </select>
        </label>
        <button type="button" className="btn-ghost" onClick={addBlank}><Plus size={16} /> Article vide</button>
        {sections.length > 1 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setOpen(allOpen ? {} : Object.fromEntries(sections.map((s) => [idOf(s), true])))}
          >
            {allOpen ? <><ChevronsDownUp size={16} /> Tout replier</> : <><ChevronsUpDown size={16} /> Tout déplier</>}
          </button>
        )}
      </div>

      {sections.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-navy-100 px-5 py-8 text-center">
          <FilePlus2 className="mx-auto text-navy-300" size={28} />
          <p className="mt-2 font-bold text-navy">Aucun article pour l’instant</p>
          <p className="mt-1 text-sm text-navy-600/75">Ajoutez-les un par un depuis la bibliothèque, ou reprenez tous ceux d’un modèle :</p>
          {templates.filter((t) => t.sections.length).length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {templates.filter((t) => t.sections.length).map((t) => (
                <button key={t.id} type="button" className="btn-ghost btn-sm" onClick={() => onChange(() => t.sections)}>
                  {t.name} · {t.sections.length}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ol className="space-y-2">
        {sections.map((sec, i) => {
          const id = idOf(sec);
          const isOpen = !!open[id];
          const num = numbers[sec.key] ?? "";
          const annex = sec.kind === "annex";
          return (
            <li key={`${id}-${i}`} className={`rounded-xl border transition ${isOpen ? "border-gold/60 bg-white " : "border-navy-100 bg-white/70 hover:border-navy-200"}`}>
              <div className="flex items-center gap-2 p-2 pl-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [id]: !isOpen }))}
                >
                  <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${annex ? "bg-navy-50 text-navy-700" : "bg-gold-100 text-amber-900"}`}>
                    {annex ? num : `Art. ${num}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-navy">{sec.title || <em className="font-normal text-navy-600/60">Sans titre</em>}</span>
                    {!isOpen && <span className="block truncate text-[12px] text-navy-600/70">{preview(sec) || `${sec.blocks.length} bloc${sec.blocks.length > 1 ? "s" : ""}`}</span>}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-navy-600/60 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <span className="hidden shrink-0 gap-1 sm:flex">
                  <IconBtn label="Monter" disabled={i === 0} onClick={() => onChange((cur) => move(cur, i, -1))}><ArrowUp size={15} /></IconBtn>
                  <IconBtn label="Descendre" disabled={i === sections.length - 1} onClick={() => onChange((cur) => move(cur, i, 1))}><ArrowDown size={15} /></IconBtn>
                  <IconBtn
                    label="Supprimer l’article"
                    tone="danger"
                    onClick={() => {
                      if (confirm(`Retirer « ${sec.title || "cet article"} » du contrat ?`)) onChange((cur) => cur.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 size={15} />
                  </IconBtn>
                </span>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-navy-100 px-3 pb-3 pt-3 sm:px-4">
                  <div className="flex gap-2 sm:hidden">
                    <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => onChange((cur) => move(cur, i, -1))}><ArrowUp size={13} /> Monter</button>
                    <button type="button" className="btn-ghost btn-sm" disabled={i === sections.length - 1} onClick={() => onChange((cur) => move(cur, i, 1))}><ArrowDown size={13} /> Descendre</button>
                    <button type="button" className="btn-ghost btn-sm ml-auto text-red-700" onClick={() => { if (confirm(`Retirer « ${sec.title || "cet article"} » du contrat ?`)) onChange((cur) => cur.filter((_, j) => j !== i)); }}><Trash2 size={13} /> Retirer</button>
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block w-full sm:w-auto sm:min-w-[12rem] sm:flex-1">
                      <span className="label">Titre</span>
                      <input className="input" value={sec.title} onChange={(e) => patchSec(i, (x) => ({ ...x, title: e.target.value }))} />
                    </label>
                    <div>
                      <span className="label">Type</span>
                      <Segmented
                        size="sm"
                        value={sec.kind}
                        onChange={(kind) => patchSec(i, (x) => ({ ...x, kind }))}
                        options={[{ value: "article", label: "Article" }, { value: "annex", label: "Annexe" }]}
                      />
                    </div>
                  </div>
                  {sec.blocks.map((b, bi) => (
                    <div key={bi} className="rounded-lg border border-navy-100 bg-navy-50/30 p-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-navy-600/75">{blockLabel(b)}</span>
                        <span className="flex gap-1">
                          <IconBtn label="Monter le bloc" disabled={bi === 0} onClick={() => patchSec(i, (x) => ({ ...x, blocks: move(x.blocks, bi, -1) }))}><ArrowUp size={14} /></IconBtn>
                          <IconBtn label="Descendre le bloc" disabled={bi === sec.blocks.length - 1} onClick={() => patchSec(i, (x) => ({ ...x, blocks: move(x.blocks, bi, 1) }))}><ArrowDown size={14} /></IconBtn>
                          <IconBtn label="Retirer le bloc" tone="danger" onClick={() => patchSec(i, (x) => ({ ...x, blocks: x.blocks.filter((_, k) => k !== bi) }))}><X size={14} /></IconBtn>
                        </span>
                      </div>
                      <BlockEdit block={b} onChange={(block) => patchBlock(i, bi, block)} />
                    </div>
                  ))}
                  <TokenPalette articles={refs.filter((r) => r.key !== sec.key)} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[12px] font-bold text-navy-600/70">Ajouter :</span>
                    {([
                      ["Paragraphe", { type: "p", text: "" }],
                      ["Sous-articles", { type: "subs", items: [{ text: "" }] }],
                      ["Liste", { type: "ul", items: [""] }],
                      ["Tableau prestations", { type: "table", id: "services" }],
                      ["Définitions", { type: "table", id: "definitions" }],
                      ["Prix", { type: "table", id: "prices" }],
                      ["Tableau libre", { type: "table", id: "custom", headers: ["Colonne 1", "Colonne 2"], rows: [] }],
                    ] as [string, Block][]).map(([label, block]) => (
                      <button key={label} type="button" className="btn-ghost btn-sm" onClick={() => patchSec(i, (x) => ({ ...x, blocks: [...x.blocks, block] }))}>
                        <Plus size={13} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BlockEdit({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  if (block.type === "p") return <AutoTextarea ariaLabel="Paragraphe" value={block.text} onChange={(text) => onChange({ ...block, text })} placeholder="Texte du paragraphe…" min={3} />;
  if (block.type === "ul") return <AutoTextarea ariaLabel="Liste" value={block.items.join("\n")} onChange={(v) => onChange({ ...block, items: v.split("\n") })} placeholder="Une puce par ligne" min={3} />;
  if (block.type === "subs") {
    return <AutoTextarea ariaLabel="Sous-articles" value={block.items.map((i) => i.text).join("\n")} onChange={(v) => onChange({ ...block, items: v.split("\n").map((text) => ({ text })) })} placeholder="Un sous-article par ligne" min={3} />;
  }
  if (block.id === "custom") {
    return (
      <>
        <AutoTextarea
          ariaLabel="Tableau libre"
          value={[(block.headers || []).join(" | "), ...(block.rows || []).map((r) => r.join(" | "))].join("\n")}
          onChange={(v) => {
            const lines = v.split("\n");
            onChange({ ...block, headers: (lines[0] || "").split("|").map((x) => x.trim()), rows: lines.slice(1).filter((l) => l.trim()).map((l) => l.split("|").map((x) => x.trim())) });
          }}
          min={3}
        />
        <p className="mt-1 text-[12px] text-navy-600/70">1re ligne : en-têtes. Séparez les colonnes par « | ».</p>
      </>
    );
  }
  return <p className="text-sm text-navy-600/80">{TABLE_HINT[block.id]}</p>;
}
