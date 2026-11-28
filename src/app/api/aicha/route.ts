import { can, getUser } from "@/lib/auth";
import { converse } from "@/lib/ai/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Conversation avec Aicha : réponse en flux NDJSON (un événement JSON par ligne). */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Non authentifié", { status: 401 });
  if (!can(user, "aicha")) return new Response("Accès refusé", { status: 403 });
  let body: { conversationId?: number; message?: string };
  try { body = await req.json(); } catch { return new Response("Requête invalide", { status: 400 }); }
  const text = String(body.message ?? "").trim().slice(0, 8000);
  if (!text) return new Response("Message vide", { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of converse(user, Number(body.conversationId) || null, text)) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: (e as Error).message }) + "\n"));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
