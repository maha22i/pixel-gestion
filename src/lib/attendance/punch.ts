import "server-only";
import { cookies, headers } from "next/headers";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createRemember, REMEMBER_INTENT_COOKIE, type SessionUser } from "@/lib/auth";
import { notify } from "@/lib/tasks";
import { distanceMeters, finiteCoord } from "./geo";
import { decideMission, decideOffice, gpsVerdict } from "./decide";
import { GPS_HELP, reasonLabel } from "./labels";
import { clientIpFromHeaders, normalizeIp } from "./ip";
import { dayStep } from "./dayStep";
import { djiboutiClock, formatDjiboutiTime } from "./time";
import { secretsEqual, tokenHash } from "./token";

export type PunchResult =
  | { ok: true; status: string; message: string; firstDevice: boolean }
  | { ok: false; code?: string; message: string };

type Input = {
  mode: "bureau" | "mission";
  secret: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  deviceToken: string;
  persist: boolean;
  taskId: number | null;
  projectId: number | null;
  slipId: number | null;
};

export async function recordPunch(user: SessionUser, input: Input): Promise<PunchResult> {
  if (!input.persist || input.deviceToken.length < 16) {
    return { ok: false, code: "private", message: "Le pointage est refusé en navigation privée : le téléphone ne peut pas y être mémorisé. Ouvre Pixel Nomade dans le navigateur habituel, ou depuis l'icône ajoutée à l'écran d'accueil." };
  }
  const [me] = await db.select({ consent: schema.users.attendanceConsentAt, name: schema.users.name }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!me?.consent) {
    return { ok: false, code: "consent", message: "Accepte d'abord le rappel sur la position et le réseau." };
  }

  const clock = djiboutiClock();
  const hash = tokenHash(input.deviceToken);
  const phone = await resolvePhone(user.id, hash, headers().get("user-agent"));
  if (phone.firstDevice) await maybeRemember(user.id, hash);

  const todayOpen = await db.select().from(schema.attendancePunches)
    .where(and(eq(schema.attendancePunches.userId, user.id), eq(schema.attendancePunches.day, clock.day), ne(schema.attendancePunches.status, "refuse")));
  const step = dayStep(todayOpen);
  if (step === "fini") {
    return { ok: false, message: "Ta journée est déjà enregistrée : une arrivée et une sortie. Tu n'as plus à pointer aujourd'hui." };
  }
  const kind = step;

  const [recent] = await db.select().from(schema.attendancePunches)
    .where(eq(schema.attendancePunches.userId, user.id))
    .orderBy(desc(schema.attendancePunches.punchedAt))
    .limit(1);
  if (recent && recent.status !== "refuse" && recent.kind === kind && Date.now() - recent.punchedAt.getTime() < 60_000) {
    return { ok: true, status: recent.status, message: alreadyMessage(recent.kind, recent.status, recent.punchedAt), firstDevice: false };
  }

  const ip = clientIpFromHeaders(headers());
  const coords = finiteCoord(input.lat, input.lng);
  const accuracy = input.accuracyM != null && Number.isFinite(input.accuracyM) ? Math.max(0, Math.round(input.accuracyM)) : null;

  let siteId: number | null = null;
  let siteName = "";
  let decision;
  let distance: number | null = null;
  let ipOk = false;
  let qrOk = false;

  if (input.mode === "mission") {
    const link = await missionLinkOk(user, input);
    if (!link.ok) return { ok: false, message: link.message };
    decision = decideMission({
      gpsMissing: !coords,
      phoneOk: phone.ok,
      phoneForeign: phone.foreign,
    });
  } else {
    const site = await siteFromSecret(input.secret);
    qrOk = !!site;
    if (site) {
      siteId = site.id;
      siteName = site.name;
      const ips = await db.select({ ip: schema.attendanceSiteIps.ip }).from(schema.attendanceSiteIps).where(eq(schema.attendanceSiteIps.siteId, site.id));
      ipOk = !!ip && ips.some((row) => normalizeIp(row.ip) === ip);
      const ready = site.lat != null && site.lng != null;
      if (ready && coords) distance = Math.round(distanceMeters(coords.lat, coords.lng, site.lat as number, site.lng as number));
      const gps = !ready ? "ok" : coords ? gpsVerdict(distance, accuracy, site.radiusM) : "missing";
      decision = decideOffice({
        qrOk: true,
        gps: gps as "ok" | "fuzzy" | "out" | "missing",
        phoneOk: phone.ok,
        phoneForeign: phone.foreign,
        ipOk,
        siteReady: ready,
      });
    } else {
      decision = decideOffice({ qrOk: false, gps: coords ? "ok" : "missing", phoneOk: phone.ok, phoneForeign: phone.foreign, ipOk: false, siteReady: true });
    }
  }

  const [punch] = await db.insert(schema.attendancePunches).values({
    userId: user.id,
    siteId,
    kind,
    channel: input.mode === "mission" ? "mission" : "bureau",
    punchedAt: new Date(),
    day: clock.day,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    accuracyM: accuracy,
    distanceM: distance,
    ip: ip || null,
    ipOk,
    qrOk,
    reasonCodes: decision.reasons.join(","),
    status: decision.status,
    taskId: input.mode === "mission" ? input.taskId : null,
    projectId: input.mode === "mission" ? input.projectId : null,
    slipId: input.mode === "mission" ? input.slipId : null,
    source: "scan",
    createdBy: user.id,
  }).returning({ id: schema.attendancePunches.id, punchedAt: schema.attendancePunches.punchedAt });

  await db.insert(schema.attendancePunchEvents).values({
    punchId: punch.id,
    actorId: user.id,
    action: "cree",
    reason: decision.reasons.join(",") || null,
  });

  if (phone.requestCreated) {
    const managers = await presenceRecipients(user.id);
    await notify(managers, "presence_telephone", `${me.name} demande la validation d'un nouveau téléphone.`, undefined, user.id, "/presences?vue=valider");
  }
  if (decision.status === "refuse") {
    const managers = await presenceRecipients(user.id);
    await notify(managers, "presence_refuse", `Pointage refusé pour ${me.name} : ${reasonLabel(decision.reasons.join(","))}.`, undefined, user.id, "/presences?vue=valider");
  }

  const time = formatDjiboutiTime(punch.punchedAt);
  let message = statusMessage(kind, decision.status, time, siteName, decision.reasons);
  if (decision.reasons.includes("gps_absent")) message = `${message} ${GPS_HELP}`;
  return { ok: true, status: decision.status, message, firstDevice: phone.firstDevice };
}

