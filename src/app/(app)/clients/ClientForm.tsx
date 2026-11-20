import { CLIENT_TYPES } from "@/lib/format";
import { SubmitButton } from "@/components/ConfirmButton";

type C = {
  type: string; name: string; acronym?: string | null; nif?: string | null;
  repCivility?: string | null; repName?: string | null; repTitle?: string | null;
  contactName: string | null; contactRole?: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null;
};

export function ClientForm({ action, c, back, disabled }: { action: (fd: FormData) => void; c?: C; back?: string; disabled?: boolean }) {
  return (
    <form action={action} className="card card-pad">
      <fieldset disabled={disabled} className="grid sm:grid-cols-2 gap-4">
        {back && <input type="hidden" name="back" value={back} />}
        <div>
          <label className="label">Nature / forme</label>
          <select name="type" className="input" defaultValue={c?.type ?? "particulier"}>
            {Object.entries(CLIENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Nom / raison sociale *</label>
          <input name="name" className="input" required defaultValue={c?.name} />
        </div>
        <div>
          <label className="label">Sigle</label>
          <input name="acronym" className="input" defaultValue={c?.acronym ?? ""} />
        </div>
        <div>
          <label className="label">NIF / immatriculation</label>
          <input name="nif" className="input" defaultValue={c?.nif ?? ""} />
        </div>
        <div>
          <label className="label">Civilité du représentant</label>
          <input name="repCivility" className="input" defaultValue={c?.repCivility ?? ""} placeholder="M. / Mme" />
        </div>
        <div>
          <label className="label">Nom du représentant</label>
          <input name="repName" className="input" defaultValue={c?.repName ?? ""} />
        </div>
        <div>
          <label className="label">Qualité du représentant</label>
          <input name="repTitle" className="input" defaultValue={c?.repTitle ?? ""} placeholder="Directeur général, Gérant…" />
        </div>
        <div>
          <label className="label">Référent</label>
          <input name="contactName" className="input" defaultValue={c?.contactName ?? ""} />
        </div>
        <div>
          <label className="label">Fonction du référent</label>
          <input name="contactRole" className="input" defaultValue={c?.contactRole ?? ""} />
        </div>
        <div>
          <label className="label">Téléphone</label>
          <input name="phone" className="input" defaultValue={c?.phone ?? ""} placeholder="+253 77 …" />
        </div>
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" defaultValue={c?.email ?? ""} />
        </div>
        <div>
          <label className="label">Adresse</label>
          <input name="address" className="input" defaultValue={c?.address ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Notes</label>
          <textarea name="notes" className="input" defaultValue={c?.notes ?? ""} />
        </div>
        {!disabled && <div className="sm:col-span-2"><SubmitButton>{c ? "Enregistrer" : "Créer le client"}</SubmitButton></div>}
      </fieldset>
    </form>
  );
}
