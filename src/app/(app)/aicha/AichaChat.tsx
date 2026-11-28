"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, LoaderCircle, MessageSquare, PanelLeft, Plus, Sparkles, Square, Trash2, X } from "lucide-react";
import { Markdown } from "./Markdown";
import { deleteConversation } from "./actions";

type Msg = { role: "user" | "assistant"; content: string; tool?: string; error?: boolean };
type Conv = { id: number; title: string; updatedAt: string };

const SUGGESTIONS = [
  { title: "Qui est absent aujourd'hui ?", text: "Qui est absent ou en retard aujourd'hui ?" },
  { title: "Mes tâches de la semaine", text: "Quelles sont les tâches à faire cette semaine, par personne ?" },
  { title: "Factures impayées", text: "Quelles factures sont impayées ou en retard ?" },
  { title: "Rédiger un contrat", text: "Je veux créer un nouveau contrat pour un client." },
  { title: "Préparer un devis", text: "Prépare-moi un devis." },
  { title: "Point de la journée", text: "Fais-moi un point rapide sur l'entreprise aujourd'hui." },
];

export function AichaChat({
  enabled, isAdmin, userName, conversations, conversationId, initial,
}: {
  enabled: boolean;
  isAdmin: boolean;
  userName: string;
  conversations: Conv[];
  conversationId: number | null;
  initial: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [convId, setConvId] = useState<number | null>(conversationId);
  const [list, setList] = useState(conversations);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // On ne recharge les messages que lorsqu'on change de conversation (pas à chaque rafraîchissement).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setMessages(initial); setConvId(conversationId); }, [conversationId]);
  useEffect(() => { setList(conversations); }, [conversations]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }, [input]);

  const patchLast = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || busy || !enabled) return;
    setInput("");
    setBusy(true);
    setMessages((all) => [...all, { role: "user", content: msg }, { role: "assistant", content: "", tool: "Je réfléchis" }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let created: number | null = null;
    try {
      const res = await fetch("/api/aicha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: msg }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Votre session a expiré, reconnectez-vous." : "Aicha ne répond pas pour le moment.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "conversation") {
            created = ev.id;
            setConvId(ev.id);
            setList((l) => [{ id: ev.id, title: ev.title, updatedAt: new Date().toISOString() }, ...l]);
          } else if (ev.type === "tool") patchLast((m) => ({ ...m, tool: ev.label }));
          else if (ev.type === "delta") patchLast((m) => ({ ...m, content: m.content + ev.text, tool: undefined }));
          else if (ev.type === "error") patchLast((m) => ({ ...m, content: (m.content ? m.content + "\n\n" : "") + ev.message, error: true, tool: undefined }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, content: (e as Error).message, error: true, tool: undefined }));
      else patchLast((m) => ({ ...m, content: m.content || "(réponse interrompue)", tool: undefined }));
    } finally {
      patchLast((m) => ({ ...m, tool: undefined }));
      setBusy(false);
      abort.current = null;
      area.current?.focus();
      if (created) router.replace(`/aicha?c=${created}`, { scroll: false });
      else router.refresh();
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3">
        <Link href="/aicha" onClick={() => setPanel(false)} className="btn-gold flex-1"><Plus size={16} /> Nouvelle discussion</Link>
        <button type="button" onClick={() => setPanel(false)} className="grid h-10 w-10 place-items-center rounded-lg text-navy-600 hover:bg-navy-50 lg:hidden" aria-label="Fermer"><X size={18} /></button>
      </div>
      <p className="h-section px-4 pb-1 pt-2">Historique</p>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {list.length === 0 && <li className="px-2 py-2 text-sm text-navy-600/60">Aucune conversation.</li>}
        {list.map((c) => (
          <li key={c.id} className="group relative">
            <Link
              href={`/aicha?c=${c.id}`}
              onClick={() => setPanel(false)}
              aria-current={c.id === convId ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg py-2 pl-2.5 pr-9 text-sm transition ${c.id === convId ? "bg-navy-50 font-semibold text-navy" : "text-navy-700 hover:bg-navy-50/60"}`}
            >
              <MessageSquare size={14} className="shrink-0 text-navy-600/50" />
              <span className="truncate">{c.title}</span>
            </Link>
            <form action={deleteConversation} className="absolute right-1 top-1/2 -translate-y-1/2">
              <input type="hidden" name="id" value={c.id} />
              <button className="grid h-7 w-7 place-items-center rounded-md text-navy-600/50 opacity-0 transition hover:bg-red-50 hover:text-red-700 focus:opacity-100 group-hover:opacity-100" aria-label={`Supprimer « ${c.title} »`} title="Supprimer"><Trash2 size={14} /></button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );

  const empty = messages.length === 0;

  return (
    <div className="card flex h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden lg:h-[calc(100dvh-6.5rem)]">
      {/* Historique */}
      <aside className="hidden w-64 shrink-0 border-r border-navy-100 bg-navy-50/30 lg:block">{sidebar}</aside>
      {panel && (
        <div className="fixed inset-0 z-[60] bg-navy-900/40 lg:hidden" onClick={() => setPanel(false)}>
          <div className="h-full w-72 bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}

      {/* Discussion */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-navy-100 px-4 py-3">
          <button type="button" onClick={() => setPanel(true)} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50 lg:hidden" aria-label="Historique"><PanelLeft size={18} /></button>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-gold to-amber-500 text-white"><Sparkles size={17} /></span>
          <div className="min-w-0">
            <p className="font-bold leading-tight text-navy">Aicha</p>
            <p className="text-xs text-navy-600/65">{busy ? "écrit…" : "Assistante de l'agence"}</p>
          </div>
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
              <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-gold to-amber-500 text-white"><Sparkles size={26} /></span>
              <h1 className="text-2xl font-bold text-navy">Bonjour {userName.split(" ")[0]}, je suis Aicha</h1>
              <p className="mt-1 text-navy-600/80">Posez-moi une question sur l'équipe, les projets, les finances… ou demandez-moi de créer un devis, une facture, un contrat.</p>
              {!enabled && (
                <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Aicha n'est pas encore activée.{" "}
                  {isAdmin ? <Link href="/parametres?ia=1" className="font-bold underline">Saisir la clé OpenAI</Link> : "Demandez à un administrateur de la configurer."}
                </p>
              )}
              {enabled && (
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} type="button" onClick={() => send(s.text)} className="rounded-xl border border-navy-100 bg-white px-4 py-3 text-left text-sm transition hover:border-gold/60 hover:bg-gold-50/40">
                      <span className="block font-semibold text-navy">{s.title}</span>
                      <span className="block text-xs text-navy-600/65">{s.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {messages.map((m, i) => m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-navy px-4 py-2.5 text-[15px] text-white">{m.content}</p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-amber-500 text-white"><Sparkles size={15} /></span>
                  <div className={`min-w-0 flex-1 text-[15px] leading-relaxed ${m.error ? "text-red-700" : "text-navy-800"}`}>
                    {m.content && <Markdown text={m.content} />}
                    {m.tool && (
                      <p className="inline-flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1 text-sm text-navy-600">
                        <LoaderCircle size={14} className="animate-spin" /> {m.tool}…
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saisie */}
        <form
          className="border-t border-navy-100 bg-white p-3 sm:p-4"
          onSubmit={(e) => { e.preventDefault(); send(input); }}
        >
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-navy-200 bg-white p-2 transition focus-within:border-gold-600 focus-within:ring-2 focus-within:ring-gold/25">
            <textarea
              ref={area}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
              rows={1}
              disabled={!enabled}
              placeholder={enabled ? "Écrivez à Aicha…" : "Aicha n'est pas encore activée"}
              className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[15px] text-navy-900 outline-none placeholder:text-navy-600/45"
              aria-label="Message pour Aicha"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-white" aria-label="Arrêter"><Square size={14} fill="currentColor" /></button>
            ) : (
              <button disabled={!input.trim() || !enabled} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy text-white transition disabled:opacity-30" aria-label="Envoyer"><ArrowUp size={18} /></button>
            )}
          </div>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-navy-600/55">Aicha peut se tromper : vérifiez les documents avant de les envoyer. Entrée pour envoyer, Maj + Entrée pour aller à la ligne.</p>
        </form>
      </section>
    </div>
  );
}
