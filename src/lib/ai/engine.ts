import "server-only";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth";
import { roleLabel } from "@/lib/modules";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/format";
import { openSecret } from "./secret";
import { runTool, toolsFor, TOOLS } from "./tools";

export type AiEvent =
  | { type: "conversation"; id: number; title: string }
  | { type: "tool"; name: string; label: string }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MAX_ROUNDS = 8;
const HISTORY = 40;

export const AI_MODELS = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", hint: "Rapide et économique — recommandé" },
  { id: "gpt-4.1", label: "GPT-4.1", hint: "Plus précis pour les documents complexes" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", hint: "Très économique" },
  { id: "gpt-4o", label: "GPT-4o", hint: "Polyvalent" },
  { id: "o4-mini", label: "o4-mini", hint: "Raisonnement, plus lent" },
];

export async function aiConfig() {
  const st = await getSettings();
  const key = openSecret(st.aiApiKey);
  return { enabled: st.aiEnabled && !!key, key, model: st.aiModel || "gpt-4.1-mini", company: st.companyName };
}

function systemPrompt(u: SessionUser, company: string) {
  const d = today();
  const weekday = new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
  return `Tu es Aicha, l'assistante de ${company}, une agence de communication et de production audiovisuelle à Djibouti.
Tu parles à ${u.name} (${roleLabel(u.role)}). Nous sommes le ${weekday} ${d}. Les montants sont en francs Djibouti (FDJ).

Règles :
- Réponds en français, de façon claire, chaleureuse et concise. Utilise des listes et du **gras** pour les chiffres importants.
- Pour toute information sur l'entreprise (clients, projets, tâches, présences, absences, finances, contrats, matériel), utilise les outils. N'invente jamais de chiffres, de noms ni de dates.
- Si un outil répond « Accès refusé », explique poliment que ${u.name} n'a pas accès à cette information.
- Quand un résultat contient un « lien », propose-le en Markdown, par exemple [Voir la facture](/factures/12).
- Interprète les dates relatives (« demain », « vendredi prochain », « ce mois-ci ») par rapport à aujourd'hui.

Créer quelque chose (tâche, client, devis, facture, contrat, dépense, demande de congé) :
1. Rassemble les informations en posant les questions une par une, simplement (ex. pour un contrat : client, modèle, date de début, durée, montant, prestations). Cherche toi-même les identifiants avec les outils (client, projet, personne, modèle, catalogue).
2. Avant de créer, présente un récapitulatif complet et demande : « Je confirme la création ? ».
3. N'appelle l'outil de création qu'après un « oui » explicite. Ensuite, donne le numéro et le lien.`;
}

/** Messages enregistrés, rejoués au modèle (sans couper une réponse d'outil de sa demande). */
async function history(conversationId: number): Promise<ChatMessage[]> {
  const all = await db.select().from(schema.aiMessages).where(eq(schema.aiMessages.conversationId, conversationId)).orderBy(asc(schema.aiMessages.id));
  let start = Math.max(0, all.length - HISTORY);
  while (start > 0 && all[start].role !== "user") start--;
  return all.slice(start).map((m): ChatMessage => {
    if (m.role === "tool") return { role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" };
    if (m.role === "assistant") return { role: "assistant", content: m.content || null, ...(m.toolCalls ? { tool_calls: m.toolCalls as ToolCall[] } : {}) };
    return { role: "user", content: m.content };
  });
}

/** Un tour de modèle en streaming : renvoie le texte et les appels d'outils. */
async function* complete(key: string, model: string, messages: ChatMessage[], tools: ReturnType<typeof toolsFor>) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages,
      tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: "auto",
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = `Erreur ${res.status} du service OpenAI.`;
    try { msg = JSON.parse(body).error?.message ?? msg; } catch { /* corps non JSON */ }
    if (res.status === 401) msg = "La clé OpenAI est refusée. Vérifiez-la dans Paramètres → Aicha.";
    if (res.status === 429) msg = "Limite OpenAI atteinte (quota ou crédit épuisé). Réessayez plus tard ou vérifiez votre compte OpenAI.";
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const calls: { id: string; name: string; args: string }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let json: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
      try { json = JSON.parse(data); } catch { continue; }
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) yield { kind: "text" as const, text: delta.content };
      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
    }
  }
  yield { kind: "calls" as const, calls: calls.filter(Boolean) };
}

