import { asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { clientIpFromHeaders } from "@/lib/attendance/ip";
import { WEEKDAY_LABELS } from "@/lib/attendance/labels";
import { SubmitButton } from "@/components/ConfirmButton";
import { Flash } from "@/components/Flash";
import { UseMyPosition } from "./UseMyPosition";
import { addCurrentIp, addHoliday, addSite, deleteHoliday, deleteIp, generateQr, resetDevice, saveSchedule, saveSite } from "./presenceActions";

export async function PresenceSettings({ notice }: { notice?: string }) {
  await requireAdmin();
  const ip = clientIpFromHeaders(headers());
  const [schedule] = await db.select().from(schema.attendanceSchedule).where(eq(schema.attendanceSchedule.id, 1));
  const sites = await db.select().from(schema.attendanceSites).orderBy(asc(schema.attendanceSites.name));
  const ips = await db.select().from(schema.attendanceSiteIps).orderBy(asc(schema.attendanceSiteIps.id));
  const holidays = await db.select().from(schema.attendanceHolidays).orderBy(asc(schema.attendanceHolidays.day));
  const devices = await db.select({
    userId: schema.attendanceDevices.userId,
    name: schema.users.name,
    createdAt: schema.attendanceDevices.createdAt,
    agent: schema.attendanceDevices.userAgent,
  }).from(schema.attendanceDevices).innerJoin(schema.users, eq(schema.users.id, schema.attendanceDevices.userId)).orderBy(asc(schema.users.name));
  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const days = new Set((schedule?.workDays ?? "0,1,2,3,4").split(","));
  const notices: Record<string, string> = {
    horaire: "Horaires enregistrés.",
    site: "Site enregistré.",
    qr: "QR code mis à jour. Imprime la nouvelle affiche : l'ancienne ne fonctionne plus.",
    ip: "Adresse IP enregistrée.",
    ferie: "Jours fériés mis à jour.",
    telephone: "Téléphone réinitialisé. Le prochain pointage enregistrera le nouvel appareil.",
  };

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-navy">Pointage</h2>
        <p className="text-navy-600">Sites, QR code, réseau du bureau, horaires, fériés et téléphones.</p>
      </div>
      <Flash message={notice ? notices[notice] : ""} clear={["presence"]} />

      <form action={saveSchedule} className="card card-pad space-y-3">
        <p className="h-section">Horaires de travail</p>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, index) => (
            <label key={label} className="flex items-center gap-2 text-sm font-bold text-navy">
              <input type="checkbox" name={`day_${index}`} value="on" defaultChecked={days.has(String(index))} /> {label}
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-bold">Arrivée<input name="startTime" type="time" className="input" defaultValue={schedule?.startTime ?? "08:00"} /></label>
          <label className="text-sm font-bold">Départ<input name="endTime" type="time" className="input" defaultValue={schedule?.endTime ?? "17:00"} /></label>
          <label className="text-sm font-bold">Tolérance de retard (min)<input name="tolerance" type="number" min={0} className="input" defaultValue={schedule?.lateToleranceMin ?? 15} /></label>
        </div>
        <SubmitButton>Enregistrer les horaires</SubmitButton>
      </form>

      {sites.map((site) => {
        const siteIps = ips.filter((row) => row.siteId === site.id);
        return (
          <div key={site.id} className="card card-pad space-y-4">
            <form action={saveSite} className="space-y-3">
              <p className="h-section">Site de pointage</p>
              <input type="hidden" name="id" value={site.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold">Nom<input name="name" className="input" defaultValue={site.name} required /></label>
                <label className="text-sm font-bold">Adresse<input name="address" className="input" defaultValue={site.address} /></label>
                <label className="text-sm font-bold">Latitude<input id={`lat-${site.id}`} name="lat" className="input" defaultValue={site.lat ?? ""} /></label>
                <label className="text-sm font-bold">Longitude<input id={`lng-${site.id}`} name="lng" className="input" defaultValue={site.lng ?? ""} /></label>
                <label className="text-sm font-bold">Rayon (mètres)<input name="radius" type="number" min={20} className="input" defaultValue={site.radiusM} /></label>
                <label className="mt-6 flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={site.active} /> Site actif</label>
              </div>
              <UseMyPosition latId={`lat-${site.id}`} lngId={`lng-${site.id}`} />
              <SubmitButton>Enregistrer le site</SubmitButton>
            </form>
            <div className="border-t border-navy-100 pt-3">
              <p className="font-bold text-navy">Adresse IP actuelle : {ip || "introuvable"}</p>
              <p className="mt-1 text-sm text-navy-600">À cliquer depuis le Wi-Fi du bureau. Un ordinateur et un téléphone peuvent montrer deux adresses (IPv4 et IPv6) : enregistre les deux. N'enregistre pas une adresse vue en 4G.</p>
              <ul className="my-2 text-sm">
                {siteIps.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="font-bold">{row.ip}</span>
                    <form action={deleteIp}><input type="hidden" name="id" value={row.id} /><button className="btn-ghost btn-sm">Retirer</button></form>
                  </li>
                ))}
              </ul>
              <form action={addCurrentIp}><input type="hidden" name="id" value={site.id} /><button className="btn-primary">Enregistrer l'IP actuelle comme celle du bureau</button></form>
            </div>
            <div className="border-t border-navy-100 pt-3">
              <p className="font-bold text-navy">QR code</p>
              {site.qrSecret ? <img src={`/api/presence-qr/${site.id}`} alt={`QR ${site.name}`} className="mt-3 h-48 w-48 rounded-xl border border-navy-100 bg-white p-2" /> : <p className="mt-2 text-sm text-navy-600">Pas encore généré.</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {!site.qrSecret && <form action={generateQr}><input type="hidden" name="id" value={site.id} /><button className="btn-primary">Générer le QR code</button></form>}
                {site.qrSecret && <a className="btn-gold" href={`/api/presence-poster/${site.id}`}>Imprimer l'affiche A4</a>}
                {site.qrSecret && <form action={generateQr}><input type="hidden" name="id" value={site.id} /><input type="hidden" name="force" value="1" /><button className="btn-danger">Régénérer et désactiver l'ancien</button></form>}
              </div>
            </div>
          </div>
        );
      })}

      <form action={addSite} className="card card-pad grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-bold">Nouveau site<input name="name" className="input" required /></label>
        <label className="text-sm font-bold">Adresse<input name="address" className="input" /></label>
        <SubmitButton>Ajouter</SubmitButton>
      </form>

      <div className="card card-pad space-y-3">
        <p className="h-section">Jours fériés</p>
        <p className="text-sm text-navy-600">Liste préremplie pour Djibouti. Les fêtes lunaires sont des dates estimées : ajuste-les quand les autorités les annoncent. Ces jours ne comptent ni comme absence ni comme retard.</p>
        <ul className="divide-y divide-navy/5 text-sm">
          {holidays.map((holiday) => (
            <li key={holiday.id} className="flex items-center justify-between gap-2 py-2">
              <span><span className="font-bold">{holiday.day.split("-").reverse().join("/")}</span> · {holiday.name}</span>
              <form action={deleteHoliday}><input type="hidden" name="id" value={holiday.id} /><button className="btn-ghost btn-sm">Retirer</button></form>
            </li>
          ))}
        </ul>
        <form action={addHoliday} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <input name="day" type="date" className="input" required />
          <input name="name" className="input" placeholder="Nom du férié" required />
          <SubmitButton>Ajouter</SubmitButton>
        </form>
      </div>

      <div className="card card-pad space-y-3">
        <p className="h-section">Téléphones autorisés</p>
        <ul className="divide-y divide-navy/5 text-sm">
          {people.map((person) => {
            const device = devices.find((d) => d.userId === person.id);
            return (
              <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span className="font-bold">{person.name}</span>{device ? ` · enregistré` : " · aucun téléphone"}</span>
                {device && <form action={resetDevice}><input type="hidden" name="userId" value={person.id} /><button className="btn-ghost btn-sm">Réinitialiser</button></form>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
