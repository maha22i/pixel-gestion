"use client";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Briefcase, Check, Crown, ExternalLink, LoaderCircle, RotateCcw, ShieldCheck, UserRound, X } from "lucide-react";
import { MODULES, ROLES, type AppRole } from "@/lib/modules";
import { PermMatrix } from "@/components/PermMatrix";
import { Avatar } from "@/components/ui";

const CONTRACT_TYPES = [
  { key: "cdi", label: "CDI", hint: "Sans date de fin" },
  { key: "cdd", label: "CDD", hint: "Date de fin obligatoire" },
  { key: "stage", label: "Stage", hint: "Date de fin obligatoire" },
  { key: "prestataire", label: "Prestataire", hint: "Fin facultative" },
  { key: "aucun", label: "Sans contrat", hint: "Associé, compte externe…" },
] as const;
type ContractKind = (typeof CONTRACT_TYPES)[number]["key"];

const frDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Contrat de travail saisi à la création du compte (enregistré dans RH). */
function ContractFields({ today }: { today: string }) {
  const [kind, setKind] = useState<ContractKind>("cdi");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const hasEnd = kind === "cdd" || kind === "stage" || kind === "prestataire";
  const months = start && end && end >= start
    ? Math.round(((Date.parse(end) - Date.parse(start)) / 86400000 + 1) / 30.44)
    : 0;
  return (
    <fieldset className="rounded-xl border border-navy-100 p-4 sm:col-span-2">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-bold text-navy"><Briefcase size={15} className="text-gold-600" /> Contrat de travail</legend>
      <input type="hidden" name="contractType" value={kind} />
      <div className="flex flex-wrap gap-1 rounded-lg bg-navy-50 p-1" role="radiogroup" aria-label="Type de contrat">
        {CONTRACT_TYPES.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={kind === t.key} onClick={() => setKind(t.key)}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition ${kind === t.key ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/70 hover:text-navy"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-navy-600/65">{CONTRACT_TYPES.find((t) => t.key === kind)?.hint}</p>
      {kind !== "aucun" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Début du contrat</span>
            <input name="contractStart" type="date" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="block"><span className="label">Fin du contrat {kind === "prestataire" && <span className="font-normal text-navy-600/60">(facultatif)</span>}</span>
            {hasEnd
              ? <input name="contractEnd" type="date" className="input" required={kind !== "prestataire"} min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
              : <span className="input flex items-center bg-navy-50/60 text-navy-600/60">Indéterminée (CDI)</span>}
          </label>
          {hasEnd && months > 0 && <p className="text-xs text-navy-600/70 sm:col-span-2">Durée : environ {months} mois · du {frDate(start)} au {frDate(end)}</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-navy-600/65">Le contrat est créé dans RH : salaire, horaires et document signé s'y complètent.</p>
    </fieldset>
  );
}

const COLORS = ["#2C3E50", "#F5A623", "#1F6F5B", "#8E3B46", "#3D5A80", "#6C4AB6", "#C46B2C", "#2E86AB", "#10B981", "#EF4444"];

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} {label}</button>;
}

function Header({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-navy-100 bg-white px-5 py-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <h2 id="user-modal-title" className="truncate text-lg font-bold text-navy">{title}</h2>
          <p className="truncate text-sm text-navy-600/70">{subtitle}</p>
        </div>
      </div>
      <Link href="/utilisateurs" scroll={false} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Fermer"><X size={18} /></Link>
    </div>
  );
}

/** Fenêtre « Droits » : rôle + niveau d'accès par module (hérité du rôle, sauf personnalisation). */
export function PermissionsForm({
  action, user, perms, defaults, isSelf,
}: {
  action: (fd: FormData) => void;
  user: { name: string; email: string; role: string; color: string | null };
  /** Droits effectifs actuels. */
  perms: Record<string, string>;
  /** Droits par défaut de chaque rôle (Paramètres). */
  defaults: Record<AppRole, Record<string, string>>;
  isSelf: boolean;
}) {
  const [role, setRole] = useState<AppRole>(user.role === "admin" || user.role === "manager" ? user.role : "technician");
  const [values, setValues] = useState<Record<string, string>>(perms);
  const pickRole = (r: AppRole) => { setRole(r); setValues({ ...defaults[r] }); };
  const baseline = defaults[role];
  const count = MODULES.filter((m) => (values[m.key] ?? "none") !== "none").length;
  const custom = MODULES.filter((m) => (values[m.key] ?? "none") !== (baseline[m.key] ?? "none")).length;

  return (
    <form action={action}>
      <Header
        icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy"><ShieldCheck size={20} /></span>}
        title={`Droits de ${user.name}`}
        subtitle={role === "admin" ? "Accès complet" : `${count} module${count > 1 ? "s" : ""} accessible${count > 1 ? "s" : ""}${custom ? ` · ${custom} personnalisé${custom > 1 ? "s" : ""}` : " · droits du rôle"}`}
      />
      <div className="space-y-5 p-5 sm:p-6">
        <fieldset>
          <legend className="label">Rôle</legend>
          <input type="hidden" name="role" value={role} />
          <div className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                disabled={isSelf}
                onClick={() => pickRole(r.key)}
                aria-pressed={role === r.key}
                className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${role === r.key ? "border-navy bg-navy-50/80 ring-1 ring-navy" : "border-navy-100 hover:bg-navy-50/50"} ${isSelf && role !== r.key ? "opacity-40" : ""}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-navy">{r.key === "admin" && <Crown size={14} className="text-gold-600" />}{r.label}</span>
                <span className="mt-0.5 block text-xs text-navy-600/70">{r.hint}</span>
              </button>
            ))}
          </div>
          {isSelf && <p className="mt-2 text-xs text-navy-600/65">Vous ne pouvez pas modifier votre propre rôle.</p>}
        </fieldset>

        {role === "admin" ? (
          <p className="rounded-xl bg-navy-50/70 px-4 py-3 text-sm text-navy-700">L'administrateur a accès à tous les modules, y compris les utilisateurs, les paramètres et les salaires.</p>
        ) : (
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="label mb-0">Accès par module</p>
              {custom > 0 && <button type="button" onClick={() => setValues({ ...baseline })} className="btn-ghost btn-sm"><RotateCcw size={13} /> Tout remettre aux droits du rôle</button>}
            </div>
            <PermMatrix values={values} onChange={setValues} baseline={baseline} />
            <p className="mt-2 text-xs text-navy-600/65">
              Sans personnalisation, la personne suit les droits par défaut de son rôle (Paramètres → Droits par défaut). Ce que vous changez ici passe par-dessus.
            </p>
          </section>
        )}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        <Link href="/utilisateurs" scroll={false} className="btn-ghost">Annuler</Link>
        <Save label="Enregistrer les droits" />
      </div>
    </form>
  );
}

