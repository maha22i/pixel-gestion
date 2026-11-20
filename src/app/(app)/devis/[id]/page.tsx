import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { FileDown, Copy, Pencil, Receipt } from "lucide-react";
import { db, schema } from "@/db";
import { requirePerm, can } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PROJECT_TYPES, QUOTE_STATUS, dateFr, fdj } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { appOrigin, ensureSignToken, quoteInviteText, signUrl, whatsappDigits, whatsappLink } from "@/lib/sign";
import { PageHeader, QuoteBadge } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DocLines } from "@/components/DocLines";
import { convertToInvoice, deleteQuote, duplicateQuote, sendQuoteNow, setQuoteStatus } from "../actions";
import { SendQuoteButton } from "../SendQuoteButton";

const FLASH: Record<string, string> = {
  "1": "Devis enregistré.",
  email: "Devis envoyé par e-mail.",
  whatsapp: "WhatsApp est ouvert avec le lien de signature. Validez l'envoi dans la discussion. Le devis est marqué comme envoyé.",
  both: "WhatsApp est ouvert avec le lien. L'e-mail a aussi été envoyé.",
};
const ERR: Record<string, string> = {
  facture: "Ce devis a déjà une facture : il ne peut pas être supprimé.",
  smtp: "L'e-mail n'a pas pu partir. Vérifiez le serveur SMTP dans Paramètres.",
  contact: "Indiquez un e-mail valide ou un numéro WhatsApp.",
  signe: "Ce devis est déjà signé : il ne peut plus être modifié.",
};