async function maybeRemember(userId: number, hash: string) {
  if (cookies().get(REMEMBER_INTENT_COOKIE)?.value !== "1") return;
  await createRemember(userId, hash);
  cookies().delete(REMEMBER_INTENT_COOKIE);
}

async function resolvePhone(userId: number, hash: string, userAgent: string | null) {
  const [byToken] = await db.select().from(schema.attendanceDevices).where(eq(schema.attendanceDevices.tokenHash, hash));
  const [byUser] = await db.select().from(schema.attendanceDevices).where(eq(schema.attendanceDevices.userId, userId));
  if (byToken && byToken.userId !== userId) return { ok: false, foreign: true, firstDevice: false, requestCreated: false };
  if (byUser && byUser.tokenHash === hash) return { ok: true, foreign: false, firstDevice: false, requestCreated: false };
  if (!byUser) {
    await db.insert(schema.attendanceDevices).values({ userId, tokenHash: hash, userAgent, approvedAt: new Date() });
    return { ok: true, foreign: false, firstDevice: true, requestCreated: false };
  }
  const [pending] = await db.select({ id: schema.attendanceDeviceRequests.id }).from(schema.attendanceDeviceRequests)
    .where(and(eq(schema.attendanceDeviceRequests.userId, userId), eq(schema.attendanceDeviceRequests.tokenHash, hash), eq(schema.attendanceDeviceRequests.status, "pending")));
  let requestCreated = false;
  if (!pending) {
    await db.insert(schema.attendanceDeviceRequests).values({ userId, tokenHash: hash, userAgent, status: "pending" });
    requestCreated = true;
  }
  return { ok: false, foreign: false, firstDevice: false, requestCreated };
}

