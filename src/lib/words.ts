// Conversion d'un entier en toutes lettres (français, règles 1990 sans traits d'union systématiques)
const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix",
  "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  let u = n % 10;
  if (t === 7 || t === 9) u += 10; // soixante-dix, quatre-vingt-dix
  let word = TENS[t];
  if (u === 0) return t === 8 ? "quatre-vingts" : word;
  if ((u === 1 || u === 11) && t !== 8 && t !== 9) return `${word} et ${UNITS[u]}`;
  return `${word}-${UNITS[u]}`;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let out = "";
  if (h > 0) {
    out = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 ? "s" : ""}`;
  }
  if (r > 0) out += (out ? " " : "") + below100(r);
  return out;
}

export function numberToWordsFr(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const scales: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  for (const [size, sing, plur] of scales) {
    if (n >= size) {
      const q = Math.floor(n / size);
      parts.push(`${below1000(q)} ${q > 1 ? plur : sing}`);
      n %= size;
    }
  }
  if (n >= 1000) {
    const q = Math.floor(n / 1000);
    parts.push(q === 1 ? "mille" : `${below1000(q).replace(/(cent|vingt)s$/, "$1")} mille`);
    n %= 1000;
  }
  if (n > 0) parts.push(below1000(n));
  return parts.join(" ");
}

export function amountInWords(value: number) {
  const w = numberToWordsFr(value);
  const de = /(million|milliard)s?$/.test(w) ? " de" : ""; // « deux millions de francs »
  return w.charAt(0).toUpperCase() + w.slice(1) + de + " francs Djibouti";
}
