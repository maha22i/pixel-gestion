"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/tasks";
import { fileFrom, removeProof, storeProof } from "@/lib/proof";
import { CONTRACT_TYPE, LEAVE_KIND, canSeePayroll, canValidateLeave, managersAndAdmins, workingDays } from "@/lib/rh";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fr = (iso: string) => iso.split("-").reverse().join("/");

/* ─────────────── Demandes (employé) ─────────────── */

export async function submitLeave(fd: FormData) {
  const user = await requireUser();
  const kind = str(fd, "kind");
  const start = str(fd, "start");
  const end = str(fd, "end") || start;
  const reason = str(fd, "reason").slice(0, 1000);
  const keep = new URLSearchParams({ nouvelle: "1", type: kind, du: start, au: end });
  const fail = (code: string) => redirect(`/mes-conges?${keep}&e=${code}`);

  if (!(kind in LEAVE_KIND)) fail("type");
  if (!DATE.test(start) || !DATE.test(end) || end < start) fail("dates");
  if (kind === "autre" && !reason) fail("motif");
  const file = fileFrom(fd, "doc");
  if (LEAVE_KIND[kind].needsDoc && !file) fail("certificat");

  // Pas deux demandes actives sur les mêmes jours.
  const [overlap] = await db.select({ id: schema.leaveRequests.id }).from(schema.leaveRequests).where(and(
    eq(schema.leaveRequests.userId, user.id),
    inArray(schema.leaveRequests.status, ["en_attente", "approuve"]),
    lte(schema.leaveRequests.startDate, end),
    gte(schema.leaveRequests.endDate, start),
  ));
  if (overlap) fail("chevauche");

  const days = await workingDays(start, end);
  if (days === 0) fail("jours");

  let doc: { docFilename: string; docStored: string; docMime: string; docSize: number } | null = null;
  if (file) {
    const saved = await storeProof(file);
    if (!saved.ok) fail(saved.code === "taille" ? "taille" : "format");
    else doc = { docFilename: saved.proof.proofFilename, docStored: saved.proof.proofStored, docMime: saved.proof.proofMime, docSize: saved.proof.proofSize };
  }

  await db.insert(schema.leaveRequests).values({ userId: user.id, kind, startDate: start, endDate: end, days, reason, ...(doc ?? {}) });
  await notify(
    await managersAndAdmins(),
    "rh_demande",
    `${user.name} demande : ${LEAVE_KIND[kind].label.toLowerCase()} du ${fr(start)} au ${fr(end)} (${days} j)`,
    undefined,
    user.id,
    "/rh",
  );
  revalidatePath("/mes-conges");
  revalidatePath("/rh");
  redirect("/mes-conges?ok=envoyee");
}

export async function cancelLeave(fd: FormData) {
  const user = await requireUser();
  const id = Number(fd.get("id"));
  const back = str(fd, "back") === "/rh" ? "/rh" : "/mes-conges";
  const [req] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
  if (!req) redirect(back);
  const mine = req.userId === user.id;
  // L'employé annule une demande en attente ; un valideur peut aussi annuler une absence déjà validée.
  if (!(mine && req.status === "en_attente") && !(canValidateLeave(user) && (req.status === "en_attente" || req.status === "approuve"))) redirect("/acces-refuse");
  if (req.absenceId) await db.delete(schema.attendanceAbsences).where(eq(schema.attendanceAbsences.id, req.absenceId));
  await db.update(schema.leaveRequests).set({ status: "annule", absenceId: null, decidedBy: mine ? req.decidedBy : user.id, decidedAt: mine ? req.decidedAt : new Date() })
    .where(eq(schema.leaveRequests.id, id));
  if (!mine) await notify([req.userId], "rh_decision", `${user.name} a annulé votre ${LEAVE_KIND[req.kind]?.label.toLowerCase() ?? "absence"} du ${fr(req.startDate)}`, undefined, user.id, "/mes-conges");
  revalidatePath("/mes-conges");
  revalidatePath("/rh");
  revalidatePath("/presences");
  redirect(`${back}?ok=annulee`);
}

/* ─────────────── Validation (manager / admin) ─────────────── */

