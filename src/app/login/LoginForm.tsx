"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary group h-12 w-full text-[15px]" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Connexion…
        </>
      ) : (
        <>
          Se connecter
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}

export function LoginForm({ error, next }: { error?: string; next: string }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form
      action={loginAction}
      className="login-rise relative overflow-hidden rounded-3xl border border-white/80 bg-white p-7 shadow-[0_30px_70px_-35px_rgba(24,34,44,0.55)] ring-1 ring-navy-100/70 sm:p-9"
      onSubmit={(event) => {
        const input = event.currentTarget.elements.namedItem("deviceToken");
        if (input instanceof HTMLInputElement) input.value = deviceToken();
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gold via-amber-300 to-gold" />

      <img src="/logo-transparent.png" alt="Pixel Nomade" className="mx-auto mb-7 h-16 w-auto max-w-full sm:h-[72px]" />
      <div className="mb-6 text-center">
        <h2 className="text-[26px] font-bold tracking-tight text-navy">Connexion</h2>
        <p className="mt-1 text-[15px] text-navy-600/70">Accès réservé à l'équipe.</p>
      </div>

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
      <div className="relative mb-4">
        <Mail aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-600/45" />
        <input
          className="input h-12 pl-11"
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="prenom@pixel-nomade.com"
        />
      </div>

      <label className="label" htmlFor="password">Mot de passe</label>
      <div className="relative mb-5">
        <LockKeyhole aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-navy-600/45" />
        <input
          className="input h-12 pl-11 pr-12"
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-navy-600/55 transition hover:bg-navy-50 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>

      <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-navy-100 bg-navy-50/60 p-3.5 transition hover:border-gold/40 hover:bg-gold-50/60 has-[:checked]:border-gold/50 has-[:checked]:bg-gold-50">
        <input type="checkbox" name="remember" value="on" className="mt-0.5 h-4 w-4 shrink-0 accent-[#2C3E50]" />
        <span className="text-[13px] leading-snug">
          <span className="block font-bold text-navy-700">Rester connecté 30 jours sur ce téléphone</span>
          <span className="mt-0.5 block text-navy-600/70">
            Pour Pointer et Ma journée seulement. Les autres pages redemandent le mot de passe après 30 minutes sans activité.
          </span>
        </span>
      </label>

      <SubmitButton />
    </form>
  );
}
