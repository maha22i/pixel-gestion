/** Paysage décoratif (soleil, montagnes, dunes, pixels) inspiré du logo Pixel Nomade. */
export function DesertScene({ id, className = "" }: { id: string; className?: string }) {
  // Ids uniques par instance : deux scènes sur la page (mobile + ordinateur) ne doivent pas partager leurs dégradés.
  const g = (name: string) => `${id}-${name}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 420"
      preserveAspectRatio="xMidYMax slice"
      overflow="visible"
      className={`overflow-visible ${className}`}
    >
      <defs>
        <radialGradient id={g("sun-glow")} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5A623" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#F5A623" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("sun")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFC65C" />
          <stop offset="100%" stopColor="#F5A623" />
        </linearGradient>
        <linearGradient id={g("mountain")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34506F" />
          <stop offset="100%" stopColor="#243A54" />
        </linearGradient>
        <linearGradient id={g("dune-mid")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E3048" />
          <stop offset="100%" stopColor="#192839" />
        </linearGradient>
        <linearGradient id={g("dune-front")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#142130" />
          <stop offset="100%" stopColor="#0F1924" />
        </linearGradient>
      </defs>

      {/* Soleil */}
      <circle cx="540" cy="215" r="210" fill={`url(#${g("sun-glow")})`} />
      <circle cx="540" cy="215" r="96" fill={`url(#${g("sun")})`} />

      {/* Montagnes */}
      <path
        d="M0 300 L120 228 L190 262 L330 150 L420 220 L470 188 L560 250 L640 196 L800 288 L800 420 L0 420 Z"
        fill={`url(#${g("mountain")})`}
      />
      {/* Neiges */}
      <path d="M330 150 L366 179 L349 176 L336 189 L322 172 L304 171 Z" fill="#FFFFFF" fillOpacity="0.85" />
      <path d="M470 188 L492 202 L479 203 L470 212 L462 202 L452 202 Z" fill="#FFFFFF" fillOpacity="0.7" />
      <path d="M640 196 L668 211 L652 213 L641 223 L631 211 L616 210 Z" fill="#FFFFFF" fillOpacity="0.7" />

      {/* Dune du milieu */}
      <path
        d="M0 318 C140 284 260 300 380 322 C500 344 640 300 800 312 L800 420 L0 420 Z"
        fill={`url(#${g("dune-mid")})`}
      />

      {/* Dune avant + liseré doré */}
      <path
        d="M0 362 C170 330 330 336 470 356 C600 374 700 352 800 340 L800 420 L0 420 Z"
        fill={`url(#${g("dune-front")})`}
      />
      <path
        d="M0 362 C170 330 330 336 470 356 C600 374 700 352 800 340"
        fill="none"
        stroke="#F5A623"
        strokeOpacity="0.55"
        strokeWidth="2"
      />

      {/* Pixels */}
      <g>
        <rect x="190" y="196" width="14" height="14" rx="2" fill="#F5A623" />
        <rect x="212" y="176" width="10" height="10" rx="2" fill="#F5A623" fillOpacity="0.7" />
        <rect x="176" y="220" width="9" height="9" rx="2" fill="#FFFFFF" fillOpacity="0.8" />
        <rect x="222" y="212" width="8" height="8" rx="1.5" fill="#FFFFFF" fillOpacity="0.35" />
        <rect x="630" y="104" width="10" height="10" rx="2" fill="#F5A623" fillOpacity="0.85" />
        <rect x="648" y="88" width="7" height="7" rx="1.5" fill="#FFFFFF" fillOpacity="0.6" />
        <rect x="662" y="116" width="6" height="6" rx="1.5" fill="#FFFFFF" fillOpacity="0.3" />
      </g>
    </svg>
  );
}
