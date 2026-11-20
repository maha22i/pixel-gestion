import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { can, requirePerm } from "@/lib/auth";
import { CONDITIONS, RETURN_CONDITIONS, RETURN_STATUS, SLIP_STATUS } from "@/lib/equipmentLabels";
import { qtyAvailable, toLocalInput } from "@/lib/equipmentSlips";
import { Field, PageHeader } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ControlForm } from "../ControlForm";
import { SlipForm } from "../SlipForm";
import { deleteSlip, duplicateSlip, reportReturned, returnMissingItem, validateSlip } from "../actions";

export default async function SlipPage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; err?: string; msg?: string } }) {
  const user = await requirePerm("materiel");
  const id = Number(params.id);
  const write = can(user, "materiel", "write");
  const [slip] = await db.select().from(schema.equipmentSlips).where(eq(schema.equipmentSlips.id, id));
  if (!slip) notFound();

  const members = await db.select().from(schema.equipmentSlipMembers).where(eq(schema.equipmentSlipMembers.slipId, id));
  const isMember = members.some((m) => m.userId === user.id);
  if (!write && !isMember) notFound();

  const items = await db.select().from(schema.equipmentSlipItems).where(eq(schema.equipmentSlipItems.slipId, id));
  const people = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.active, true)).orderBy(asc(schema.users.name));
  const equipmentRows = await db.select().from(schema.equipment);
  const categories = await db.select().from(schema.equipmentCategories);
  const project = slip.projectId ? (await db.select().from(schema.projects).where(eq(schema.projects.id, slip.projectId)))[0] : null;
  const client = project?.clientId ? (await db.select().from(schema.clients).where(eq(schema.clients.id, project.clientId)))[0] : null;
  const name = (uid: number | null) => people.find((p) => p.id === uid)?.name ?? "—";
  const label = (cid: number | null) => {
    const c = categories.find((x) => x.id === cid);
    if (!c) return "Sans catégorie";
    const p = categories.find((x) => x.id === c.parentId);
    return p ? `${p.name} › ${c.name}` : c.name;
  };
  const overdue = ["sorti", "attente_controle"].includes(slip.status) && slip.expectedReturnAt < new Date();
  const canControl = write && ["sorti", "attente_controle"].includes(slip.status);
  const canReport = slip.status === "sorti" && (write || isMember);
  const closed = ["cloture", "cloture_anomalies"].includes(slip.status);

  if (slip.status === "brouillon" && write) {
    const projects = (await db.select({ id: schema.projects.id, title: schema.projects.title, clientId: schema.projects.clientId }).from(schema.projects).orderBy(asc(schema.projects.title)));
    const clients = await db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients);
    const equipment = await Promise.all(equipmentRows.map(async (e) => ({
      id: e.id, ref: e.ref, name: e.name, quantity: e.quantity, condition: e.condition,
      availability: e.availability, categoryId: e.categoryId, catLabel: label(e.categoryId),
      available: await qtyAvailable(e.id, e.quantity, id),
    })));
    return (
      <>
        <PageHeader
          title={slip.number}
          subtitle="Brouillon"
          back={{ href: "/materiel/sorties", label: "Sorties" }}
          actions={
            <span className="flex flex-wrap gap-2">
              <form action={validateSlip.bind(null, id)}><button className="btn-gold">Valider la sortie</button></form>
              <form action={deleteSlip.bind(null, id)}><ConfirmButton message="Supprimer ce brouillon ?">Supprimer</ConfirmButton></form>
            </span>
          }
        />
        <Flash tone="error" className="mb-3" clear={["err", "msg"]} message={searchParams.err === "stock" ? (searchParams.msg ?? "Stock insuffisant.") : ""} />
        <Flash className="mb-3" message={searchParams.ok ? "Brouillon enregistré." : ""} clear={["ok"]} />
        <SlipForm
          actionId={id}
          people={people}
          projects={projects.map((p) => ({ id: p.id, title: p.title, clientName: clients.find((c) => c.id === p.clientId)?.name ?? null }))}
          equipment={equipment}
          initial={{
            projectId: slip.projectId, offProjectReason: slip.offProjectReason,
            outAt: toLocalInput(slip.outAt), expectedReturn: toLocalInput(slip.expectedReturnAt),
            location: slip.location, responsibleUserId: slip.responsibleUserId,
            memberIds: members.map((m) => m.userId), notes: slip.notes,
            lines: items.map((i) => ({ equipmentId: i.equipmentId, quantity: i.quantity, conditionOut: i.conditionOut, noteOut: i.noteOut ?? "" })),
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={slip.number}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <span className={slip.status === "cloture_anomalies" ? "badge-red" : "badge-navy"}>{SLIP_STATUS[slip.status]}</span>
          {overdue && <span className="badge bg-red-600 text-white">Retour en retard</span>}
          {project ? <Link className="link" href={`/projets/${project.id}`}>{project.title}</Link> : <span>{slip.offProjectReason}</span>}
          {client && <span>· {client.name}</span>}
        </span>}
        back={{ href: "/materiel/sorties", label: "Sorties" }}
        actions={
          <span className="flex flex-wrap gap-2">
            {slip.status !== "brouillon" && <a className="btn-ghost" href={`/api/pdf/materiel/sortie/${id}`}>PDF sortie</a>}
            {closed && <a className="btn-ghost" href={`/api/pdf/materiel/retour/${id}`}>PDF retour</a>}
            {write && <form action={duplicateSlip.bind(null, id)}><button className="btn-ghost">Dupliquer</button></form>}
          </span>
        }
      />
      <Flash className="mb-0" message={searchParams.ok ? "Enregistré." : ""} clear={["ok"]} />

      <section className="card card-pad grid gap-2 text-sm md:grid-cols-2">
        <p><span className="text-navy-600/70">Sortie</span> · {slip.outAt.toLocaleString("fr-FR")}</p>
        <p><span className="text-navy-600/70">Retour prévu</span> · {slip.expectedReturnAt.toLocaleString("fr-FR")}</p>
        <p><span className="text-navy-600/70">Lieu</span> · {slip.location}</p>
        <p><span className="text-navy-600/70">Responsable</span> · {name(slip.responsibleUserId)}</p>
        <p className="md:col-span-2"><span className="text-navy-600/70">Équipe</span> · {members.map((m) => name(m.userId)).join(", ")}</p>
        {slip.notes && <p className="md:col-span-2"><span className="text-navy-600/70">Notes</span> · {slip.notes}</p>}
      </section>

      {canReport && (
        <form action={reportReturned.bind(null, id)} className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-navy">L'équipe est de retour ? Déclarez le matériel rapporté pour lancer le contrôle.</p>
          <button className="btn-gold">Matériel rapporté</button>
        </form>
      )}

      {canControl && (
        <ControlForm
          slipId={id}
          items={items}
          equipment={equipmentRows.map((e) => ({ id: e.id, ref: e.ref, name: e.name }))}
        />
      )}

      {!canControl && (
        <section className="card overflow-x-auto">
          <p className="h-section px-4 pt-4">Matériel</p>
          <table className="table">
            <thead><tr><th>Réf.</th><th>Nom</th><th>Qté</th><th>État départ</th><th>Remarque</th>{closed && <><th>Rentré</th><th>État retour</th></>}</tr></thead>
            <tbody>
              {items.map((it) => {
                const e = equipmentRows.find((x) => x.id === it.equipmentId);
                return (
                  <tr key={it.id}>
                    <td className="font-mono text-sm">{e?.ref}</td>
                    <td><Link className="link" href={`/materiel/${it.equipmentId}`}>{e?.name}</Link></td>
                    <td>{it.quantity}</td>
                    <td>{CONDITIONS[it.conditionOut] ?? it.conditionOut}</td>
                    <td>{it.noteOut || "—"}</td>
                    {closed && (
                      <>
                        <td>{RETURN_STATUS[it.returned ?? ""] ?? "—"}{it.returned === "partiel" ? ` (${it.qtyReturned})` : ""}</td>
                        <td>{RETURN_CONDITIONS[it.conditionIn ?? ""] ?? "—"}{it.noteIn ? ` · ${it.noteIn}` : ""}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {write && slip.status === "cloture_anomalies" && items.some((i) => i.returned === "non" || (i.returned === "partiel" && (i.qtyReturned ?? 0) < i.quantity)) && (
        <section className="card card-pad space-y-3">
          <p className="h-section">Rentrer un article manquant</p>
          {items.filter((i) => i.returned === "non" || (i.returned === "partiel" && (i.qtyReturned ?? 0) < i.quantity)).map((it) => {
            const e = equipmentRows.find((x) => x.id === it.equipmentId);
            return (
              <form key={it.id} action={returnMissingItem.bind(null, it.id)} className="flex flex-wrap items-end gap-2 rounded-xl border border-navy-100 p-3">
                <p className="min-w-48 font-bold">{e?.ref} · {e?.name}</p>
                <Field label="État"><select name="conditionIn" className="input" defaultValue="bon">{Object.entries(RETURN_CONDITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Remarque"><input name="note" className="input" /></Field>
                <button className="btn-navy">Marquer rentré</button>
              </form>
            );
          })}
        </section>
      )}
    </div>
  );
}
