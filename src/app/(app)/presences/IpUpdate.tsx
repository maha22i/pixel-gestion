"use client";
import { useState } from "react";
import { adoptOfficeIp, validateIpBatch } from "./actions";
import { Flash } from "@/components/Flash";

export function IpUpdate({ known, ip }: { known: boolean; ip: string }) {
  const [message, setMessage] = useState<{ text: string; at: number; ok: boolean } | null>(null);
  const [batch, setBatch] = useState<{ count: number; siteId: number; ip: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (known) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="min-w-0 text-sm">
        <p className="font-bold text-amber-950">Réseau actuel non reconnu ({ip || "adresse introuvable"})</p>
        <p className="text-amber-900/90">Au bureau sur le Wi-Fi (pas en 4G) ? Enregistre-le : ta position confirme que tu es dans la zone.</p>
      </div>
      <button
        className="btn-primary btn-sm"
        disabled={busy}
        onClick={() => {
          if (!navigator.geolocation) { setMessage({ text: "Active la localisation.", at: Date.now(), ok: false }); return; }
          setBusy(true);
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const fd = new FormData();
            fd.set("lat", String(pos.coords.latitude));
            fd.set("lng", String(pos.coords.longitude));
            const res = await adoptOfficeIp(fd);
            setMessage({ text: res.message, at: Date.now(), ok: res.ok });
            setBatch(res.ok && res.count > 0 ? { count: res.count, siteId: res.siteId, ip: res.ip } : null);
            setBusy(false);
          }, () => { setMessage({ text: "Localisation refusée.", at: Date.now(), ok: false }); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000 });
        }}
      >
        Je suis au bureau : enregistrer ce réseau
      </button>
      {message && <Flash key={message.at} className="mb-0 w-full" tone={message.ok ? "success" : "error"} message={message.text} />}
      {batch && (
        <form action={validateIpBatch} className="w-full">
          <input type="hidden" name="siteId" value={batch.siteId} />
          <input type="hidden" name="ip" value={batch.ip} />
          <button className="btn-gold">Valider les {batch.count} pointages « À vérifier » de la journée pour cette adresse</button>
        </form>
      )}
    </div>
  );
}
