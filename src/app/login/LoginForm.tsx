"use client";
import { loginAction } from "./actions";
import { Flash } from "@/components/Flash";

const DEVICE_KEY = "pf_device";

function deviceToken() {
  try {
    let token = localStorage.getItem(DEVICE_KEY);
    if (!token || token.length < 16) {
      token = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, token);
    }
    return token;
  } catch {
    return "";
  }
}

export function LoginForm({ error, next }: { error?: string; next: string }) {
  return (
    <form
      action={loginAction}
      className="card card-pad w-full max-w-md"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("deviceToken");
        if (input instanceof HTMLInputElement) input.value = deviceToken();
      }}
    >
      <img src="/logo.png" alt="Pixel Nomade" className="mb-6 h-16 w-auto max-w-full sm:mb-8 sm:h-20" />
      <h2 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">Connexion</h2>
      <p className="mb-6 mt-1 text-navy-600/75">Accès réservé à l'équipe.</p>
      <Flash
        clear={["e"]}
        tone={error === "1" ? "error" : "warning"}
        message={
          error === "1" ? "Email ou mot de passe incorrect."
          : error === "session" ? "Session expirée. Merci de te reconnecter."
          : error === "module" ? "Cette page redemande le mot de passe après 30 minutes. Pointer et Ma journée restent ouverts sur le téléphone enregistré."
          : ""
        }
      />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="deviceToken" defaultValue="" />
      <label className="label" htmlFor="email">Email</label>
      <input className="input mb-4" id="email" name="email" type="email" required autoComplete="username" />
      <label className="label" htmlFor="password">Mot de passe</label>
      <input className="input mb-4" id="password" name="password" type="password" required autoComplete="current-password" />
      <label className="mb-5 flex items-start gap-2 text-sm font-bold text-navy-700">
        <input type="checkbox" name="remember" value="on" className="mt-1 h-4 w-4 accent-[#2C3E50]" />
        <span>Rester connecté 30 jours sur ce téléphone, pour Pointer et Ma journée seulement. Les autres pages redemandent le mot de passe après 30 minutes sans activité.</span>
      </label>
      <button className="btn-primary h-11 w-full">Se connecter</button>
    </form>
  );
}
