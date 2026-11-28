"use client";

import { useRef } from "react";

type Person = { id: number; name: string };

export function PersonFilter({
  vue,
  offset,
  jour,
  selectedPersonId,
  people,
}: {
  vue: string;
  offset: number;
  jour: string;
  selectedPersonId: number;
  people: Person[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action="/planning" method="get" className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
      <input type="hidden" name="vue" value={vue} />
      {offset ? <input type="hidden" name="offset" value={String(offset)} /> : null}
      {vue === "jour" ? <input type="hidden" name="jour" value={jour} /> : null}
      <label htmlFor="planning-personne" className="shrink-0 text-sm font-bold text-navy">Planning de</label>
      <select
        id="planning-personne"
        name="personne"
        defaultValue={selectedPersonId ? String(selectedPersonId) : ""}
        className="input h-9 w-full sm:w-56"
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="">Toute l'équipe</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </form>
  );
}
