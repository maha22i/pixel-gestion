"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GPS_HELP, PRIVATE_HELP, STATUS_LABEL } from "@/lib/attendance/labels";
import { Flash } from "@/components/Flash";
import { acceptConsent, punchAction } from "./actions";

type Choice = { id: number; title: string };
type Row = { id: number; day: string; time: string; kind: string; status: string; place: string };

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

function secretFrom(text: string) {
  try {
    return new URL(text).searchParams.get("s")?.trim() || text.trim();
  } catch {
    return text.trim();
  }
}

export function PointerApp({
  consent: initialConsent, step: serverStep, todayLine, week, tasks, projects, slips,
}: {
  consent: boolean;
  step: "arrivee" | "depart" | "fini";
  todayLine: string;
  week: Row[];
  tasks: Choice[];
  projects: Choice[];
  slips: Choice[];
}) {
  const router = useRouter();
  const [consent, setConsent] = useState(initialConsent);
  const [priv, setPriv] = useState<boolean | null>(null);
  const [step, setStep] = useState(serverStep);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status?: string; message: string; at: number } | null>(null);
  const [install, setInstall] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const scanOnce = useRef(false);
  const [missionKind, setMissionKind] = useState<"task" | "project" | "slip">("task");
  const [missionId, setMissionId] = useState("");

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true);
    setDismissed(localStorage.getItem("pf_install_dismissed") === "1");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    let cancel = false;
    (async () => {
      try {
        localStorage.setItem("pf_probe", "1");
        localStorage.removeItem("pf_probe");
      } catch {
        if (!cancel) setPriv(true);
        return;
      }
      try {
        const { detectIncognito } = await import("detectincognitojs");
        const detected = await detectIncognito();
        if (!cancel) setPriv(detected.isPrivate);
      } catch {
        if (!cancel) setPriv(false);
      }
    })();
    return () => {
      cancel = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  useEffect(() => { setStep(serverStep); }, [serverStep]);

  async function locate() {
    if (!navigator.geolocation) return { denied: false, lat: "", lng: "", accuracy: "" };
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      return { denied: false, lat: String(pos.coords.latitude), lng: String(pos.coords.longitude), accuracy: String(Math.round(pos.coords.accuracy)) };
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 1) return { denied: true, lat: "", lng: "", accuracy: "" };
      return { denied: false, lat: "", lng: "", accuracy: "" };
    }
  }

  async function submit(mode: "bureau" | "mission", qr = "") {
    if (priv || step === "fini") return;
    if (mode === "bureau" && !qr) return;
    const token = deviceToken();
    if (!token) {
      setPriv(true);
      return;
    }
    setBusy(true);
    setResult(null);
    const place = await locate();
    if (place.denied) {
      setResult({ ok: false, message: GPS_HELP, at: Date.now() });
      setBusy(false);
      return;
    }
    const fd = new FormData();
    fd.set("mode", mode);
    fd.set("secret", qr);
    fd.set("lat", place.lat);
    fd.set("lng", place.lng);
    fd.set("accuracy", place.accuracy);
    fd.set("deviceToken", token);
    fd.set("persist", "1");
    if (mode === "mission") {
      if (missionKind === "task") fd.set("taskId", missionId);
      if (missionKind === "project") fd.set("projectId", missionId);
      if (missionKind === "slip") fd.set("slipId", missionId);
    }
    const res = await punchAction(fd);
    setResult({ ...res, at: Date.now() });
    if (res.ok && res.firstDevice) setDismissed(false);
    setBusy(false);
    if (res.ok && res.status !== "refuse") setStep((current) => current === "arrivee" ? "depart" : "fini");
    if (res.ok) router.refresh();
  }

  async function scan() {
    if (step === "fini" || busy) return;
    setScanning(true);
    setResult(null);
    scanOnce.current = false;
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (scanOnce.current) return;
          scanOnce.current = true;
          const found = secretFrom(text);
          scanner.stop().catch(() => {});
          setScanning(false);
          void submit("bureau", found);
        },
        () => {},
      );
    } catch {
      scannerRef.current?.stop().catch(() => {});
      setScanning(false);
      setResult({
        ok: false,
        at: Date.now(),
        message: "L'appareil photo n'est pas disponible. Autorise la caméra pour ce site, puis réessaie.",
      });
    }
  }

  const actionLabel = step === "depart" ? "Scanner ma sortie" : "Scanner mon arrivée";
  const choices = missionKind === "task" ? tasks : missionKind === "project" ? projects : slips;
  const showInstall = !standalone && !dismissed;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-gold">Pointage</p>
        <h1 className="text-3xl font-bold text-navy">Pointer</h1>
        <p className="mt-1 text-lg font-bold text-navy">{todayLine}</p>
      </div>

      {priv === null && <p className="card card-pad text-sm font-bold text-navy-600">Vérification du navigateur…</p>}
      {priv && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 font-bold text-red-800">{PRIVATE_HELP}</p>}

      {!consent && priv === false && (
        <form action={acceptConsent} className="card card-pad space-y-3" onSubmit={() => setConsent(true)}>
          <p className="font-bold text-navy">Avant le premier pointage</p>
          <p className="text-sm text-navy-700">La position et le réseau sont vérifiés uniquement au moment du pointage, pour confirmer la présence au bureau. Il n'y a pas de suivi en continu.</p>
          <button className="btn-primary h-12 w-full">J'ai compris</button>
        </form>
      )}

      {consent && priv === false && (
        <>
          {step === "fini" ? (
            <div className="card card-pad">
              <p className="text-lg font-bold text-navy">Journée enregistrée</p>
              <p className="mt-1 text-navy-700">Une arrivée et une sortie, c'est tout pour aujourd'hui.</p>
            </div>
          ) : (
            <>
              <button className="btn-gold h-24 w-full text-xl" disabled={busy || scanning} onClick={() => scan()}>
                {busy ? "Enregistrement…" : scanning ? "Scan en cours…" : actionLabel}
              </button>
              {scanning && (
                <div className="card overflow-hidden p-3">
                  <div id="qr-reader" className="overflow-hidden rounded-xl" />
                  <button className="btn-ghost mt-3 w-full" onClick={() => { scannerRef.current?.stop().catch(() => {}); setScanning(false); }}>Annuler</button>
                </div>
              )}
              <details className="card card-pad">
                <summary className="cursor-pointer font-bold text-navy">{step === "depart" ? "Sortie en mission" : "Arrivée en mission"}</summary>
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-navy-600">Hors bureau : la position est enregistrée, sans QR. Le manager valide ensuite.</p>
                  <select className="input" value={missionKind} onChange={(e) => { setMissionKind(e.target.value as "task" | "project" | "slip"); setMissionId(""); }}>
                    <option value="task">Une tâche</option>
                    <option value="project">Un projet</option>
                    <option value="slip">Un bon de sortie</option>
                  </select>
                  <select className="input" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
                    <option value="">Choisir</option>
                    {choices.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <button className="btn-primary h-12 w-full" disabled={busy || !missionId} onClick={() => submit("mission")}>
                    {step === "depart" ? "Enregistrer la sortie en mission" : "Enregistrer l'arrivée en mission"}
                  </button>
                </div>
              </details>
            </>
          )}
          {result && (
            <Flash
              key={result.at}
              className="mb-0"
              tone={result.ok && result.status !== "refuse" ? "success" : "error"}
              message={result.ok && result.status ? `${result.message} ${STATUS_LABEL[result.status] ?? result.status}.` : result.message}
            />
          )}
        </>
      )}

      {showInstall && (
        <section className="card card-pad space-y-3">
          <p className="font-bold text-navy">Ajoute l'application à l'écran d'accueil</p>
          <p className="text-sm text-navy-700">L'icône Pixel Nomade ouvre directement le pointage. Le téléphone reste reconnu, même si les données d'un autre navigateur sont effacées.</p>
          <p className="text-sm text-navy-700">Sur iPhone : bouton Partager, puis « Sur l'écran d'accueil ». Pointe ensuite depuis cette icône. L'appareil photo du téléphone ouvre Safari, qui compte comme un autre appareil.</p>
          {install && (
            <button className="btn-primary w-full" onClick={async () => {
              await promptRef.current?.prompt();
              setInstall(false);
            }}>Ajouter à l'écran d'accueil</button>
          )}
          <button className="btn-ghost w-full" onClick={() => { localStorage.setItem("pf_install_dismissed", "1"); setDismissed(true); }}>Plus tard</button>
        </section>
      )}

      <section className="card">
        <p className="h-section px-5 pt-5">Cette semaine</p>
        {week.length === 0 ? <p className="px-5 py-6 text-sm text-navy-600">Aucun pointage.</p> : (
          <ul className="divide-y divide-navy/5">
            {week.map((row) => (
              <li key={row.id} className="px-5 py-3">
                <p className="font-bold text-navy">{row.day} · {row.time} · {row.kind === "depart" ? "Départ" : "Arrivée"}</p>
                <p className="text-sm text-navy-600">{row.place} · {STATUS_LABEL[row.status] ?? row.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
