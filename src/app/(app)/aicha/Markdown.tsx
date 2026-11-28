import Link from "next/link";
import { Fragment } from "react";

/** Rendu Markdown léger et sûr (sans HTML brut) pour les réponses d'Aicha. */
function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] && m[2]) {
      const href = m[2];
      if (href.startsWith("/")) out.push(<Link key={k} href={href} className="font-semibold text-navy underline decoration-gold/60 underline-offset-2 hover:text-gold-600">{m[1]}</Link>);
      else if (/^https?:\/\//.test(href)) out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy underline decoration-gold/60 underline-offset-2">{m[1]}</a>);
      else out.push(m[1]);
    } else if (m[3]) out.push(<strong key={k} className="font-bold text-navy-900">{m[3]}</strong>);
    else if (m[4]) out.push(<code key={k} className="rounded bg-navy-50 px-1 py-0.5 text-[0.9em]">{m[4]}</code>);
    else if (m[5]) out.push(<em key={k}>{m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const k = `b${i}`;
    // Tableau
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      const body: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) body.push(cells(lines[i++]));
      blocks.push(
        <div key={k} className="my-2 overflow-x-auto rounded-lg border border-navy-100">
          <table className="w-full text-sm">
            <thead className="bg-navy-50/70"><tr>{head.map((h, j) => <th key={j} className="px-3 py-2 text-left font-bold text-navy">{inline(h, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri} className="border-t border-navy-100">{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top">{inline(c, `${k}r${ri}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    // Titres
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { blocks.push(<p key={k} className="mb-1 mt-3 font-bold text-navy first:mt-0">{inline(h[2], k)}</p>); i++; continue; }
    // Listes
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(<Tag key={k} className={`my-1.5 space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-gold-600`}>{items.map((it, j) => <li key={j}>{inline(it, `${k}${j}`)}</li>)}</Tag>);
      continue;
    }
    // Paragraphe
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s|^\s*([-*•]|\d+[.)])\s+|^\s*\|/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k} className="my-1.5 first:mt-0 last:mb-0">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `${k}${j}`)}</Fragment>)}</p>);
  }
  return <>{blocks}</>;
}
