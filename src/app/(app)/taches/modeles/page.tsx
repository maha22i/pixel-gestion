import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createSeries, saveTemplate } from "../actions";

export default async function ModelesPage() {
  await requirePerm("taches", "write");
  const templates = await db.select().from(schema.taskTemplates).orderBy(asc(schema.taskTemplates.name));
  const items = await db.select().from(schema.taskTemplateItems);
  const people = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  return (
    <>
      <PageHeader title="Modèles et récurrence" back={{ href: "/taches", label: "Tâches" }} />
      <div className="grid lg:grid-cols-2 gap-6">
        <form action={saveTemplate} className="card card-pad space-y-2">
          <p className="h-section">Nouveau modèle</p>
          <input name="name" required className="input" placeholder="Nom" />
          <input name="description" className="input" placeholder="Description" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2">
              <input name="itemTitle" className="input min-w-0 flex-1" placeholder={`Tâche ${i + 1}`} />
              <input name="offset" type="number" className="input w-20 shrink-0" placeholder="J±" defaultValue={i} />
            </div>
          ))}
          <button className="btn-primary">Enregistrer le modèle</button>
        </form>
        <form action={createSeries} className="card card-pad space-y-2">
          <p className="h-section">Tâche récurrente</p>
          <input name="title" required className="input" placeholder="Titre" />
          <textarea name="description" className="input" placeholder="Description" />
          <select name="freq" className="input"><option value="week">Chaque semaine</option><option value="day">Chaque jour</option><option value="month">Chaque mois</option></select>
          <div className="flex flex-wrap gap-2 text-sm">
            {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((l, i) => (
              <label key={l}><input type="checkbox" name="weekdays" value={i} /> {l}</label>
            ))}
          </div>
          <input type="date" name="dueDate" className="input" required />
          <input type="date" name="until" className="input" />
          <select name="assignee" className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button className="btn-primary">Créer les occurrences (4 semaines)</button>
        </form>
      </div>
      <ul className="mt-6 space-y-2">
        {templates.map((t) => (
          <li key={t.id} className="card card-pad">
            <p className="font-bold">{t.name}</p>
            <p className="text-sm">{items.filter((i) => i.templateId === t.id).map((i) => `${i.title} (J${i.offsetDays >= 0 ? "+" : ""}${i.offsetDays})`).join(" · ") || "Aucune ligne"}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
