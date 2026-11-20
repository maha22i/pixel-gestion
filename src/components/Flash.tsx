"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Tone = "success" | "error" | "warning";

const STYLE: Record<Tone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

const DELAY: Record<Tone, number> = {
  success: 5000,
  warning: 6500,
  error: 8000,
};

const STORAGE = "pf-flashes";

type Saved = { text: string; tone: Tone; until: number; clear: string; path: string };

let pendingUrl: URL | null = null;
let stripQueued = false;

function readSaved(): Saved[] {
  try {
    const raw = sessionStorage.getItem(STORAGE);
    const list = raw ? JSON.parse(raw) as Saved[] : [];
    const now = Date.now();
    return list.filter((item) => item.text && item.until > now);
  } catch {
    return [];
  }
}

function writeSaved(list: Saved[]) {
  try {
    if (list.length) sessionStorage.setItem(STORAGE, JSON.stringify(list));
    else sessionStorage.removeItem(STORAGE);
  } catch {
    /* navigation privée : le message reste affiché, sans reprise après rechargement */
  }
}

function remember(item: Saved) {
  writeSaved(readSaved().filter((saved) => !(saved.path === item.path && saved.clear === item.clear)).concat(item));
}

function forget(path: string, clear: string) {
  writeSaved(readSaved().filter((saved) => !(saved.path === path && saved.clear === clear)));
}

function queueStrip(keys: string[], pathname: string, replace: (href: string) => void) {
  const base = pendingUrl ?? new URL(window.location.href);
  let changed = false;
  for (const key of keys) {
    if (key && base.searchParams.has(key)) {
      base.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  pendingUrl = base;
  if (stripQueued) return;
  stripQueued = true;
  queueMicrotask(() => {
    stripQueued = false;
    const url = pendingUrl;
    pendingUrl = null;
    if (!url) return;
    const qs = url.searchParams.toString();
    replace(qs ? `${pathname}?${qs}` : pathname);
  });
}

export function Flash({
  message,
  tone = "success",
  clear,
  className = "mb-4",
}: {
  message?: string | null;
  tone?: Tone;
  clear?: string[];
  className?: string;
}) {
  const incoming = message?.trim() ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const clearKey = clear?.filter(Boolean).join(",") ?? "";
  const seed = useRef<{ text: string; tone: Tone; life: number } | null>(null);
  if (!seed.current) {
    const saved = !incoming && clearKey && typeof window !== "undefined"
      ? readSaved().find((item) => item.path === pathname && item.clear === clearKey)
      : undefined;
    seed.current = {
      text: incoming || saved?.text || "",
      tone: incoming ? tone : (saved?.tone ?? tone),
      life: saved ? Math.max(250, saved.until - Date.now()) : DELAY[tone],
    };
  }
  const [text, setText] = useState(seed.current.text);
  const [shownTone, setShownTone] = useState<Tone>(seed.current.tone);
  const [open, setOpen] = useState(Boolean(seed.current.text));
  const [paused, setPaused] = useState(false);
  const [life, setLife] = useState(seed.current.life);
  const left = useRef(seed.current.life);
  const armed = useRef("");

  useEffect(() => {
    if (!incoming) {
      armed.current = "";
      return;
    }
    const token = `${pathname}|${incoming}|${clearKey}|${tone}`;
    if (armed.current === token) return;
    armed.current = token;
    setText(incoming);
    setShownTone(tone);
    setOpen(true);
    setLife(DELAY[tone]);
    left.current = DELAY[tone];
    if (!clearKey) return;
    remember({ text: incoming, tone, until: Date.now() + DELAY[tone], clear: clearKey, path: pathname });
    queueStrip(clearKey.split(","), pathname, (href) => router.replace(href, { scroll: false }));
  }, [incoming, tone, clearKey, pathname, router]);

  useEffect(() => {
    if (!open || paused || !text) return;
    const started = Date.now();
    const id = window.setTimeout(() => {
      if (clearKey) forget(pathname, clearKey);
      setOpen(false);
    }, left.current);
    return () => {
      left.current = Math.max(0, left.current - (Date.now() - started));
      window.clearTimeout(id);
    };
  }, [open, paused, text, pathname, clearKey]);

  if (!open || !text) return null;

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`${className} relative overflow-hidden rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm ${STYLE[shownTone]}`}
    >
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 leading-snug">{text}</p>
        <button
          type="button"
          onClick={() => {
            if (clearKey) forget(pathname, clearKey);
            setOpen(false);
          }}
          className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-lg leading-none opacity-60 hover:bg-black/5 hover:opacity-100"
          aria-label="Fermer le message"
        >
          ×
        </button>
      </div>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-40 motion-reduce:hidden"
        style={{
          animation: `flash-shrink ${life}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}