/** Échange complet pour un message utilisateur, en événements à transmettre au navigateur. */
export async function* converse(u: SessionUser, conversationId: number | null, text: string): AsyncGenerator<AiEvent> {
  const cfg = await aiConfig();
  if (!cfg.enabled) { yield { type: "error", message: "Aicha n'est pas encore configurée. Un administrateur doit saisir la clé OpenAI dans Paramètres → Aicha." }; return; }

  let convId = conversationId;
  if (convId) {
    const [c] = await db.select().from(schema.aiConversations).where(eq(schema.aiConversations.id, convId));
    if (!c || c.userId !== u.id) { yield { type: "error", message: "Conversation introuvable." }; return; }
  } else {
    const title = text.replace(/\s+/g, " ").slice(0, 60) + (text.length > 60 ? "…" : "");
    [{ id: convId }] = await db.insert(schema.aiConversations).values({ userId: u.id, title }).returning({ id: schema.aiConversations.id });
    yield { type: "conversation", id: convId, title };
  }
  await db.insert(schema.aiMessages).values({ conversationId: convId, role: "user", content: text });

  const tools = toolsFor(u);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt(u, cfg.company) }, ...(await history(convId))];
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let answer = "";
      let calls: { id: string; name: string; args: string }[] = [];
      for await (const part of complete(cfg.key, cfg.model, messages, tools)) {
        if (part.kind === "text") { answer += part.text; yield { type: "delta", text: part.text }; }
        else calls = part.calls;
      }
      if (!calls.length) {
        await db.insert(schema.aiMessages).values({ conversationId: convId, role: "assistant", content: answer });
        break;
      }
      const toolCalls: ToolCall[] = calls.map((c, i) => ({ id: c.id || `call_${round}_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } }));
      messages.push({ role: "assistant", content: answer || null, tool_calls: toolCalls });
      await db.insert(schema.aiMessages).values({ conversationId: convId, role: "assistant", content: answer, toolCalls });
      for (const call of toolCalls) {
        const tool = TOOLS.find((t) => t.name === call.function.name);
        yield { type: "tool", name: call.function.name, label: tool?.label ?? "Je cherche" };
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* arguments invalides */ }
        const result = JSON.stringify(await runTool(u, call.function.name, args)).slice(0, 24000);
        messages.push({ role: "tool", content: result, tool_call_id: call.id });
        await db.insert(schema.aiMessages).values({ conversationId: convId, role: "tool", content: result, toolCallId: call.id });
      }
      if (round === MAX_ROUNDS - 1) yield { type: "delta", text: "\n\nJe n'ai pas pu terminer : la demande est trop complexe. Pouvez-vous la reformuler en plus simple ?" };
    }
  } catch (e) {
    yield { type: "error", message: (e as Error).message };
  }
  await db.update(schema.aiConversations).set({ updatedAt: new Date() }).where(eq(schema.aiConversations.id, convId));
  yield { type: "done" };
}

/** Vérifie une clé et un modèle auprès d'OpenAI. */
export async function testOpenAI(key: string, model: string) {
  try {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.ok) return { ok: true as const };
    if (res.status === 401) return { ok: false as const, message: "Clé refusée par OpenAI." };
    if (res.status === 404) return { ok: false as const, message: `Le modèle « ${model} » n'est pas disponible avec cette clé.` };
    return { ok: false as const, message: `OpenAI a répondu ${res.status}.` };
  } catch {
    return { ok: false as const, message: "Impossible de joindre OpenAI depuis le serveur." };
  }
}
