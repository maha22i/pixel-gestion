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
  vue: "semaine" | "jour";
  offset: number;
  jour: string;
  selectedPersonId: number;
  people: Person[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action="/planning" method="get" className="flex w-full min-w-0 flex-col gap-1 sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <input type="hidden" name="vue" value={vue} />
      {offset ? <input type="hidden" name="offset" value={String(offset)} /> : null}
      {vue === "jour" ? <input type="hidden" name="jour" value={jour} /> : null}
      <label className="text-sm font-bold text-navy">Filtrer par personne</label>
      <select
        name="personne"
        defaultValue={selectedPersonId ? String(selectedPersonId) : ""}
        className="input h-8 w-full sm:w-56"
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="">Planning général (toute l'équipe)</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </form>
  );
}
