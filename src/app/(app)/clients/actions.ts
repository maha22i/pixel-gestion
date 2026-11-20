"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";

function values(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const type = String(fd.get("type") ?? "particulier");
  return {
    type: type in { particulier: 1, entreprise: 1, institution: 1, restaurant: 1, hotel: 1, association: 1, etablissement_public: 1 } ? type : "particulier",
    name: s("name") ?? "Sans nom",
    acronym: s("acronym"),
    nif: s("nif"),
    repCivility: s("repCivility"),
    repName: s("repName"),
    repTitle: s("repTitle"),
    contactName: s("contactName"),
    contactRole: s("contactRole"),
    phone: s("phone"),
    email: s("email"),
    address: s("address"),
    notes: s("notes"),
  };
}

export async function createClient(fd: FormData) {
  await requirePerm("clients", "write");
  const [c] = await db.insert(schema.clients).values(values(fd)).returning({ id: schema.clients.id });
  revalidatePath("/clients");
  const raw = String(fd.get("back") ?? "");
  const back = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  redirect(back ? `${back}${back.includes("?") ? "&" : "?"}client=${c.id}` : `/clients/${c.id}`);
}

export async function updateClient(id: number, fd: FormData) {
  await requirePerm("clients", "write");
  await db.update(schema.clients).set(values(fd)).where(eq(schema.clients.id, id));
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}?ok=1`);
}

export async function deleteClient(id: number) {
  await requirePerm("clients", "write");
  const res = await db.execute(sql`
    SELECT (SELECT count(*) FROM quotes WHERE client_id = ${id})
      + (SELECT count(*) FROM invoices WHERE client_id = ${id})
      + (SELECT count(*) FROM contracts WHERE client_id = ${id}) AS n`);
  if (Number((res.rows[0] as any).n) > 0) redirect(`/clients/${id}?e=lie`);
  await db.delete(schema.clients).where(eq(schema.clients.id, id));
  revalidatePath("/clients");
  redirect("/clients");
}
