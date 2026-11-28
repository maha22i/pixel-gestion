import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import {
  ArrowLeft, Bell, Building2, Sparkles, CalendarDays, ChevronRight, Clock, FileText, ImageIcon, ListChecks, Mail, MapPin, Plus, ShieldCheck, Smartphone, Crown, X,
} from "lucide-react";
import { saveCategory, saveTaskType } from "../taches/actions";
import { saveNotifyPrefs } from "../utilisateurs/actions";
import { NOTIFY_GROUPS, NOTIFY_KEYS } from "@/lib/notifyTypes";
import { AI_MODELS } from "@/lib/ai/engine";
import { maskKey, openSecret } from "@/lib/ai/secret";
import { saveAiSettings } from "../aicha/actions";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { deleteStoredLogo, imageExt, logoTooBig, writeImage, type ImageKind } from "@/lib/logo";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ConfirmButton";
import { Modal } from "@/components/Modal";
import { ImageField } from "./LogoField";
import { RoleDefaultsForm } from "./RoleDefaultsForm";
import { saveRoleDefaults } from "./roleActions";
import { roleDefaults } from "@/lib/permissions";
import { MODULES, ROLE_DEFAULTS, ROLES, normalizeRole } from "@/lib/modules";
import { DevicesSection, HolidaysSection, ScheduleSection, SitesSection, presenceOverview } from "./PresenceSettings";

const IMG_ERR: Record<string, string> = {
  "logo-format": "Le logo doit être une image PNG ou JPEG.",
  "logo-taille": "Le logo ne doit pas dépasser 2 Mo.",
  "signature-format": "La signature doit être une image PNG ou JPEG.",
  "signature-taille": "La signature ne doit pas dépasser 2 Mo.",
};

const PRESENCE_NOTICE: Record<string, { text: string; section: SectionKey }> = {
  horaire: { text: "Horaires enregistrés.", section: "horaires" },
  site: { text: "Site enregistré.", section: "sites" },
  qr: { text: "QR code mis à jour. Imprimez la nouvelle affiche : l'ancienne ne fonctionne plus.", section: "sites" },
  ip: { text: "Adresse IP enregistrée.", section: "sites" },
  ferie: { text: "Jours fériés mis à jour.", section: "feries" },
  telephone: { text: "Téléphone réinitialisé. Le prochain pointage enregistrera le nouvel appareil.", section: "telephones" },
};

