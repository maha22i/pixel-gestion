"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase, CheckCircle2, ChevronDown, Clock, FolderKanban, LoaderCircle, LogIn, LogOut, MapPin, PackageOpen,
  QrCode, ShieldCheck, ShieldAlert, Smartphone, X,
} from "lucide-react";
import { GPS_HELP, PRIVATE_HELP, STATUS_LABEL } from "@/lib/attendance/labels";
import { Flash } from "@/components/Flash";
import { acceptConsent, punchAction } from "./actions";

type Choice = { id: number; title: string };
type Row = { id: number; iso: string; day: string; time: string; kind: string; status: string; place: string };
type Mark = { at: string; time: string; status: string; mission: boolean } | null;

const DEVICE_KEY = "pf_device";
const TZ = "Africa/Djibouti";

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

const clockNow = () => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const duration = (min: number) => {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
const STATUS_BADGE: Record<string, string> = { valide: "badge-green", a_verifier: "badge-gold", mission: "badge-blue", refuse: "badge-red" };

export function PointerApp({
  consent: initialConsent, step: serverStep, week, tasks, projects, slips,
  firstName, now: serverNow, todayIso, schedule, arrival, departure,
}: {
  consent: boolean;
  step: "arrivee" | "depart" | "fini";
  todayLine: string;
  week: Row[];
  tasks: Choice[];
  projects: Choice[];
  slips: Choice[];
  firstName: string;
  now: string;
  todayIso: string;
  schedule: { start: string; end: string; workday: boolean };
  arrival: Mark;
  departure: Mark;
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
  const [missionOpen, setMissionOpen] = useState(false);
  const [missionKind, setMissionKind] = useState<"task" | "project" | "slip">("task");
  const [missionId, setMissionId] = useState("");
  const [now, setNow] = useState(serverNow);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => { setNow(clockNow()); setTick((t) => t + 1); }, 15000);
    setNow(clockNow());
    return () => window.clearInterval(id);
  }, []);

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
    if (res.ok && res.status !== "refuse") {
      setStep((current) => current === "arrivee" ? "depart" : "fini");
      setMissionOpen(false);
    }
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

  function stopScan() {
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
  }

  // Temps travaillé aujourd'hui (session en cours comprise).
  const worked = useMemo(() => {
    if (!arrival) return 0;
    const end = departure ? Date.parse(departure.at) : Date.now();
    return (end - Date.parse(arrival.at)) / 60000;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival, departure, tick]);

  const days = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of week) map.set(r.iso, [...(map.get(r.iso) ?? []), r]);
    return [...map.entries()].map(([iso, rows]) => ({
      iso,
      label: new Date(`${iso}T12:00:00+03:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }),
      rows: rows.slice().sort((a, b) => a.time.localeCompare(b.time)),
    }));
  }, [week]);

  const choices = missionKind === "task" ? tasks : missionKind === "project" ? projects : slips;
  const showInstall = !standalone && !dismissed;
  const ready = consent && priv === false;
  const dateLabel = new Date(`${todayIso}T12:00:00+03:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const state = step === "arrivee"
    ? { dot: "bg-white/50", text: "Pas encore pointé" }
    : step === "depart"
      ? { dot: "bg-emerald-400 animate-pulse", text: `Au travail depuis ${arrival?.time ?? ""}` }
      : { dot: "bg-gold", text: "Journée terminée" };

  const timelineItem = (label: string, mark: Mark, icon: React.ReactNode, active: boolean) => (
    <div className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 ${mark ? "bg-white/10" : active ? "bg-white/[0.06] ring-1 ring-white/20" : "bg-white/[0.04]"}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${mark ? "bg-gold text-navy-900" : "bg-white/10 text-white/60"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-white/55">{label}</span>
        <span className="block text-lg font-bold tabular-nums leading-tight text-white">{mark ? mark.time : "--:--"}</span>
        {mark && mark.status !== "valide" && <span className="text-[11px] font-semibold text-gold">{mark.mission ? "Mission · " : ""}{STATUS_LABEL[mark.status] ?? mark.status}</span>}
      </span>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* En-tête : heure, état du jour, arrivée / départ */}
      <section className="overflow-hidden rounded-2xl bg-navy text-white">
        <div className="bg-[radial-gradient(circle_at_100%_0%,rgba(245,166,35,0.22),transparent_45%)] px-5 pb-5 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-white/60 first-letter:uppercase">{dateLabel}</p>
              <h1 className="mt-0.5 text-xl font-bold">Bonjour {firstName}</h1>
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
                <span className={`h-2 w-2 rounded-full ${state.dot}`} />
                {state.text}
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold tabular-nums leading-none tracking-tight sm:text-5xl">{now}</p>
              <p className="mt-1.5 text-xs text-white/55">{schedule.workday ? `Horaire ${schedule.start} – ${schedule.end}` : "Jour de repos"}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            {timelineItem("Arrivée", arrival, <LogIn size={17} />, step === "arrivee")}
            {timelineItem("Départ", departure, <LogOut size={17} />, step === "depart")}
          </div>
          {arrival && (
            <p className="mt-3 flex items-center gap-2 text-sm text-white/75">
              <Clock size={15} className="text-gold" />
              {step === "fini" ? "Temps de présence" : "Temps de présence en cours"} : <b className="tabular-nums text-white">{duration(worked)}</b>
            </p>
          )}
        </div>
      </section>

      {/* Navigation privée / vérification */}
      {priv === null && (
        <p className="card card-pad flex items-center gap-2 text-sm text-navy-600"><LoaderCircle size={16} className="animate-spin" /> Vérification du navigateur…</p>
      )}
      {priv && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <ShieldAlert size={20} className="mt-0.5 shrink-0" />
          <p><b>Navigation privée détectée.</b> {PRIVATE_HELP}</p>
        </div>
      )}

      {/* Consentement */}
      {!consent && priv === false && (
        <form action={acceptConsent} className="card card-pad space-y-4" onSubmit={() => setConsent(true)}>
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck size={20} /></span>
            <div>
              <p className="font-bold text-navy">Avant votre premier pointage</p>
              <p className="mt-1 text-sm text-navy-600/85">La position et le réseau sont vérifiés <b>uniquement au moment du pointage</b>, pour confirmer la présence au bureau. Il n'y a aucun suivi en continu.</p>
            </div>
          </div>
          <button className="btn-primary h-12 w-full">J'ai compris, continuer</button>
        </form>
      )}

      {/* Action principale */}
      {ready && (
        step === "fini" ? (
          <div className="card card-pad flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={26} /></span>
            <div>
              <p className="font-bold text-navy">Journée enregistrée</p>
              <p className="text-sm text-navy-600/80">Arrivée à {arrival?.time} et départ à {departure?.time}. À demain !</p>
            </div>
          </div>
        ) : (
          <section className="card overflow-hidden">
            {scanning ? (
              <div className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-bold text-navy">Visez le QR code du bureau</p>
                  <button type="button" onClick={stopScan} className="grid h-9 w-9 place-items-center rounded-lg text-navy-600 hover:bg-navy-50" aria-label="Annuler le scan"><X size={18} /></button>
                </div>
                <div className="relative overflow-hidden rounded-xl bg-navy-900">
                  <div id="qr-reader" className="overflow-hidden rounded-xl" />
                </div>
                <p className="mt-3 text-center text-xs text-navy-600/70">Le pointage est enregistré dès que le code est lu.</p>
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <button
                  type="button"
                  className="btn-primary h-16 w-full gap-3 text-[17px]"
                  disabled={busy}
                  onClick={() => scan()}
                >
                  {busy ? <LoaderCircle size={22} className="animate-spin" /> : <QrCode size={22} />}
                  {busy ? "Enregistrement…" : step === "depart" ? "Scanner pour partir" : "Scanner pour arriver"}
                </button>
                <p className="mt-3 text-center text-sm text-navy-600/75">Scannez le QR code affiché au bureau.</p>
              </div>
            )}

            {!scanning && (
              <div className="border-t border-navy-100">
                <button
                  type="button"
                  onClick={() => setMissionOpen((o) => !o)}
                  aria-expanded={missionOpen}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-navy-50/60 sm:px-6"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700"><MapPin size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-navy">Je suis en mission</span>
                    <span className="block text-xs text-navy-600/70">Hors du bureau : position enregistrée, validée ensuite par le manager.</span>
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-navy-600/50 transition ${missionOpen ? "rotate-180" : ""}`} />
                </button>
                {missionOpen && (
                  <div className="space-y-3 px-5 pb-5 sm:px-6">
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-navy-50 p-1" role="radiogroup" aria-label="Type de mission">
                      {([["task", "Tâche", Briefcase], ["project", "Projet", FolderKanban], ["slip", "Matériel", PackageOpen]] as const).map(([key, label, Icon]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={missionKind === key}
                          title={key === "slip" ? "Bon de sortie de matériel" : undefined}
                          onClick={() => { setMissionKind(key); setMissionId(""); }}
                          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition ${missionKind === key ? "bg-white text-navy ring-1 ring-navy-100" : "text-navy-600/75 hover:text-navy"}`}
                        >
                          <Icon size={15} /> {label}
                        </button>
                      ))}
                    </div>
                    <select className="input" value={missionId} onChange={(e) => setMissionId(e.target.value)} aria-label="Mission">
                      <option value="">{choices.length ? "Choisir…" : "Aucun élément disponible"}</option>
                      {choices.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button type="button" className="btn-gold h-11 w-full" disabled={busy || !missionId} onClick={() => submit("mission")}>
                      {busy ? <LoaderCircle size={18} className="animate-spin" /> : <MapPin size={17} />}
                      {step === "depart" ? "Enregistrer mon départ en mission" : "Enregistrer mon arrivée en mission"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )
      )}

      {ready && result && (
        <Flash
          key={result.at}
          className="mb-0"
          tone={result.ok && result.status !== "refuse" ? "success" : "error"}
          message={result.ok && result.status ? `${result.message} ${STATUS_LABEL[result.status] ?? result.status}.` : result.message}
        />
      )}

      {/* Installation sur l'écran d'accueil */}
      {showInstall && (
        <section className="card card-pad">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-600"><Smartphone size={20} /></span>
            <div className="min-w-0">
              <p className="font-bold text-navy">Ajoutez Pixel Nomade à l'écran d'accueil</p>
              <p className="mt-1 text-sm text-navy-600/85">L'icône ouvre directement le pointage et votre téléphone reste reconnu.</p>
              <p className="mt-1 text-sm text-navy-600/85">Sur iPhone : <b>Partager</b> puis <b>« Sur l'écran d'accueil »</b>. Pointez ensuite depuis cette icône (l'appareil photo ouvre Safari, compté comme un autre appareil).</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {install && (
              <button className="btn-primary flex-1" onClick={async () => {
                await promptRef.current?.prompt();
                setInstall(false);
              }}>Ajouter</button>
            )}
            <button className="btn-ghost flex-1" onClick={() => { localStorage.setItem("pf_install_dismissed", "1"); setDismissed(true); }}>Plus tard</button>
          </div>
        </section>
      )}

      {/* Historique de la semaine */}
      <section className="card">
        <h2 className="h-section px-5 pb-1 pt-5 sm:px-6">Mes 7 derniers jours</h2>
        {days.length === 0 ? <p className="px-5 pb-6 pt-2 text-sm text-navy-600/70 sm:px-6">Aucun pointage pour l'instant.</p> : (
          <ul className="divide-y divide-navy-100">
            {days.map((d) => (
              <li key={d.iso} className="px-5 py-3 sm:px-6">
                <p className="mb-1.5 text-sm font-bold text-navy first-letter:uppercase">{d.iso === todayIso ? "Aujourd'hui" : d.label}</p>
                <ul className="space-y-1.5">
                  {d.rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 text-sm">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${r.kind === "depart" ? "bg-navy-50 text-navy-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {r.kind === "depart" ? <LogOut size={14} /> : <LogIn size={14} />}
                      </span>
                      <span className="w-12 font-bold tabular-nums text-navy">{r.time}</span>
                      <span className="min-w-0 flex-1 truncate text-navy-600/80">{r.kind === "depart" ? "Départ" : "Arrivée"} · {r.place}</span>
                      <span className={STATUS_BADGE[r.status] ?? "badge-gray"}>{STATUS_LABEL[r.status] ?? r.status}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
