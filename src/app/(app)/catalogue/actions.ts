"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";

function money(fd: FormData, key: string) {
  return Math.max(0, Math.round(Number(String(fd.get(key) ?? "").replace(/\s/g, "")) || 0));
}

function itemValues(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    kind: s("kind") === "produit" ? "produit" : "service",
    name: s("name") || "Sans nom",
    description: s("description") || null,
    category: s("category") || null,
    unit: s("unit") || "forfait",
    unitPrice: Math.max(0, Math.round(Number(s("unitPrice").replace(/\s/g, "")) || 0)),
    active: fd.get("active") !== null ? fd.get("active") === "on" : true,
  };
}

export async function createItem(fd: FormData) {
  await requirePerm("catalogue", "write");
  await db.insert(schema.catalogItems).values({ ...itemValues(fd), active: true });
  revalidatePath("/catalogue");
  redirect("/catalogue?ok=1");
}

export async function updateItem(id: number, fd: FormData) {
  await requirePerm("catalogue", "write");
  await db.update(schema.catalogItems).set({ ...itemValues(fd), active: fd.get("active") === "on" }).where(eq(schema.catalogItems.id, id));
  revalidatePath("/catalogue");
  redirect("/catalogue?ok=1");
}

export async function deleteItem(id: number) {
  await requirePerm("catalogue", "write");
  // Les lignes de devis/factures gardent leur désignation et prix (catalog_item_id passe à NULL)
  await db.delete(schema.catalogItems).where(eq(schema.catalogItems.id, id));
  revalidatePath("/catalogue");
  redirect("/catalogue");
}

export async function createEventType(fd: FormData) {
  await requirePerm("catalogue", "write");
  const name = String(fd.get("name") ?? "").trim();
  if (name) {
    await db.insert(schema.eventTypes).values({
      name,
      description: String(fd.get("description") ?? "").trim() || null,
      priceDjibouti: money(fd, "priceDjibouti"),
      priceRegions: money(fd, "priceRegions"),
      position: Number(fd.get("position")) || 0,
    });
  }
  revalidatePath("/catalogue/evenements");
  redirect("/catalogue/evenements");
}

export async function updateEventType(id: number, fd: FormData) {
  await requirePerm("catalogue", "write");
  await db.update(schema.eventTypes).set({
    name: String(fd.get("name") ?? "").trim() || "Sans nom",
    description: String(fd.get("description") ?? "").trim() || null,
    priceDjibouti: money(fd, "priceDjibouti"),
    priceRegions: money(fd, "priceRegions"),
    position: Number(fd.get("position")) || 0,
    active: fd.get("active") === "on",
  }).where(eq(schema.eventTypes.id, id));
  revalidatePath("/catalogue/evenements");
  redirect("/catalogue/evenements?ok=1");
}

export async function deleteEventType(id: number) {
  await requirePerm("catalogue", "write");
  await db.delete(schema.eventTypes).where(eq(schema.eventTypes.id, id));
  revalidatePath("/catalogue/evenements");
  redirect("/catalogue/evenements");
}