const SECTIONS = [
  { key: "entreprise", group: "Société", title: "Entreprise", desc: "Nom, activité, NIF et coordonnées.", icon: Building2, tone: "bg-navy-50 text-navy-700" },
  { key: "identite", group: "Société", title: "Logo & signature", desc: "Images reprises sur les devis, factures et reçus.", icon: ImageIcon, tone: "bg-gold-100 text-amber-800" },
  { key: "documents", group: "Société", title: "Devis & factures", desc: "Signataire, paiements, mentions et validité des devis.", icon: FileText, tone: "bg-sky-50 text-sky-700" },
  { key: "email", group: "Société", title: "Envoi par e-mail", desc: "Serveur d'envoi et adresse publique pour la signature en ligne.", icon: Mail, tone: "bg-violet-50 text-violet-700" },
  { key: "horaires", group: "Pointage", title: "Horaires de travail", desc: "Jours travaillés, heures d'arrivée et de départ, tolérance.", icon: Clock, tone: "bg-emerald-50 text-emerald-700" },
  { key: "sites", group: "Pointage", title: "Sites, QR code & réseau", desc: "Lieux de pointage, position, Wi-Fi du bureau et affiche QR.", icon: MapPin, tone: "bg-red-50 text-red-700" },
  { key: "feries", group: "Pointage", title: "Jours fériés", desc: "Jours comptés ni comme absence ni comme retard.", icon: CalendarDays, tone: "bg-amber-50 text-amber-800" },
  { key: "telephones", group: "Pointage", title: "Téléphones autorisés", desc: "Le téléphone de chaque employé pour pointer.", icon: Smartphone, tone: "bg-slate-100 text-slate-700" },
  { key: "droits", group: "Organisation", title: "Droits par défaut", desc: "Ce que chaque rôle peut voir et faire, sauf droits personnalisés.", icon: ShieldCheck, tone: "bg-indigo-50 text-indigo-700" },
  { key: "listes", group: "Organisation", title: "Listes", desc: "Catégories de projets internes et types de tâches.", icon: ListChecks, tone: "bg-teal-50 text-teal-700" },
  { key: "notifications", group: "Organisation", title: "Notifications", desc: "Les alertes que vous recevez aussi par e-mail.", icon: Bell, tone: "bg-orange-50 text-orange-700" },
  { key: "ia", group: "Organisation", title: "Aicha (IA)", desc: "Assistante conversationnelle : clé OpenAI et modèle.", icon: Sparkles, tone: "bg-gradient-to-br from-gold to-amber-500 text-white" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];
const GROUPS = ["Société", "Pointage", "Organisation"] as const;

const TEXT_FIELDS = [
  "companyName", "tagline", "address", "phone", "email", "website", "paymentMethods", "paymentTerms", "footerNote",
  "signatoryName", "signatoryTitle", "registrationNumber", "smtpHost", "smtpUser", "smtpFrom",
] as const;

async function applyImage(fd: FormData, kind: ImageKind, current: string | null) {
  const file = fd.get(kind);
  const remove = fd.get(kind === "logo" ? "removeLogo" : "removeSignature") === "1";
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    if (logoTooBig(file.size) || logoTooBig(buf.length)) return { path: current, error: `${kind}-taille` };
    if (!imageExt(buf)) return { path: current, error: `${kind}-format` };
    const next = await writeImage(kind, buf);
    await deleteStoredLogo(current);
    return { path: next, error: null };
  }
  if (remove) {
    await deleteStoredLogo(current);
    return { path: null, error: null };
  }
  return { path: current, error: null };
}

/** Enregistre uniquement les champs présents dans le formulaire de la section ouverte. */
async function save(fd: FormData) {
  "use server";
  await requireAdmin();
  const current = await getSettings();
  const section = String(fd.get("section") ?? "");
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const patch: Partial<typeof schema.settings.$inferInsert> = {};
  for (const key of TEXT_FIELDS) if (fd.has(key)) patch[key] = s(key);
  if (fd.has("quoteValidityDays")) patch.quoteValidityDays = Math.max(1, Number(s("quoteValidityDays")) || 30);
  if (fd.has("appUrl")) patch.appUrl = s("appUrl").replace(/\/$/, "");
  if (fd.has("smtpHost")) {
    patch.smtpPort = Math.min(65535, Math.max(1, Number(s("smtpPort")) || 587));
    patch.smtpPassword = s("smtpPassword") || current.smtpPassword;
    patch.smtpSecure = fd.get("smtpSecure") === "1";
  }
  const errors: string[] = [];
  if (fd.has("logo")) {
    const logo = await applyImage(fd, "logo", current.logoPath);
    patch.logoPath = logo.path;
    if (logo.error) errors.push(logo.error);
  }
  if (fd.has("signature")) {
    const signature = await applyImage(fd, "signature", current.signaturePath);
    patch.signaturePath = signature.path;
    if (signature.error) errors.push(signature.error);
  }
  if (Object.keys(patch).length) await db.update(schema.settings).set(patch).where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  const s2 = SECTIONS.some((x) => x.key === section) ? `s=${section}&` : "";
  redirect(errors.length ? `/parametres?${s2}e=${errors.join(",")}` : `/parametres?${s2}ok=1`);
}

