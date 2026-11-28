import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { Printer, QrCode, RefreshCw, Wifi } from "lucide-react";
import { db, schema } from "@/db";
import { clientIpFromHeaders } from "@/lib/attendance/ip";
import { WEEKDAY_LABELS } from "@/lib/attendance/labels";
import { SubmitButton } from "@/components/ConfirmButton";
import { Avatar } from "@/components/ui";
import { UseMyPosition } from "./UseMyPosition";
import { addCurrentIp, addHoliday, addSite, deleteHoliday, deleteIp, generateQr, resetDevice, saveSchedule, saveSite } from "./presenceActions";

const SHORT_DAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const dayFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

/** Résumé des réglages de pointage, pour les cartes de la page Paramètres. */
export async function presenceOverview(today: string) {
  const [schedule] = await db.select().from(schema.attendanceSchedule).where(eq(schema.attendanceSchedule.id, 1));
  const sites = await db.select().from(schema.attendanceSites);
  const ips = await db.select({ siteId: schema.attendanceSiteIps.siteId }).from(schema.attendanceSiteIps);
  const holidays = await db.select().from(schema.attendanceHolidays).orderBy(asc(schema.attendanceHolidays.day));
  const devices = await db.select({ userId: schema.attendanceDevices.userId }).from(schema.attendanceDevices);
  const people = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.active, true));
  const days = (schedule?.workDays ?? "0,1,2,3,4").split(",").map(Number).sort();
  const next = holidays.find((h) => h.day >= today);
  return {
    schedule: `${schedule?.startTime ?? "08:00"} – ${schedule?.endTime ?? "17:00"} · ${days.map((d) => SHORT_DAYS[d]).join(", ")} · tolérance ${schedule?.lateToleranceMin ?? 15} min`,
    sites: {
      text: sites.length ? `${sites.length} site${sites.length > 1 ? "s" : ""} · ${sites.filter((s) => s.qrSecret).length} QR code(s) généré(s)` : "Aucun site de pointage",
      todo: sites.length === 0 || sites.some((s) => !s.qrSecret || s.lat == null || !ips.some((i) => i.siteId === s.id)),
    },
    holidays: `${holidays.length} jour${holidays.length > 1 ? "s" : ""}${next ? ` · prochain : ${next.name} (${next.day.split("-").reverse().join("/")})` : ""}`,
    devices: { text: `${new Set(devices.map((d) => d.userId)).size} / ${people.length} employés ont un téléphone enregistré`, count: devices.length },
  };
}

export async function ScheduleSection() {
  const [schedule] = await db.select().from(schema.attendanceSchedule).where(eq(schema.attendanceSchedule.id, 1));
  const days = new Set((schedule?.workDays ?? "0,1,2,3,4").split(","));
  return (
    <form action={saveSchedule} className="card">
      <div className="space-y-5 p-5 sm:p-6">
        <fieldset>
          <legend className="label">Jours travaillés</legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, index) => (
              <label key={label} className="cursor-pointer">
                <input type="checkbox" name={`day_${index}`} value="on" defaultChecked={days.has(String(index))} className="peer sr-only" />
                <span className="inline-flex h-9 items-center rounded-lg border border-navy-200 bg-white px-3.5 text-sm font-semibold text-navy-700 transition peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block"><span className="label">Heure d'arrivée</span><input name="startTime" type="time" className="input" defaultValue={schedule?.startTime ?? "08:00"} /></label>
          <label className="block"><span className="label">Heure de départ</span><input name="endTime" type="time" className="input" defaultValue={schedule?.endTime ?? "17:00"} /></label>
          <label className="block"><span className="label">Tolérance de retard (min)</span><input name="tolerance" type="number" min={0} className="input" defaultValue={schedule?.lateToleranceMin ?? 15} /></label>
        </div>
        <p className="text-sm text-navy-600/75">Une arrivée après l'heure d'arrivée + la tolérance compte comme un retard. Le temps au-delà de l'horaire compte en heures sup.</p>
      </div>
      <div className="flex justify-end border-t border-navy-100 bg-navy-50/40 px-5 py-4 sm:px-6">
        <SubmitButton>Enregistrer les horaires</SubmitButton>
      </div>
    </form>
  );
}

