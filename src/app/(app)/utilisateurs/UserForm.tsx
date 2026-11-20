"use client";
import { useState } from "react";
import { Fragment } from "react";
import { MODULES, MODULE_GROUPS, LEVEL_LABELS, ROLE_DEFAULTS, ROLES, TASK_LEVELS, type AppRole } from "@/lib/modules";
import { SubmitButton } from "@/components/ConfirmButton";

const COLORS = ["#2C3E50", "#F5A623", "#1F6F5B", "#8E3B46", "#3D5A80", "#6C4AB6", "#C46B2C", "#2E86AB"];

type Props = {
  action: (fd: FormData) => void;
  initial?: {
    name: string; email: string; role: string; active: boolean;
    jobTitle?: string | null; phone?: string | null; color?: string | null; avatarPath?: string | null;
    perms: Record<string, string>;
  };
  isSelf?: boolean;
  isNew?: boolean;
};

export function UserForm({ action, initial, isSelf, isNew }: Props) {
  const [role, setRole] = useState<AppRole>((initial?.role === "admin" || initial?.role === "manager" ? initial.role : "technician"));
  const [perms, setPerms] = useState<Record<string, string>>(
    initial?.perms ?? ROLE_DEFAULTS.technician
  );
  const [color, setColor] = useState(initial?.color || "#2C3E50");

  function applyRole(next: AppRole) {
    setRole(next);
    if (!isSelf) setPerms({ ...ROLE_DEFAULTS[next] });
  }

  return (
    <form action={action} className="grid lg:grid-cols-[1fr_1.4fr] gap-6 items-start">
      <div className="card card-pad space-y-4">
        <p className="h-section">Compte</p>
        <div>
          <label className="label">Nom complet</label>
          <input name="name" className="input" required defaultValue={initial?.name} />
        </div>
        <div>
          <label className="label">Email (identifiant)</label>
          <input name="email" type="email" className="input" required defaultValue={initial?.email} />
        </div>
        <div>
          <label className="label">{isNew ? "Mot de passe" : "Nouveau mot de passe (laisser vide pour ne pas changer)"}</label>
          <input name="password" type="password" className="input" minLength={8} required={isNew} autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Poste / spécialité</label>
          <input name="jobTitle" className="input" defaultValue={initial?.jobTitle ?? ""} placeholder="cadreur, monteur, photographe…" />
        </div>
        <div>
          <label className="label">Téléphone</label>
          <input name="phone" className="input" defaultValue={initial?.phone ?? ""} />
        </div>
        <div>
          <label className="label">Couleur planning</label>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} className="h-8 w-8 rounded-full border-2" style={{ background: c, borderColor: color === c ? "#F5A623" : "transparent" }} aria-label={c} />
            ))}
          </div>
        </div>
        <div>
          <label className="label">Photo (facultatif, PNG ou JPEG, 2 Mo)</label>
          {initial?.avatarPath && <img src={initial.avatarPath} alt="" className="mb-2 h-12 w-12 rounded-full object-cover" />}
          <input name="avatar" type="file" accept="image/png,image/jpeg" className="input" />
        </div>
        <div>
          <label className="label">Rôle</label>
          <select name="role" className="input" value={role} onChange={(e) => applyRole(e.target.value as AppRole)} disabled={isSelf}>
            {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label} — {r.hint}</option>)}
          </select>
          {isSelf && <input type="hidden" name="role" value="admin" />}
        </div>
        {!isNew && (
          <label className="flex items-center gap-2 font-bold text-navy-700">
            <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} disabled={isSelf} className="w-4 h-4 accent-[#2C3E50]" />
            Compte actif
          </label>
        )}
        <SubmitButton>{isNew ? "Créer l'utilisateur" : "Enregistrer"}</SubmitButton>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-3">
          <p className="h-section">Droits par module</p>
          {role !== "admin" && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPerms({ ...ROLE_DEFAULTS[role] })}>Réinitialiser aux droits du rôle</button>
          )}
        </div>
        {role === "admin" ? (
          <p className="px-5 pb-5 text-navy-600/80">L'administrateur a accès à tous les modules, y compris la gestion des utilisateurs et les paramètres.</p>
        ) : (
          <p className="px-5 pb-3 text-sm text-navy-600/70">Le rôle préremplit la matrice. Vous pouvez ajuster chaque case pour cette personne. Utilisateurs et Paramètres restent réservés à l'administrateur.</p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Module</th>
              {TASK_LEVELS.map((l) => <th key={l} className="text-center">{l === "own" ? "Ses éléments" : LEVEL_LABELS[l]}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULE_GROUPS.map((g) => (
              <Fragment key={g.label}>
                <tr><td colSpan={5} className="bg-navy-50 text-xs font-bold uppercase tracking-wide">{g.label}</td></tr>
                {MODULES.filter((m) => (g.keys as readonly string[]).includes(m.key)).map((m) => (
                  <tr key={m.key} className={role === "admin" ? "opacity-40" : ""}>
                    <td className="font-bold">{m.label}</td>
                    {TASK_LEVELS.map((l) => (
                      <td key={l} className="text-center">
                        {l === "own" && m.key !== "taches" && m.key !== "presences" ? "—" : (
                          <input
                            type="radio"
                            name={`perm_${m.key}`}
                            value={l}
                            checked={(perms[m.key] ?? "none") === l}
                            onChange={() => setPerms({ ...perms, [m.key]: l })}
                            disabled={role === "admin"}
                            className="w-4 h-4 accent-[#F5A623]"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {role === "admin" && MODULES.map((m) => <input key={m.key} type="hidden" name={`perm_${m.key}`} value="write" />)}
      </div>
    </form>
  );
}