export default async function SettingsPage({ searchParams }: { searchParams: { s?: string; ok?: string; e?: string; presence?: string; ajout?: string; nom?: string; ia?: string; msg?: string; role?: string } }) {
  await requireAdmin();
  const notice = searchParams.presence ? PRESENCE_NOTICE[searchParams.presence] : undefined;
  // Les actions de pointage renvoient « ?presence=… » : on rouvre la bonne section dans l'URL.
  if (notice && !searchParams.s) redirect(`/parametres?s=${notice.section}&presence=${searchParams.presence}`);
  const key = SECTIONS.find((x) => x.key === searchParams.s)?.key as SectionKey | undefined;
  const scope = `section-${key ?? "hub"}${searchParams.ajout ? "-ajout" : ""}`;
  const flashes = (
    <>
      <Flash key={`ok-${scope}`} message={searchParams.ajout ? "" : searchParams.ok ? "Paramètres enregistrés." : notice?.text ?? ""} clear={["ok", "presence", scope]} />
      <Flash key={`e-${scope}`} tone="error" clear={["e", scope]} message={searchParams.ajout ? "" : searchParams.e?.split(",").map((code) => IMG_ERR[code]).filter(Boolean).join(" ") ?? ""} />
    </>
  );
  if (searchParams.ia || key === "ia") {
    return <><Hub flashes={null} /><AiModal ok={searchParams.ok} error={searchParams.e} message={searchParams.msg} /></>;
  }
  return key ? <SectionView section={key} flashes={flashes} search={searchParams} /> : <Hub flashes={flashes} />;
}

/* ─────────────────────────── Vue d'ensemble : une carte par catégorie ─────────────────────────── */

