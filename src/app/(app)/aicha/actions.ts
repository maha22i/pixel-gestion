"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { openSecret, sealSecret } from "@/lib/ai/secret";
import { testOpenAI } from "@/lib/ai/engine";

export async function deleteConversation(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  await db.delete(schema.aiConversations).where(and(eq(schema.aiConversations.id, id), eq(schema.aiConversations.userId, user.id)));
  revalidatePath("/aicha");
  redirect("/aicha");
}

/** Réglages d'Aicha (admin) : clé OpenAI chiffrée, modèle, activation. La clé est testée avant d'être activée. */
export async function saveAiSettings(fd: FormData) {
  await requireAdmin();
  const st = await getSettings();
  const typed = String(fd.get("apiKey") ?? "").trim();
  const model = String(fd.get("model") === "autre" ? fd.get("customModel") : fd.get("model") ?? "").trim() || "gpt-4.1-mini";
  const enabled = fd.get("enabled") === "on";
  const key = typed || openSecret(st.aiApiKey);
  if (fd.get("removeKey") === "1") {
    await db.update(schema.settings).set({ aiApiKey: "", aiEnabled: false }).where(eq(schema.settings.id, 1));
    revalidatePath("/", "layout");
    redirect("/parametres?ia=1&ok=retiree");
  }
  if (enabled && !key) redirect("/parametres?ia=1&e=cle");
  if (key && (typed || enabled)) {
    const test = await testOpenAI(key, model);
    if (!test.ok) redirect(`/parametres?ia=1&e=test&msg=${encodeURIComponent(test.message)}`);
  }
  await db.update(schema.settings).set({ aiApiKey: typed ? sealSecret(typed) : st.aiApiKey, aiModel: model, aiEnabled: enabled && !!key }).where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  redirect("/parametres?ia=1&ok=1");
}