async function siteFromSecret(secret: string) {
  if (!secret) return null;
  const sites = await db.select().from(schema.attendanceSites).where(eq(schema.attendanceSites.active, true));
  return sites.find((s) => s.qrSecret && secretsEqual(s.qrSecret, secret)) ?? null;
}

async function missionLinkOk(user: SessionUser, input: Input): Promise<{ ok: true } | { ok: false; message: string }> {
  const chosen = [input.taskId, input.projectId, input.slipId].filter(Boolean);
  if (chosen.length !== 1) return { ok: false, message: "Choisis la tâche, le projet ou le bon de sortie concerné." };
  const wide = user.role === "admin" || user.perms.presences === "write";
  if (input.taskId) {
    const rows = await db.execute(wide
      ? sql`SELECT id FROM tasks WHERE id = ${input.taskId} AND status <> 'annule'`
      : sql`SELECT t.id FROM tasks t JOIN task_assignees a ON a.task_id = t.id AND a.user_id = ${user.id} WHERE t.id = ${input.taskId} AND t.status <> 'annule'`);
    if (!rows.rows.length) return { ok: false, message: "Cette tâche ne t'est pas accessible." };
  }
  if (input.projectId) {
    const rows = await db.execute(wide
      ? sql`SELECT id FROM projects WHERE id = ${input.projectId} AND status <> 'annule'`
      : sql`SELECT p.id FROM projects p WHERE p.id = ${input.projectId} AND p.status <> 'annule' AND (p.owner_id = ${user.id} OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${user.id}))`);
    if (!rows.rows.length) return { ok: false, message: "Ce projet ne t'est pas accessible." };
  }
  if (input.slipId) {
    const rows = await db.execute(wide
      ? sql`SELECT id FROM equipment_slips WHERE id = ${input.slipId} AND status IN ('sorti', 'attente_controle')`
      : sql`SELECT s.id FROM equipment_slips s WHERE s.id = ${input.slipId} AND s.status IN ('sorti', 'attente_controle') AND (s.responsible_user_id = ${user.id} OR s.created_by = ${user.id} OR EXISTS (SELECT 1 FROM equipment_slip_members m WHERE m.slip_id = s.id AND m.user_id = ${user.id}))`);
    if (!rows.rows.length) return { ok: false, message: "Ce bon de sortie ne t'est pas accessible." };
  }
  return { ok: true };
}

export async function presenceRecipients(except?: number) {
  const users = await db.select({ id: schema.users.id, role: schema.users.role }).from(schema.users).where(eq(schema.users.active, true));
  const perms = await db.select().from(schema.permissions).where(eq(schema.permissions.module, "presences"));
  const write = new Set(perms.filter((p) => p.level === "write").map((p) => p.userId));
  return users.filter((u) => u.id !== except && (u.role === "admin" || u.role === "manager" || write.has(u.id))).map((u) => u.id);
}

function statusMessage(kind: "arrivee" | "depart", status: string, time: string, siteName: string, reasons: string[]) {
  const word = kind === "arrivee" ? "Arrivée" : "Départ";
  const verb = kind === "arrivee" ? "enregistrée" : "enregistré";
  const place = siteName ? ` – ${siteName}` : "";
  const why = reasonLabel(reasons.join(","));
  if (status === "valide") return `${word} ${verb} à ${time}${place}.`;
  if (status === "a_verifier") return `${word} ${verb} à ${time}${place}. À vérifier : ${why}. Le manager doit valider.`;
  if (status === "mission") return `Mission ${verb} à ${time}. Le manager doit valider.`;
  return `Pointage refusé : ${why}.`;
}

function alreadyMessage(kind: string, status: string, at: Date) {
  const time = formatDjiboutiTime(at);
  const word = kind === "depart" ? "Départ" : "Arrivée";
  if (status === "refuse") return `Pointage déjà refusé à ${time}.`;
  const verb = kind === "depart" ? "enregistré" : "enregistrée";
  return `${word} déjà ${verb} à ${time}.`;
}
