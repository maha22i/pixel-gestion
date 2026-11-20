"use client";

import { useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { whatsappDigits, whatsappLink } from "@/lib/whatsapp";
import { Flash } from "@/components/Flash";

function SubmitLabel() {
  const { pending } = useFormStatus();
  return <>{pending ? "Envoi…" : "Envoyer"}</>;
}

function openWhatsapp(url: string) {
  const win = window.open(url, "_blank");
  if (win) win.opener = null;
  return Boolean(win);
}

export function SendQuoteButton({
  action, hasEmail, waUrl, invite,
}: {
  action: (fd: FormData) => Promise<void>;
  hasEmail: boolean;
  waUrl?: string;
  invite: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<{ text: string; at: number } | null>(null);
  const [fallback, setFallback] = useState("");
  const needsContact = !hasEmail && !waUrl;

  return (
    <>
      <form ref={formRef} action={needsContact ? undefined : action}>
        {needsContact ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setError(null);
              setFallback("");
              setOpen(true);
            }}
          >
            <Send size={16} /> Envoyer
          </button>
        ) : waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
            onClick={() => formRef.current?.requestSubmit()}
          >
            <Send size={16} /> Envoyer
          </a>
        ) : (
          <button className="btn-primary"><Send size={16} /> <SubmitLabel /></button>
        )}
      </form>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4" onClick={() => setOpen(false)}>
          <form
            action={action}
            className="card card-pad w-full max-w-md space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-navy text-lg">Envoyer le devis</p>
                <p className="text-sm text-navy-600 mt-1">Ce client n'a pas d'e-mail ni de téléphone. Saisissez-en un : il sera enregistré sur sa fiche, puis le devis part.</p>
              </div>
              <button type="button" className="text-navy-600 p-1" aria-label="Fermer" onClick={() => setOpen(false)}><X size={18} /></button>
            </div>
            <div>
              <label className="label" htmlFor="send-email">E-mail</label>
              <input id="send-email" name="email" type="text" inputMode="email" className="input" placeholder="client@email.com" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="send-phone">Téléphone WhatsApp</label>
              <input id="send-phone" name="phone" type="tel" className="input" placeholder="+253 77 00 00 00" autoComplete="off" />
            </div>
            <p className="text-sm text-navy-600">Avec un numéro, WhatsApp s'ouvre pour envoyer le lien. L'e-mail part en plus s'il est renseigné.</p>
            {error && <Flash key={error.at} className="mb-0" tone="error" message={error.text} />}
            {fallback && (
              <a href={fallback} target="_blank" rel="noopener noreferrer" className="btn-primary w-full">Ouvrir WhatsApp</a>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button
                className="btn-primary"
                onClick={(e) => {
                  const data = new FormData(e.currentTarget.form!);
                  const email = String(data.get("email") ?? "").trim();
                  const phone = String(data.get("phone") ?? "").trim();
                  const digits = whatsappDigits(phone);
                  if (!email.includes("@") && !digits) {
                    e.preventDefault();
                    setFallback("");
                    setError({ text: email ? "Cet e-mail n'est pas valide." : "Indiquez un e-mail ou un numéro WhatsApp.", at: Date.now() });
                    return;
                  }
                  if (!digits) return;
                  const url = whatsappLink(digits, invite);
                  if (!openWhatsapp(url)) {
                    e.preventDefault();
                    setFallback(url);
                    setError({ text: "Le navigateur a bloqué la fenêtre. Ouvrez WhatsApp avec le lien, puis cliquez à nouveau sur Envoyer.", at: Date.now() });
                  }
                }}
              >
                <SubmitLabel />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
