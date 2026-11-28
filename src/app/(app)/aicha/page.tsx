import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { aiConfig } from "@/lib/ai/engine";
import { AichaChat } from "./AichaChat";

export const dynamic = "force-dynamic";

export default async function AichaPage({ searchParams }: { searchParams: { c?: string } }) {
  const user = await requireUser();
  if (!can(user, "aicha")) redirect("/acces-refuse");
  const cfg = await aiConfig();
  const conversations = await db.select({ id: schema.aiConversations.id, title: schema.aiConversations.title, updatedAt: schema.aiConversations.updatedAt })
    .from(schema.aiConversations).where(eq(schema.aiConversations.userId, user.id)).orderBy(desc(schema.aiConversations.updatedAt)).limit(60);
  const current = conversations.find((c) => c.id === Number(searchParams.c)) ?? null;
  // Seuls les messages lisibles (questions et réponses) sont affichés ; les échanges avec les outils restent internes.
  const messages = current
    ? (await db.select({ role: schema.aiMessages.role, content: schema.aiMessages.content }).from(schema.aiMessages)
      .where(and(eq(schema.aiMessages.conversationId, current.id), inArray(schema.aiMessages.role, ["user", "assistant"])))
      .orderBy(asc(schema.aiMessages.id)))
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
    : [];

  return (
    <AichaChat
      key={current?.id ?? "new"}
      enabled={cfg.enabled}
      isAdmin={user.role === "admin"}
      userName={user.name}
      conversationId={current?.id ?? null}
      initial={messages}
      conversations={conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString() }))}
    />
  );
}