async function Hub({ flashes }: { flashes: React.ReactNode }) {
  const me = await requireAdmin();
  const st = await getSettings();
  const [meRow] = await db.select({ prefs: schema.users.notifyPrefs }).from(schema.users).where(eq(schema.users.id, me.id));
  const myPrefs = (meRow?.prefs ?? {}) as Record<string, boolean>;
  const presence = await presenceOverview(today());
  const cats = (await db.select({ id: schema.projectCategories.id }).from(schema.projectCategories)).length;
  const types = (await db.select({ id: schema.taskTypes.id }).from(schema.taskTypes)).length;
  const summary: Record<SectionKey, { text: string; todo?: string; done?: string }> = {
    entreprise: { text: [st.companyName, st.address].filter(Boolean).join(" · "), todo: st.registrationNumber ? undefined : "NIF à renseigner" },
    identite: { text: `Logo ${st.logoPath ? "personnalisé" : "par défaut"} · signature ${st.signaturePath ? "personnalisée" : "par défaut"}` },
    documents: { text: `Signataire : ${st.signatoryName || "—"} · devis valables ${st.quoteValidityDays} jours` },
    email: st.smtpHost
      ? { text: `Envoi via ${st.smtpHost}`, done: "Configuré" }
      : { text: "Sans serveur d'envoi, le lien de signature part par WhatsApp.", todo: "À configurer" },
    horaires: { text: presence.schedule },
    sites: { text: presence.sites.text, todo: presence.sites.todo ? "À compléter" : undefined },
    feries: { text: presence.holidays },
    telephones: { text: presence.devices.text },
    droits: await (async () => {
      const d = await roleDefaults();
      const n = (r: "manager" | "technician") => MODULES.filter((m) => d[r][m.key] !== "none").length;
      return { text: `Manager : ${n("manager")} modules · Technicien : ${n("technician")} modules · Admin : tout` };
    })(),
    listes: { text: `${cats} catégorie${cats > 1 ? "s" : ""} de projets · ${types} type${types > 1 ? "s" : ""} de tâches` },
    ia: st.aiEnabled && st.aiApiKey
      ? { text: `Modèle ${st.aiModel} · disponible pour toute l'équipe dans « Aicha »`, done: "Active" }
      : { text: "Saisissez une clé OpenAI pour activer l'assistante.", todo: "À configurer" },
    notifications: (() => {
      const on = NOTIFY_KEYS.filter((k) => myPrefs[k]).length;
      if (!st.smtpHost) return { text: "Toujours visibles dans la cloche. Envoi par e-mail inactif tant que le serveur n'est pas configuré.", todo: "E-mail inactif" };
      return { text: on ? `${on} type${on > 1 ? "s" : ""} d'alerte envoyé${on > 1 ? "s" : ""} par e-mail` : "Aucune alerte envoyée par e-mail (seulement la cloche)" };
    })(),
  };
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Choisissez une catégorie pour la consulter ou la modifier." />
      {flashes}
      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group}>
            <h2 className="h-section mb-3">{group}</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {SECTIONS.filter((x) => x.group === group).map((x) => {
                const Icon = x.icon;
                const sum = summary[x.key];
                return (
                  <Link
                    key={x.key}
                    href={x.key === "ia" ? "/parametres?ia=1" : `/parametres?s=${x.key}`}
                    className="card group flex flex-col p-5 transition-colors hover:border-gold/70"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${x.tone}`}><Icon size={20} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-bold text-navy">{x.title}</span>
                          {sum.todo && <span className="badge-gold">{sum.todo}</span>}
                          {sum.done && <span className="badge-green">{sum.done}</span>}
                        </span>
                        <span className="mt-0.5 block text-sm text-navy-600/75">{x.desc}</span>
                      </span>
                      <ChevronRight size={18} className="mt-1 shrink-0 text-navy-600/30 transition group-hover:translate-x-0.5 group-hover:text-navy" />
                    </div>
                    <p className="mt-4 line-clamp-2 border-t border-navy-100 pt-3 text-[13px] text-navy-600">{sum.text}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────── Vue d'une catégorie ─────────────────────────── */

async function SectionView({ section, flashes, search }: { section: SectionKey; flashes: React.ReactNode; search: { ajout?: string; e?: string; nom?: string; role?: string } }) {
  const meta = SECTIONS.find((x) => x.key === section)!;
  const Icon = meta.icon;
  return (
    <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:gap-8">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <Link href="/parametres" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600/80 hover:text-navy">
            <ArrowLeft size={16} /> Tous les paramètres
          </Link>
          <nav className="space-y-5" aria-label="Catégories de paramètres">
            {GROUPS.map((group) => (
              <div key={group}>
                <p className="h-section mb-1.5 px-2.5">{group}</p>
                <ul className="space-y-0.5">
                  {SECTIONS.filter((x) => x.group === group).map((x) => {
                    const I = x.icon;
                    const active = x.key === section;
                    return (
                      <li key={x.key}>
                        <Link
                          href={x.key === "ia" ? "/parametres?ia=1" : `/parametres?s=${x.key}`}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${active ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/80 hover:bg-white/70 hover:text-navy"}`}
                        >
                          <I size={16} className={active ? "text-gold-600" : "text-navy-600/50"} />
                          {x.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        <Link href="/parametres" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600/80 hover:text-navy lg:hidden">
          <ArrowLeft size={16} /> Tous les paramètres
        </Link>
        <div className="mb-6 flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${meta.tone}`}><Icon size={22} /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-navy">{meta.title}</h1>
            <p className="mt-0.5 text-navy-600/75">{meta.desc}</p>
          </div>
        </div>
        {flashes}
        {section === "horaires" ? <ScheduleSection />
          : section === "sites" ? <SitesSection />
          : section === "feries" ? <HolidaysSection />
          : section === "telephones" ? <DevicesSection />
          : section === "notifications" ? <NotificationsSection />
          : section === "listes" ? <ListsSection adding={search.ajout === "categorie" || search.ajout === "type" ? search.ajout : null} error={search.e} attempted={search.nom} />
          : section === "droits" ? <RolesSection role={search.role === "technician" ? "technician" : "manager"} />
          : section === "ia" ? null
          : <CompanyForm section={section} />}
      </div>
    </div>
  );
}

async function CompanyForm({ section }: { section: "entreprise" | "identite" | "documents" | "email" }) {
  const st = await getSettings();
  const F = ({ name, label, value, wide, hint, type = "text", placeholder }: { name: string; label: string; value: string | number; wide?: boolean; hint?: string; type?: string; placeholder?: string }) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label" htmlFor={`st-${name}`}>{label}</label>
      <input id={`st-${name}`} name={name} type={type} className="input" defaultValue={value} placeholder={placeholder} />
      {hint && <p className="mt-1 text-xs text-navy-600/65">{hint}</p>}
    </div>
  );
  return (
    <form action={save} className="card">
      <input type="hidden" name="section" value={section} />
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
        {section === "entreprise" && (
          <>
            <F name="companyName" label="Nom de la société" value={st.companyName} />
            <F name="registrationNumber" label="N° d'immatriculation / NIF" value={st.registrationNumber} />
            <F name="tagline" label="Activité (affichée sous le nom)" value={st.tagline} wide />
            <F name="address" label="Adresse" value={st.address} wide />
            <F name="phone" label="Téléphone" value={st.phone} />
            <F name="email" label="E-mail" value={st.email} type="email" />
            <F name="website" label="Site web" value={st.website} wide />
          </>
        )}
        {section === "identite" && (
          <>
            <ImageField
              id="logo" name="logo" removeName="removeLogo" label="Logo"
              help="Affiché en haut des devis, factures et reçus PDF. PNG ou JPEG, 2 Mo maximum."
              customSrc={st.logoPath} fallbackSrc="/logo.png" fallbackCaption="Logo par défaut de Pixel Nomade."
              customCaption="Logo personnalisé." removeLabel="Revenir au logo par défaut"
            />
            <div className="border-t border-navy-100 sm:col-span-2" />
            <ImageField
              id="signature" name="signature" removeName="removeSignature" label="Signature et cachet"
              help="Repris sur tous les devis et factures, dans le bloc du gérant. PNG ou JPEG, 2 Mo maximum."
              customSrc={st.signaturePath} fallbackSrc="/signature.png" fallbackCaption="Signature et cachet par défaut."
              customCaption="Image personnalisée." removeLabel="Revenir à la signature par défaut" tall
            />
          </>
        )}
        {section === "documents" && (
          <>
            <F name="signatoryName" label="Nom du gérant / signataire" value={st.signatoryName} />
            <F name="signatoryTitle" label="Qualité du signataire" value={st.signatoryTitle} />
            <F name="paymentMethods" label="Moyens de paiement acceptés" value={st.paymentMethods} wide />
            <F name="paymentTerms" label="Modalités de paiement (texte du devis)" value={st.paymentTerms} wide />
            <F name="footerNote" label="Mention de pied de page" value={st.footerNote} wide />
            <F name="quoteValidityDays" label="Validité des devis (jours)" value={st.quoteValidityDays} type="number" />
          </>
        )}
        {section === "email" && (
          <>
            <p className="rounded-lg bg-navy-50/70 px-4 py-3 text-sm text-navy-700 sm:col-span-2">
              Quand un client a un e-mail sur sa fiche, le lien de signature du devis part par e-mail. Sinon, il part par WhatsApp sur son numéro.
            </p>
            <F name="appUrl" label="Adresse publique du site" value={st.appUrl} wide placeholder="https://gestion.pixel-nomade.com" hint="Laissez vide pour utiliser l'adresse de cette page." />
            <F name="smtpHost" label="Serveur SMTP" value={st.smtpHost} placeholder="smtp.gmail.com" />
            <F name="smtpPort" label="Port" value={st.smtpPort} type="number" />
            <F name="smtpUser" label="Identifiant SMTP" value={st.smtpUser} />
            <div>
              <label className="label" htmlFor="smtpPassword">Mot de passe SMTP</label>
              <input id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" className="input" placeholder={st.smtpPassword ? "Enregistré — laisser vide pour le conserver" : ""} />
            </div>
            <F name="smtpFrom" label="E-mail expéditeur" value={st.smtpFrom} type="email" />
            <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold text-navy-700">
              <input type="checkbox" name="smtpSecure" value="1" defaultChecked={st.smtpSecure} className="h-4 w-4 accent-[#2C3E50]" />
              Connexion SSL (en général le port 465)
            </label>
          </>
        )}
      </div>
      <div className="flex justify-end border-t border-navy-100 bg-navy-50/40 px-5 py-4 sm:px-6">
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

const LISTS = {
  categorie: { title: "Catégories de projets internes", singular: "une catégorie de projet", placeholder: "ex. Communication interne", hint: "Sert à classer les projets internes (sans client)." },
  type: { title: "Types de tâches", singular: "un type de tâche", placeholder: "ex. Montage", hint: "Proposé dans le formulaire de chaque tâche." },
} as const;

async function ListsSection({ adding, error, attempted }: { adding: "categorie" | "type" | null; error?: string; attempted?: string }) {
  const cats = await db.select().from(schema.projectCategories).orderBy(asc(schema.projectCategories.position), asc(schema.projectCategories.name));
  const types = await db.select().from(schema.taskTypes).orderBy(asc(schema.taskTypes.position), asc(schema.taskTypes.name));
  const list = adding ? LISTS[adding] : null;
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <Listes kind="categorie" rows={cats.map((r) => ({ id: r.id, name: r.name }))} />
        <Listes kind="type" rows={types.map((r) => ({ id: r.id, name: r.name }))} />
      </div>
      {adding && list && (
        <Modal closeHref="/parametres?s=listes" labelledBy="list-add-title" width="max-w-md">
          <form action={adding === "categorie" ? saveCategory : saveTaskType}>
            <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-4">
              <h2 id="list-add-title" className="text-lg font-bold text-navy">Ajouter {list.singular}</h2>
              <Link href="/parametres?s=listes" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 transition hover:bg-navy-50 hover:text-navy" aria-label="Fermer" title="Fermer">
                <X size={18} />
              </Link>
            </div>
            <div className="space-y-2 p-5">
              <label htmlFor="list-add-name" className="label">Nom</label>
              <input
                id="list-add-name"
                name="name"
                className={`input ${error ? "!border-red-400 focus:!ring-red-100" : ""}`}
                placeholder={list.placeholder}
                defaultValue={attempted ?? ""}
                maxLength={60}
                autoFocus
                required
                aria-invalid={!!error}
                aria-describedby="list-add-help"
              />
              {error === "doublon"
                ? <p id="list-add-help" className="text-sm font-semibold text-red-700">« {attempted} » existe déjà dans cette liste.</p>
                : error === "vide"
                  ? <p id="list-add-help" className="text-sm font-semibold text-red-700">Le nom ne peut pas être vide.</p>
                  : <p id="list-add-help" className="text-sm text-navy-600/70">{list.hint}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-navy-100 bg-navy-50/40 px-5 py-4">
              <Link href="/parametres?s=listes" scroll={false} className="btn-ghost">Annuler</Link>
              <SubmitButton>Ajouter</SubmitButton>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function Listes({ kind, rows }: { kind: "categorie" | "type"; rows: { id: number; name: string }[] }) {
  const { title } = LISTS[kind];
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-3.5 sm:px-6">
        <h2 className="font-bold text-navy">{title} <span className="ml-1 text-sm font-normal text-navy-600/60">({rows.length})</span></h2>
        <Link href={`/parametres?s=listes&ajout=${kind}`} scroll={false} className="btn-ghost btn-sm"><Plus size={15} /> Ajouter</Link>
      </div>
      {rows.length === 0 ? <p className="px-5 py-6 text-sm text-navy-600/70 sm:px-6">Aucun élément pour l'instant.</p> : (
        <ul className="flex flex-wrap gap-2 px-5 py-4 sm:px-6">
          {rows.map((r) => <li key={r.id} className="rounded-lg border border-navy-100 bg-navy-50/50 px-3 py-1.5 text-sm font-semibold text-navy-700">{r.name}</li>)}
        </ul>
      )}
    </section>
  );
}

async function RolesSection({ role }: { role: "manager" | "technician" }) {
  const defaults = await roleDefaults();
  const users = await db.select({ id: schema.users.id, role: schema.users.role, active: schema.users.active }).from(schema.users);
  const overrides = await db.select({ userId: schema.permissions.userId, module: schema.permissions.module, level: schema.permissions.level }).from(schema.permissions);
  const stats = (r: "admin" | "manager" | "technician") => {
    const members = users.filter((u) => u.active && normalizeRole(u.role) === r);
    const custom = members.filter((u) => overrides.some((o) => o.userId === u.id && o.level !== defaults[r][o.module as keyof typeof defaults[typeof r]])).length;
    return { members: members.length, custom };
  };
  const tabs = ROLES.filter((r) => r.key !== "admin");
  const cur = stats(role);
  const admins = stats("admin").members;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => {
          const st = stats(r.key);
          const active = r.key === role;
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-sm font-bold text-navy">{r.key === "admin" && <Crown size={14} className="text-gold-600" />}{r.label}</span>
              <span className="mt-0.5 block text-xs text-navy-600/70">
                {st.members} compte{st.members > 1 ? "s" : ""} actif{st.members > 1 ? "s" : ""}
                {r.key === "admin" ? " · accès complet" : st.custom ? ` · ${st.custom} personnalisé${st.custom > 1 ? "s" : ""}` : ""}
              </span>
            </>
          );
          return r.key === "admin"
            ? <div key={r.key} className="rounded-xl border border-navy-100 bg-white p-3.5">{body}</div>
            : (
              <Link key={r.key} href={`/parametres?s=droits&role=${r.key}`} scroll={false} aria-current={active ? "page" : undefined}
                className={`rounded-xl border p-3.5 transition ${active ? "border-navy bg-navy-50/80 ring-1 ring-navy" : "border-navy-100 bg-white hover:bg-navy-50/50"}`}>
                {body}
              </Link>
            );
        })}
      </div>
      <p className="rounded-xl bg-navy-50/70 px-4 py-3 text-sm text-navy-700">
        Chaque nouveau compte reçoit les droits de son rôle. Les droits réglés pour une personne dans{" "}
        <Link href="/utilisateurs" className="font-bold underline">Utilisateurs</Link> passent par-dessus, module par module.
        {admins > 0 && " L'administrateur a toujours accès à tout."}
      </p>
      <div>
        <h2 className="mb-2 font-bold text-navy">Droits du rôle « {tabs.find((t) => t.key === role)?.label} »</h2>
        {cur.custom > 0 && (
          <p className="mb-3 text-sm text-navy-600/80">
            {cur.custom} {role === "manager" ? "manager" : "technicien"}{cur.custom > 1 ? "s ont" : " a"} des droits personnalisés : sur ces modules, leur réglage reste prioritaire.
          </p>
        )}
        <RoleDefaultsForm key={role} action={saveRoleDefaults.bind(null, role)} values={defaults[role]} factory={ROLE_DEFAULTS[role]} />
      </div>
    </div>
  );
}

async function NotificationsSection() {
  const me = await requireAdmin();
  const st = await getSettings();
  const [row] = await db.select({ prefs: schema.users.notifyPrefs }).from(schema.users).where(eq(schema.users.id, me.id));
  const prefs = (row?.prefs ?? {}) as Record<string, boolean>;
  return (
    <form action={saveNotifyPrefs} className="card">
      <input type="hidden" name="back" value="/parametres?s=notifications" />
      <div className="space-y-5 p-5 sm:p-6">
        {st.smtpHost ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            L'envoi par e-mail est actif (serveur <b>{st.smtpHost}</b>). Les alertes cochées vous seront aussi envoyées à <b>{me.email}</b>.
          </p>
        ) : (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Aucun serveur d'envoi n'est configuré : les alertes restent visibles dans la cloche, mais aucun e-mail ne part.{" "}
            <Link href="/parametres?s=email" className="font-bold underline">Configurer l'envoi par e-mail</Link>
          </p>
        )}
        <p className="text-sm text-navy-600/80">
          Toutes les alertes apparaissent toujours dans la cloche. Cochez celles que vous voulez <b>aussi</b> recevoir par e-mail.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {NOTIFY_GROUPS.map((g) => (
            <fieldset key={g.label} className="rounded-xl border border-navy-100 p-4">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-navy-600/70">{g.label}</legend>
              <div className="space-y-1">
                {g.items.map((i) => (
                  <label key={i.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-navy-50/70">
                    <input type="checkbox" name={`mail_${i.key}`} defaultChecked={!!prefs[i.key]} className="mt-0.5 h-4 w-4 shrink-0 accent-[#2C3E50]" />
                    <span className="text-navy-800">{i.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <p className="text-xs text-navy-600/65">Ces réglages sont personnels. Chaque membre de l'équipe règle les siens dans « Mon profil ».</p>
      </div>
      <div className="flex justify-end border-t border-navy-100 bg-navy-50/40 px-5 py-4 sm:px-6">
        <SubmitButton>Enregistrer</SubmitButton>
      </div>
    </form>
  );
}

async function AiModal({ ok, error, message }: { ok?: string; error?: string; message?: string }) {
  const st = await getSettings();
  const key = openSecret(st.aiApiKey);
  const known = AI_MODELS.some((m) => m.id === st.aiModel);
  const err = error === "cle" ? "Saisissez la clé OpenAI pour activer Aicha." : error === "test" ? `Test refusé : ${message ?? "clé ou modèle invalide."}` : "";
  return (
    <Modal closeHref="/parametres" labelledBy="ai-title" width="max-w-xl">
      <form key={`${ok ?? ""}${error ?? ""}${key.slice(-4)}`} action={saveAiSettings}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-gold to-amber-500 text-white"><Sparkles size={20} /></span>
            <div>
              <h2 id="ai-title" className="text-lg font-bold text-navy">Aicha, l'assistante IA</h2>
              <p className="text-sm text-navy-600/70">Connectée à OpenAI, elle répond et agit dans l'application.</p>
            </div>
          </div>
          <Link href="/parametres" scroll={false} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          {ok === "1" && (
            <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Réglages enregistrés{st.aiEnabled ? <> : Aicha est prête. <Link href="/aicha" className="font-bold underline">Ouvrir Aicha</Link></> : "."}
            </p>
          )}
          {ok === "retiree" && <p className="rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">Clé retirée : Aicha est désactivée.</p>}
          {err && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{err}</p>}

          <label className="block">
            <span className="label">Clé API OpenAI</span>
            <input name="apiKey" type="password" autoComplete="off" spellCheck={false} className="input font-mono" placeholder={key ? `Enregistrée (${maskKey(key)}) — laisser vide pour la conserver` : "sk-…"} />
            <span className="mt-1 block text-xs text-navy-600/65">
              À créer sur platform.openai.com → API keys. Elle est chiffrée sur le serveur et n'est jamais affichée en clair.
            </span>
          </label>

          <fieldset>
            <legend className="label">Modèle</legend>
            <div className="space-y-2">
              {AI_MODELS.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 px-3 py-2.5 transition has-[:checked]:border-navy has-[:checked]:bg-navy-50/70">
                  <input type="radio" name="model" value={m.id} defaultChecked={st.aiModel === m.id} className="h-4 w-4 accent-[#2C3E50]" />
                  <span className="min-w-0"><span className="block text-sm font-bold text-navy">{m.label}</span><span className="block text-xs text-navy-600/70">{m.hint}</span></span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-navy-100 px-3 py-2.5 has-[:checked]:border-navy has-[:checked]:bg-navy-50/70">
                <input type="radio" name="model" value="autre" defaultChecked={!known} className="h-4 w-4 accent-[#2C3E50]" />
                <span className="text-sm font-bold text-navy">Autre</span>
                <input name="customModel" className="input h-9 flex-1 font-mono text-sm" placeholder="identifiant du modèle" defaultValue={known ? "" : st.aiModel} />
              </label>
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3">
            <span><span className="block text-sm font-bold text-navy">Activer Aicha</span><span className="block text-xs text-navy-600/70">Visible par toute l'équipe ; chacun n'accède qu'aux données autorisées par ses droits.</span></span>
            <input type="checkbox" name="enabled" defaultChecked={st.aiEnabled || !key} className="peer sr-only" />
            <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-navy-200 transition peer-checked:bg-emerald-500 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
          </label>

          <p className="rounded-lg bg-navy-50/70 px-4 py-3 text-xs leading-relaxed text-navy-600">
            Les questions posées et les données nécessaires pour y répondre (noms, montants, dates…) sont envoyées à OpenAI. La consommation est facturée sur votre compte OpenAI.
          </p>
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
          {key ? <button name="removeKey" value="1" className="btn-ghost text-red-700">Retirer la clé</button> : <span />}
          <span className="flex gap-2">
            <Link href="/parametres" scroll={false} className="btn-ghost">Annuler</Link>
            <SubmitButton>Tester et enregistrer</SubmitButton>
          </span>
        </div>
      </form>
    </Modal>
  );
}
