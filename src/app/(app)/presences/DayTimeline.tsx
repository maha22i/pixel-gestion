const FROM = 6 * 60;
const TO = 20 * 60;
const SPAN = TO - FROM;
const pct = (m: number) => `${((Math.min(TO, Math.max(FROM, m)) - FROM) / SPAN) * 100}%`;
const width = (a: number, b: number) => `${((Math.min(TO, Math.max(FROM, b)) - Math.min(TO, Math.max(FROM, a))) / SPAN) * 100}%`;

/** Frise 06:00 → 20:00 : plage horaire prévue (fond), présence pointée (barre), heure actuelle (trait). */
export function DayTimeline({
  segments, start, end, now,
}: {
  segments: { from: number; to: number; open: boolean }[];
  start: number;
  end: number;
  now?: number;
}) {
  return (
    <div className="relative h-2.5 w-full min-w-[120px] rounded-full bg-navy-50" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-navy-100" style={{ left: pct(start), width: width(start, end) }} />
      {segments.map((s, i) => (
        <div
          key={i}
          className={`absolute inset-y-0 rounded-full ${s.open ? "bg-emerald-500" : "bg-navy-700"}`}
          style={{ left: pct(s.from), width: width(s.from, Math.max(s.to, s.from + 4)) }}
        />
      ))}
      {now != null && now > FROM && now < TO && <div className="absolute -inset-y-1 w-0.5 rounded bg-gold" style={{ left: pct(now) }} />}
    </div>
  );
}

export function TimelineScale() {
  return (
    <div className="relative h-3 min-w-[120px] text-[10px] font-bold tabular-nums text-navy-600/50" aria-hidden>
      {[8, 12, 16].map((h) => (
        <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h * 60) }}>{h}h</span>
      ))}
    </div>
  );
}