export async function SitesSection() {
  const ip = clientIpFromHeaders(headers());
  const sites = await db.select().from(schema.attendanceSites).orderBy(asc(schema.attendanceSites.name));
  const ips = await db.select().from(schema.attendanceSiteIps).orderBy(asc(schema.attendanceSiteIps.id));
  return (
    <div className="space-y-6">
      {sites.map((site) => {
        const siteIps = ips.filter((row) => row.siteId === site.id);
        return (
          <section key={site.id} className="card">
            <form action={saveSite}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-4 sm:px-6">
                <h3 className="font-bold text-navy">{site.name}</h3>
                <span className={site.active ? "badge-green" : "badge-gray"}>{site.active ? "Actif" : "Inactif"}</span>
              </div>
              <input type="hidden" name="id" value={site.id} />
              <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
                <label className="block"><span className="label">Nom</span><input name="name" className="input" defaultValue={site.name} required /></label>
                <label className="block"><span className="label">Adresse</span><input name="address" className="input" defaultValue={site.address} /></label>
                <label className="block"><span className="label">Latitude</span><input id={`lat-${site.id}`} name="lat" className="input" defaultValue={site.lat ?? ""} /></label>
                <label className="block"><span className="label">Longitude</span><input id={`lng-${site.id}`} name="lng" className="input" defaultValue={site.lng ?? ""} /></label>
                <label className="block"><span className="label">Rayon autorisé (mètres)</span><input name="radius" type="number" min={20} className="input" defaultValue={site.radiusM} /></label>
                <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold text-navy-700"><input type="checkbox" name="active" defaultChecked={site.active} className="h-4 w-4 accent-[#2C3E50]" /> Site actif</label>
                <div className="sm:col-span-2"><UseMyPosition latId={`lat-${site.id}`} lngId={`lng-${site.id}`} /></div>
              </div>
              <div className="flex justify-end border-t border-navy-100 bg-navy-50/40 px-5 py-3 sm:px-6">
                <SubmitButton>Enregistrer le site</SubmitButton>
              </div>
            </form>

            <div className="grid gap-6 border-t border-navy-100 p-5 sm:p-6 lg:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 font-bold text-navy"><Wifi size={16} className="text-gold-600" /> Réseau du bureau</p>
                <p className="mt-1 text-sm text-navy-600/80">À enregistrer depuis le Wi-Fi du bureau (pas en 4G). Un ordinateur et un téléphone peuvent montrer deux adresses (IPv4 et IPv6) : enregistrez les deux.</p>
                <p className="mt-3 text-sm">Votre adresse actuelle : <b className="tabular-nums text-navy">{ip || "introuvable"}</b></p>
                {siteIps.length > 0 && (
                  <ul className="mt-2 divide-y divide-navy-100 rounded-lg border border-navy-100">
                    {siteIps.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-semibold tabular-nums text-navy">{row.ip}</span>
                        <form action={deleteIp}><input type="hidden" name="id" value={row.id} /><button className="btn-ghost btn-sm">Retirer</button></form>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={addCurrentIp} className="mt-3"><input type="hidden" name="id" value={site.id} /><button className="btn-ghost">Enregistrer mon adresse actuelle</button></form>
              </div>
              <div>
                <p className="flex items-center gap-2 font-bold text-navy"><QrCode size={16} className="text-gold-600" /> QR code de pointage</p>
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  {site.qrSecret
                    ? <img src={`/api/presence-qr/${site.id}`} alt={`QR ${site.name}`} className="h-36 w-36 rounded-xl border border-navy-100 bg-white p-2" />
                    : <div className="grid h-36 w-36 place-items-center rounded-xl border border-dashed border-navy-200 text-center text-xs text-navy-600/70">Pas encore généré</div>}
                  <div className="flex flex-col gap-2">
                    {!site.qrSecret && <form action={generateQr}><input type="hidden" name="id" value={site.id} /><button className="btn-primary"><QrCode size={16} /> Générer le QR code</button></form>}
                    {site.qrSecret && <a className="btn-gold" href={`/api/presence-poster/${site.id}`}><Printer size={16} /> Imprimer l'affiche A4</a>}
                    {site.qrSecret && <form action={generateQr}><input type="hidden" name="id" value={site.id} /><input type="hidden" name="force" value="1" /><button className="btn-danger"><RefreshCw size={15} /> Régénérer</button></form>}
                  </div>
                </div>
                {site.qrSecret && <p className="mt-2 text-xs text-navy-600/70">Régénérer désactive l'ancienne affiche : il faudra imprimer la nouvelle.</p>}
              </div>
            </div>
          </section>
        );
      })}

      <form action={addSite} className="card grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-6">
        <label className="block"><span className="label">Nouveau site</span><input name="name" className="input" placeholder="ex. Studio Héron" required /></label>
        <label className="block"><span className="label">Adresse</span><input name="address" className="input" /></label>
        <SubmitButton>Ajouter le site</SubmitButton>
      </form>
    </div>
  );
}

export async function HolidaysSection() {
  const holidays = await db.select().from(schema.attendanceHolidays).orderBy(asc(schema.attendanceHolidays.day));
  return (
    <section className="card">
      <form action={addHoliday} className="grid gap-3 border-b border-navy-100 p-5 sm:grid-cols-[180px_1fr_auto] sm:items-end sm:p-6">
        <label className="block"><span className="label">Date</span><input name="day" type="date" className="input" required /></label>
        <label className="block"><span className="label">Nom du jour férié</span><input name="name" className="input" placeholder="ex. Fête de l'Indépendance" required /></label>
        <SubmitButton>Ajouter</SubmitButton>
      </form>
      <p className="px-5 pt-4 text-sm text-navy-600/75 sm:px-6">Liste préremplie pour Djibouti. Les fêtes lunaires sont des dates estimées : ajustez-les quand elles sont annoncées.</p>
      {holidays.length === 0 ? <p className="px-5 py-6 text-sm text-navy-600/70 sm:px-6">Aucun jour férié.</p> : (
        <ul className="divide-y divide-navy-100 px-5 pb-3 sm:px-6">
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 text-sm">
                <span className="font-bold text-navy">{holiday.name}</span>
                <span className="block text-navy-600/70 first-letter:uppercase">{dayFr(holiday.day)}</span>
              </span>
              <form action={deleteHoliday}><input type="hidden" name="id" value={holiday.id} /><button className="btn-ghost btn-sm">Retirer</button></form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function DevicesSection() {
  const devices = await db.select({
    userId: schema.attendanceDevices.userId,
    createdAt: schema.attendanceDevices.createdAt,
    agent: schema.attendanceDevices.userAgent,
  }).from(schema.attendanceDevices);
  const people = await db.select({ id: schema.users.id, name: schema.users.name, color: schema.users.color, jobTitle: schema.users.jobTitle })
    .from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  return (
    <section className="card">
      <p className="border-b border-navy-100 px-5 py-4 text-sm text-navy-600/80 sm:px-6">
        Chaque employé pointe depuis un seul téléphone. Réinitialisez-le s'il change d'appareil : le prochain pointage enregistrera le nouveau.
      </p>
      <ul className="divide-y divide-navy-100">
        {people.map((person) => {
          const device = devices.find((d) => d.userId === person.id);
          return (
            <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={person.name} color={person.color} size={34} />
                <span className="min-w-0">
                  <span className="block font-bold text-navy">{person.name}</span>
                  <span className="block truncate text-xs text-navy-600/70">
                    {device ? `Téléphone enregistré le ${device.createdAt.toLocaleDateString("fr-FR")}` : "Aucun téléphone enregistré"}
                  </span>
                </span>
              </span>
              {device
                ? <form action={resetDevice}><input type="hidden" name="userId" value={person.id} /><button className="btn-ghost btn-sm">Réinitialiser</button></form>
                : <span className="badge-gray">En attente</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
