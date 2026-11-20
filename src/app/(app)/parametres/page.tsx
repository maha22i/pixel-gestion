import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { saveCategory, saveTaskType } from "../taches/actions";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { deleteStoredLogo, imageExt, logoTooBig, writeImage, type ImageKind } from "@/lib/logo";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { SubmitButton } from "@/components/ConfirmButton";
import { ImageField } from "./LogoField";
import { PresenceSettings } from "./PresenceSettings";

const IMG_ERR: Record<string, string> = {
  "logo-format": "Le logo doit être une image PNG ou JPEG.",
  "logo-taille": "Le logo ne doit pas dépasser 2 Mo.",
  "signature-format": "La signature doit être une image PNG ou JPEG.",
  "signature-taille": "La signature ne doit pas dépasser 2 Mo.",
};

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

async function save(fd: FormData) {
  "use server";
  await requireAdmin();
  const current = await getSettings();
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const logo = await applyImage(fd, "logo", current.logoPath);
  const signature = await applyImage(fd, "signature", current.signaturePath);
  const errors = [logo.error, signature.error].filter(Boolean) as string[];

  await db.update(schema.settings).set({
    companyName: s("companyName"),
    tagline: s("tagline"),
    address: s("address"),
    phone: s("phone"),
    email: s("email"),
    website: s("website"),
    paymentMethods: s("paymentMethods"),
    paymentTerms: s("paymentTerms"),
    footerNote: s("footerNote"),
    signatoryName: s("signatoryName"),
    signatoryTitle: s("signatoryTitle"),
    registrationNumber: s("registrationNumber"),
    quoteValidityDays: Math.max(1, Number(s("quoteValidityDays")) || 30),
    logoPath: logo.path,
    signaturePath: signature.path,
    smtpHost: s("smtpHost"),
    smtpPort: Math.min(65535, Math.max(1, Number(s("smtpPort")) || 587)),
    smtpUser: s("smtpUser"),
    smtpPassword: s("smtpPassword") || current.smtpPassword,
    smtpFrom: s("smtpFrom"),
    smtpSecure: fd.get("smtpSecure") === "1",
    appUrl: s("appUrl").replace(/\/$/, ""),
  }).where(eq(schema.settings.id, 1));
  revalidatePath("/", "layout");
  redirect(errors.length ? `/parametres?e=${errors.join(",")}` : "/parametres?ok=1");
}

export default async function SettingsPage({ searchParams }: { searchParams: { ok?: string; e?: string; presence?: string } }) {
  await requireAdmin();
  const st = await getSettings();
  const F = ({ name, label, value, wide }: { name: string; label: string; value: string | number; wide?: boolean }) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className="label">{label}</label>
      <input name={name} className="input" defaultValue={value} />
    </div>
  );
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Informations reprises sur tous les devis, factures et reçus PDF." />
      <Flash message={searchParams.ok ? "Paramètres enregistrés." : ""} clear={["ok"]} />
      <Flash
        tone="error"
        clear={["e"]}
        message={searchParams.e?.split(",").map((code) => IMG_ERR[code]).filter(Boolean).join(" ") ?? ""}
      />
      <form action={save} className="card card-pad grid sm:grid-cols-2 gap-4 max-w-4xl">
        <ImageField
          id="logo"
          name="logo"
          removeName="removeLogo"
          label="Logo"
          help="Affiché en haut des devis, factures et reçus PDF. PNG ou JPEG, 2 Mo maximum."
          customSrc={st.logoPath}
          fallbackSrc="/logo.png"
          fallbackCaption="Logo par défaut de Pixel Nomade."
          customCaption="Logo personnalisé."
          removeLabel="Revenir au logo par défaut"
        />
        <ImageField
          id="signature"
          name="signature"
          removeName="removeSignature"
          label="Signature et cachet"
          help="Repris sur tous les devis et factures, dans le bloc du gérant. PNG ou JPEG, 2 Mo maximum."
          customSrc={st.signaturePath}
          fallbackSrc="/signature.png"
          fallbackCaption="Signature et cachet par défaut."
          customCaption="Image personnalisée."
          removeLabel="Revenir à la signature par défaut"
          tall
        />
        <F name="companyName" label="Nom de la société" value={st.companyName} />
        <F name="signatoryName" label="Nom du gérant / signataire" value={st.signatoryName} />
        <F name="signatoryTitle" label="Qualité du signataire" value={st.signatoryTitle} />
        <F name="registrationNumber" label="N° d'immatriculation / NIF" value={st.registrationNumber} />
        <F name="tagline" label="Activité (sous le nom)" value={st.tagline} />
        <F name="address" label="Adresse" value={st.address} />
        <F name="phone" label="Téléphone" value={st.phone} />
        <F name="email" label="Email" value={st.email} />
        <F name="website" label="Site web" value={st.website} />
        <F name="paymentMethods" label="Moyens de paiement acceptés" value={st.paymentMethods} wide />
        <F name="paymentTerms" label="Modalités de paiement (texte du devis)" value={st.paymentTerms} wide />
        <F name="footerNote" label="Mention de pied de page" value={st.footerNote} wide />
        <F name="quoteValidityDays" label="Validité des devis (jours)" value={st.quoteValidityDays} />
        <div className="sm:col-span-2 pt-2 border-t border-navy-100">
          <p className="font-bold text-navy">Envoi du devis au client</p>
          <p className="text-sm text-navy-600/80 mt-1">S'il a un e-mail sur sa fiche, le lien de signature part par e-mail. Sinon, il part par WhatsApp sur son numéro. Laissez l'adresse publique vide pour utiliser celle de cette page.</p>
        </div>
        <F name="appUrl" label="Adresse publique du site" value={st.appUrl} wide />
        <F name="smtpHost" label="Serveur SMTP" value={st.smtpHost} />
        <F name="smtpPort" label="Port" value={st.smtpPort} />
        <F name="smtpUser" label="Identifiant SMTP" value={st.smtpUser} />
        <div>
          <label className="label" htmlFor="smtpPassword">Mot de passe SMTP</label>
          <input id="smtpPassword" name="smtpPassword" type="password" autoComplete="new-password" className="input" placeholder={st.smtpPassword ? "Enregistré — laisser vide pour le conserver" : ""} />
        </div>
        <F name="smtpFrom" label="E-mail expéditeur" value={st.smtpFrom} />
        <label className="sm:col-span-2 flex items-center gap-2 text-sm font-bold text-navy-700">
          <input type="checkbox" name="smtpSecure" value="1" defaultChecked={st.smtpSecure} />
          Connexion SSL (en général le port 465)
        </label>
        <div className="sm:col-span-2"><SubmitButton>Enregistrer</SubmitButton></div>
      </form>
      <PresenceSettings notice={searchParams.presence} />
      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <Listes title="Catégories de projets internes" rows={(await db.select().from(schema.projectCategories).orderBy(asc(schema.projectCategories.position))).map((r) => r.name)} action={saveCategory} />
        <Listes title="Types de tâches" rows={(await db.select().from(schema.taskTypes).orderBy(asc(schema.taskTypes.position))).map((r) => r.name)} action={saveTaskType} />
      </div>
    </>
  );
}

function Listes({ title, rows, action }: { title: string; rows: string[]; action: (fd: FormData) => void }) {
  return (
    <form action={action} className="card card-pad space-y-2">
      <p className="h-section">{title}</p>
      <ul className="text-sm">{rows.map((r) => <li key={r}>{r}</li>)}</ul>
      <input name="name" className="input" placeholder="Ajouter" />
      <SubmitButton>Ajouter</SubmitButton>
    </form>
  );
}