export async function decideLeave(fd: FormData) {
  const user = await requireUser();
  if (!canValidateLeave(user)) redirect("/acces-refuse");
  const id = Number(fd.get("id"));
  const decision = str(fd, "decision") === "approuve" ? "approuve" : "refuse";
  const note = str(fd, "note").slice(0, 500);
  const [req] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
  if (!req || req.status !== "en_attente") redirect("/rh");
  if (decision === "refuse" && !note) redirect(`/rh?refuser=${id}&e=motif`);

  let absenceId: number | null = null;
  if (decision === "approuve") {
    const [clash] = await db.select({ id: schema.attendanceAbsences.id }).from(schema.attendanceAbsences).where(and(
      eq(schema.attendanceAbsences.userId, req.userId),
      lte(schema.attendanceAbsences.startDate, req.endDate),
      gte(schema.attendanceAbsences.endDate, req.startDate),
    ));
    if (clash) redirect("/rh?e=chevauche");
    // La demande validée devient une absence justifiée dans les présences.
    const [abs] = await db.insert(schema.attendanceAbsences).values({
      userId: req.userId,
      startDate: req.startDate,
      endDate: req.endDate,
      kind: req.kind,
      reason: req.reason || LEAVE_KIND[req.kind]?.label || "Absence",
      createdBy: user.id,
    }).returning({ id: schema.attendanceAbsences.id });
    absenceId = abs.id;
  }
  await db.update(schema.leaveRequests).set({ status: decision, decidedBy: user.id, decidedAt: new Date(), decisionNote: note || null, absenceId })
    .where(eq(schema.leaveRequests.id, id));
  const label = LEAVE_KIND[req.kind]?.label.toLowerCase() ?? "demande";
  await notify(
    [req.userId],
    "rh_decision",
    decision === "approuve"
      ? `${user.name} a validé votre ${label} du ${fr(req.startDate)} au ${fr(req.endDate)}`
      : `${user.name} a refusé votre ${label} du ${fr(req.startDate)} : ${note}`,
    undefined,
    user.id,
    "/mes-conges",
  );
  revalidatePath("/rh");
  revalidatePath("/presences");
  redirect(`/rh?ok=${decision}`);
}

/* ─────────────── Contrats de travail (admin) ─────────────── */

export async function saveContract(fd: FormData) {
  const user = await requireUser();
  if (!canSeePayroll(user)) redirect("/acces-refuse");
  const id = Number(fd.get("id")) || 0;
  const userId = Number(fd.get("userId"));
  const back = `/rh?vue=equipe&employe=${userId}`;
  const type = str(fd, "contractType");
  const start = str(fd, "startDate");
  const end = str(fd, "endDate");
  if (!userId || !(type in CONTRACT_TYPE) || !DATE.test(start) || (end && (!DATE.test(end) || end < start))) redirect(`${back}${id ? `&contrat=${id}` : "&contrat=nouveau"}&e=contrat`);
  const values = {
    contractType: type,
    jobTitle: str(fd, "jobTitle").slice(0, 120),
    startDate: start,
    endDate: end || null,
    monthlySalary: Math.max(0, Math.round(Number(str(fd, "monthlySalary").replace(/\s/g, "")) || 0)),
    weeklyHours: Math.min(80, Math.max(1, Number(str(fd, "weeklyHours")) || 40)),
    leaveDaysPerYear: Math.min(60, Math.max(0, Number(str(fd, "leaveDaysPerYear")) || 0)),
    notes: str(fd, "notes").slice(0, 2000) || null,
  };
  const file = fileFrom(fd, "doc");
  let doc = {};
  if (file) {
    const saved = await storeProof(file);
    if (!saved.ok) redirect(`${back}${id ? `&contrat=${id}` : "&contrat=nouveau"}&e=${saved.code === "taille" ? "taille" : "format"}`);
    else doc = { docFilename: saved.proof.proofFilename, docStored: saved.proof.proofStored, docMime: saved.proof.proofMime, docSize: saved.proof.proofSize };
  }
  if (id) {
    const [cur] = await db.select().from(schema.employmentContracts).where(eq(schema.employmentContracts.id, id));
    if (!cur || cur.userId !== userId) redirect(back);
    if (file && cur.docStored) await removeProof(cur.docStored);
    await db.update(schema.employmentContracts).set({ ...values, ...doc }).where(eq(schema.employmentContracts.id, id));
  } else {
    await db.insert(schema.employmentContracts).values({ userId, ...values, ...doc, createdBy: user.id });
  }
  // Le poste du contrat devient le poste affiché partout dans l'application.
  if (values.jobTitle) await db.update(schema.users).set({ jobTitle: values.jobTitle }).where(eq(schema.users.id, userId));
  revalidatePath("/rh");
  redirect(`${back}&ok=contrat`);
}

export async function deleteContract(fd: FormData) {
  const user = await requireUser();
  if (!canSeePayroll(user)) redirect("/acces-refuse");
  const id = Number(fd.get("id"));
  const [cur] = await db.select().from(schema.employmentContracts).where(eq(schema.employmentContracts.id, id));
  if (!cur) redirect("/rh?vue=equipe");
  await removeProof(cur.docStored);
  await db.delete(schema.employmentContracts).where(eq(schema.employmentContracts.id, id));
  revalidatePath("/rh");
  redirect(`/rh?vue=equipe&employe=${cur.userId}&ok=supprime`);
}