export default async function QuotePage({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; e?: string } }) {
  const user = await requirePerm("devis");
  const id = Number(params.id);
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.id, id));
  if (!q) notFound();
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, id)).orderBy(asc(schema.quoteItems.position));
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, q.clientId));
  const [project] = q.projectId ? await db.select().from(schema.projects).where(eq(schema.projects.id, q.projectId)) : [];
  const events = Object.fromEntries((await db.select().from(schema.eventTypes)).map((e) => [e.id, e.name]));
  const [invoice] = await db.select({ id: schema.invoices.id, number: schema.invoices.number }).from(schema.invoices).where(eq(schema.invoices.quoteId, id));
  const wedding = project?.type === "mariage" || items.some((line) => line.eventTypeId != null);
  const write = can(user, "devis", "write");
  const deposit = Math.round((q.total * q.depositPercent) / 100);
  const st = await getSettings();
  const email = client.email?.includes("@") ? client.email.trim() : "";
  const digits = whatsappDigits(client.phone);
  const token = write ? await ensureSignToken(id) : q.signToken;
  const invite = token
    ? quoteInviteText({ clientName: client.name, number: q.number, subject: q.subject, company: st.companyName, url: signUrl(appOrigin(st.appUrl), token) })
    : "";
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3 flex-wrap">{st.logoPath && <img src={st.logoPath} alt={st.companyName} className="h-11 max-w-[160px] object-contain" />}{q.number} <QuoteBadge s={q.status} /></span>}
        subtitle={q.subject}
        back={{ href: "/devis", label: "Devis" }}
        actions={<>
          <a href={`/api/pdf/devis/${id}`} target="_blank" className="btn-gold"><FileDown size={16} /> PDF</a>
          {write && (
            <SendQuoteButton
              action={sendQuoteNow.bind(null, id)}
              hasEmail={Boolean(email)}
              waUrl={digits ? whatsappLink(digits, invite) : undefined}
              invite={invite}
            />
          )}
          {token && <a href={`/signer/${token}`} target="_blank" className="btn-ghost">Page client</a>}
          {write && !invoice && !q.signedAt && <Link href={`/devis/${id}/modifier`} className="btn-ghost"><Pencil size={16} /> Modifier</Link>}
          {write && <form action={duplicateQuote.bind(null, id)}><button className="btn-ghost"><Copy size={16} /> Dupliquer</button></form>}
          {q.status === "accepte" && !wedding && can(user, "contrats", "write") && (
            <Link href={`/contrats/nouveau?devis=${id}&modele=0`} className="btn-ghost">Créer un contrat</Link>
          )}
          {invoice ? (
            <Link href={`/factures/${invoice.id}`} className="btn-primary"><Receipt size={16} /> Voir la facture {invoice.number}</Link>
          ) : can(user, "factures", "write") && q.status !== "refuse" ? (
            <form action={convertToInvoice.bind(null, id)}>
              <ConfirmButton className="btn-primary" message="Transformer ce devis en facture ? Le devis passera en « Accepté ».">
                <Receipt size={16} /> Convertir en facture
              </ConfirmButton>
            </form>
          ) : null}
        </>}
      />
      <Flash message={searchParams.ok ? FLASH[searchParams.ok] : ""} clear={["ok"]} />
      <Flash tone="error" message={searchParams.e ? ERR[searchParams.e] : ""} clear={["e"]} />
      <div className="grid xl:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="card card-pad">
              <p className="h-section">Client</p>
              <Link href={`/clients/${client.id}`} className="link text-lg">{client.name}</Link>
              <p className="text-sm text-navy-600">{[client.phone, client.email].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="card card-pad">
              <p className="h-section">Projet</p>
              {project ? (<><Link href={`/projets/${project.id}`} className="link">{project.title}</Link><p className="text-sm text-navy-600">{PROJECT_TYPES[project.type]}</p></>) : <p className="text-navy-600/60">—</p>}
            </div>
            <div className="card card-pad">
              <p className="h-section">Dates</p>
              <p>Émis le <b>{dateFr(q.issueDate)}</b></p>
              <p className="text-sm text-navy-600">Valable jusqu'au {dateFr(q.validUntil)}</p>
            </div>
          </div>
          <DocLines
            lines={items}
            events={events}
            subtotal={q.subtotal}
            discount={q.discount}
            total={q.total}
            extra={<p className="text-sm italic text-navy-600 pt-1">{amountInWords(q.total)}</p>}
          />
          {q.notes && <div className="card card-pad"><p className="h-section mb-1">Notes</p><p className="whitespace-pre-line">{q.notes}</p></div>}
          {(q.sentAt || q.signedAt) && (
            <div className="card card-pad">
              <p className="h-section mb-2">Signature en ligne</p>
              {q.sentAt && <p>Envoyé par {q.sentVia === "whatsapp" ? "WhatsApp" : q.sentVia === "both" ? "e-mail et WhatsApp" : "e-mail"} le {dateFr(q.sentAt)}.</p>}
              {q.signedAt && q.signatureData ? (
                <>
                  <img src={`data:image/png;base64,${q.signatureData}`} alt="Signature du client" className="mt-3 h-24 bg-white" />
                  <p className="text-sm text-navy-600 mt-2">Signé par {q.signerName} le {dateFr(q.signedAt)}.</p>
                </>
              ) : (
                <p className="text-sm text-navy-600 mt-1">En attente de la signature du client.</p>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card card-pad">
            <p className="h-section mb-2">Paiement prévu</p>
            <div className="flex justify-between"><span>Acompte {q.depositPercent} %</span><b className="tabular-nums">{fdj(deposit)}</b></div>
            <div className="flex justify-between"><span>Solde</span><b className="tabular-nums">{fdj(q.total - deposit)}</b></div>
          </div>
          {write && (
            <div className="card card-pad">
              <p className="h-section mb-2">Changer le statut</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(QUOTE_STATUS).map(([k, v]) => (
                  <form key={k} action={setQuoteStatus.bind(null, id, k)}>
                    <button disabled={q.status === k} className={`w-full ${q.status === k ? "btn-primary btn-sm" : "btn-ghost btn-sm"}`}>{v}</button>
                  </form>
                ))}
              </div>
            </div>
          )}
          {write && !invoice && (
            <form action={deleteQuote.bind(null, id)}>
              <ConfirmButton message={`Supprimer le devis ${q.number} ?`}>Supprimer le devis</ConfirmButton>
            </form>
          )}
        </aside>
      </div>
    </>
  );
}
