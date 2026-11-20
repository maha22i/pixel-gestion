"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import {
  currentWeekStart, findVerification, lineValues, loadEquipmentSnapshot, parseWeekStart,
  removeStoredFile, saveSignedFile,
} from "@/lib/verification";

export async function generateVerification(fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const week = parseWeekStart(String(fd.get("weekStart") ?? "")) ?? currentWeekStart();
  const [existing] = await db.select().from(schema.equipmentVerifications).where(eq(schema.equipmentVerifications.weekStart, week));
  if (existing) redirect(`/verification/${existing.id}`);

  const rows = await loadEquipmentSnapshot();
  if (!rows.length) redirect("/verification?err=vide");

  const [created] = await db.insert(schema.equipmentVerifications).values({
    weekStart: week,
    generatedBy: user.id,
  }).returning();
  await db.insert(schema.equipmentVerificationLines).values(lineValues(created.id, rows));
  revalidatePath("/verification");
  redirect(`/verification/${created.id}?ok=gen`);
}

export async function regenerateVerification(id: number) {
  await requirePerm("materiel", "write");
  const row = await findVerification(id);
  if (!row) redirect("/verification");
  if (row.signedStoredName) redirect(`/verification/${id}?err=figee`);
  const rows = await loadEquipmentSnapshot();
  if (!rows.length) redirect(`/verification/${id}?err=vide`);
  await db.delete(schema.equipmentVerificationLines).where(eq(schema.equipmentVerificationLines.verificationId, id));
  await db.insert(schema.equipmentVerificationLines).values(lineValues(id, rows));
  await db.update(schema.equipmentVerifications).set({ generatedAt: new Date() }).where(eq(schema.equipmentVerifications.id, id));
  revalidatePath("/verification");
  revalidatePath(`/verification/${id}`);
  redirect(`/verification/${id}?ok=maj`);
}

export async function uploadSignedVerification(id: number, fd: FormData) {
  const user = await requirePerm("materiel", "write");
  const row = await findVerification(id);
  if (!row) redirect("/verification");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(`/verification/${id}?err=fichier`);
  const saved = await saveSignedFile(file);
  if (!saved) redirect(`/verification/${id}?err=fichier`);
  await removeStoredFile(row.signedStoredName);
  await db.update(schema.equipmentVerifications).set({
    signedFilename: saved.filename,
    signedStoredName: saved.storedName,
    signedMime: saved.mime,
    signedSize: saved.size,
    signedUploadedAt: new Date(),
    signedUploadedBy: user.id,
  }).where(eq(schema.equipmentVerifications.id, id));
  revalidatePath("/verification");
  revalidatePath(`/verification/${id}`);
  redirect(`/verification/${id}?ok=signe`);
}
