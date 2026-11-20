"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function labelTables(root: ParentNode) {
  root.querySelectorAll("table.table").forEach((table) => {
    const heads = [...table.querySelectorAll(":scope > thead th, :scope > thead td")].map((th) =>
      (th.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    table.querySelectorAll(":scope > tbody > tr").forEach((tr) => {
      [...tr.children].forEach((cell, i) => {
        if (!(cell instanceof HTMLTableCellElement)) return;
        if (cell.colSpan > 1 || heads.length === 0) {
          if (cell.dataset.label) delete cell.dataset.label;
          if (cell.colSpan > 1) cell.dataset.span = "1";
          return;
        }
        const label = heads[i] ?? "";
        if ((cell.dataset.label ?? "") !== label) cell.dataset.label = label;
        if (cell.dataset.span) delete cell.dataset.span;
      });
    });
  });
}

export function MobileTables() {
  const path = usePathname();
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTables(document.body));
    };
    run();
    const obs = new MutationObserver(run);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [path]);
  return null;
}
