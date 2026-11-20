"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/format";
import { signaturePng } from "@/lib/sign";

export async function signQuote(token: string, fd: FormData) {
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.signToken, token));
  if (!q) redirect("/");
  if (q.signedAt) redirect(`/signer/${token}`);
  if (q.status === "refuse") redirect(`/signer/${token}?e=refuse`);
  if (q.validUntil && q.validUntil < today()) redirect(`/signer/${token}?e=expire`);

  const name = String(fd.get("signerName") ?? "").trim();
  const accord = fd.get("accord") === "1";
  const png = signaturePng(String(fd.get("signature") ?? ""));
  if (!accord || name.length < 2 || !png) redirect(`/signer/${token}?e=incomplet`);

  await db.update(schema.quotes).set({
    signerName: name.slice(0, 200),
    signatureData: png.toString("base64"),
    signedAt: new Date(),
    status: "accepte",
  }).where(eq(schema.quotes.id, q.id));
  revalidatePath(`/devis/${q.id}`);
  revalidatePath("/devis");
  redirect(`/signer/${token}?ok=1`);
}