/** Fenêtre « Modifier » (compte) ou « Nouvel utilisateur ». */
export function AccountForm({
  action, user, isSelf, isNew, error, deleteAction, today, contract, userId,
}: {
  action: (fd: FormData) => void;
  user?: { name: string; email: string; jobTitle: string | null; phone: string | null; color: string | null; avatarPath: string | null; active: boolean };
  isSelf?: boolean;
  isNew?: boolean;
  error?: string;
  /** Suppression du compte (absente pour un nouvel utilisateur et pour soi-même). */
  deleteAction?: (fd: FormData) => void;
  /** Date du jour (AAAA-MM-JJ), début de contrat proposé à la création. */
  today?: string;
  /** Contrat en cours (modification). */
  contract?: { type: string; start: string; end: string | null } | null;
  userId?: number;
}) {
  const [color, setColor] = useState(user?.color || "#2C3E50");
  const [name, setName] = useState(user?.name ?? "");
  const [role, setRole] = useState<AppRole>("technician");
  return (
    <form action={action}>
      <Header
        icon={isNew ? <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy"><UserRound size={20} /></span> : <Avatar name={name || "?"} color={color} size={40} />}
        title={isNew ? "Nouvel utilisateur" : `Modifier ${user?.name}`}
        subtitle={isNew ? "Le compte reçoit les droits par défaut du rôle choisi." : user?.email ?? ""}
      />
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <label className="block"><span className="label">Nom complet</span><input name="name" className="input" required value={name} onChange={(e) => setName(e.target.value)} autoFocus={isNew} /></label>
        <label className="block"><span className="label">E-mail (identifiant)</span><input name="email" type="email" className="input" required defaultValue={user?.email} /></label>
        <label className="block"><span className="label">{isNew ? "Mot de passe" : "Nouveau mot de passe"}</span>
          <input name="password" type="password" className="input" minLength={8} required={isNew} autoComplete="new-password" placeholder={isNew ? "8 caractères minimum" : "Laisser vide pour ne pas changer"} />
        </label>
        <label className="block"><span className="label">Poste</span><input name="jobTitle" className="input" defaultValue={user?.jobTitle ?? ""} placeholder="Cadreur, monteuse, photographe…" /></label>
        <label className="block"><span className="label">Téléphone</span><input name="phone" className="input" defaultValue={user?.phone ?? ""} /></label>
        <label className="block"><span className="label">Photo <span className="font-normal text-navy-600/60">(PNG/JPEG, 2 Mo)</span></span>
          <span className="flex items-center gap-3">
            {user?.avatarPath && <img src={user.avatarPath} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
            <input name="avatar" type="file" accept="image/png,image/jpeg" className="block w-full pt-1.5 text-sm text-navy-700" />
          </span>
        </label>
        <div className="sm:col-span-2">
          <span className="label">Couleur (planning, avatar)</span>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} aria-pressed={color === c}
                className={`grid h-8 w-8 place-items-center rounded-full ring-offset-2 transition ${color === c ? "ring-2 ring-gold" : ""}`} style={{ background: c }}>
                {color === c && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        {isNew && (
          <fieldset className="sm:col-span-2">
            <legend className="label">Rôle</legend>
            <input type="hidden" name="role" value={role} />
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLES.map((r) => (
                <button key={r.key} type="button" onClick={() => setRole(r.key)} aria-pressed={role === r.key}
                  className={`rounded-xl border p-3 text-left transition ${role === r.key ? "border-navy bg-navy-50/80 ring-1 ring-navy" : "border-navy-100 hover:bg-navy-50/50"}`}>
                  <span className="block text-sm font-bold text-navy">{r.label}</span>
                  <span className="mt-0.5 block text-xs text-navy-600/70">{r.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {isNew && <ContractFields today={today ?? new Date().toISOString().slice(0, 10)} />}
        {!isNew && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3 sm:col-span-2">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gold-50 text-amber-800"><Briefcase size={17} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-navy">
                  {contract ? `${CONTRACT_TYPES.find((t) => t.key === contract.type)?.label ?? contract.type} ${today && contract.start > today ? "à venir" : "en cours"}` : "Aucun contrat en cours"}
                </span>
                <span className="block text-xs text-navy-600/70">
                  {contract ? `Du ${frDate(contract.start)} ${contract.end ? `au ${frDate(contract.end)}` : "· durée indéterminée"}` : "Enregistrez son contrat pour suivre les dates, le salaire et les congés."}
                </span>
              </span>
            </span>
            {userId && (
              <Link href={`/rh?vue=equipe&employe=${userId}${contract ? "" : "&contrat=nouveau"}`} className="btn-ghost btn-sm">
                {contract ? "Gérer dans RH" : "Ajouter un contrat"} <ExternalLink size={13} />
              </Link>
            )}
          </div>
        )}
        {!isNew && (
          <label className={`flex items-center justify-between gap-3 rounded-xl border border-navy-100 px-4 py-3 sm:col-span-2 ${isSelf ? "opacity-60" : "cursor-pointer"}`}>
            <span><span className="block text-sm font-bold text-navy">Compte actif</span><span className="block text-xs text-navy-600/70">Un compte désactivé ne peut plus se connecter ni pointer.</span></span>
            <input type="checkbox" name="active" defaultChecked={user?.active ?? true} disabled={isSelf} className="peer sr-only" />
            <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-navy-200 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-emerald-500 peer-checked:after:translate-x-5" />
          </label>
        )}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 sm:col-span-2">{error}</p>}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 bg-[#f7f8fa] px-5 py-4 sm:px-6">
        {deleteAction ? (
          <button
            formAction={deleteAction}
            formNoValidate
            onClick={(e) => { if (!window.confirm(`Supprimer définitivement le compte de ${user?.name} ? Ses tâches et pointages perdront leur auteur.`)) e.preventDefault(); }}
            className="btn-ghost text-red-700 hover:bg-red-50"
          >
            Supprimer le compte
          </button>
        ) : <span />}
        <span className="flex gap-2">
          <Link href="/utilisateurs" scroll={false} className="btn-ghost">Annuler</Link>
          <Save label={isNew ? "Créer l'utilisateur" : "Enregistrer"} />
        </span>
      </div>
    </form>
  );
}
