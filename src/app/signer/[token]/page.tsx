import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "@/lib/settings";
import { dateFr, fdj, today } from "@/lib/format";
import { amountInWords } from "@/lib/words";
import { DocLines } from "@/components/DocLines";
import { Flash } from "@/components/Flash";
import { signQuote } from "./actions";
import { SignForm } from "./SignForm";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  incomplet: "Indiquez votre nom, cochez l'accord et signez dans le cadre.",
  expire: "Ce devis n'est plus valable. Contactez Pixel Nomade pour un nouveau devis.",
  refuse: "Ce devis a été refusé et ne peut plus être signé.",
};

export default async function SignPage({ params, searchParams }: { params: { token: string }; searchParams: { ok?: string; e?: string } }) {
  const [q] = await db.select().from(schema.quotes).where(eq(schema.quotes.signToken, params.token));
  if (!q) notFound();
  const items = await db.select().from(schema.quoteItems).where(eq(schema.quoteItems.quoteId, q.id)).orderBy(asc(schema.quoteItems.position));
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, q.clientId));
  const events = Object.fromEntries((await db.select().from(schema.eventTypes)).map((e) => [e.id, e.name]));
  const st = await getSettings();
  const expired = Boolean(q.validUntil && q.validUntil < today() && !q.signedAt);
  const refused = q.status === "refuse" && !q.signedAt;
  const logo = st.logoPath || "/logo.png";
  const deposit = Math.round((q.total * q.depositPercent) / 100);

  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#f8fafd] via-[#f2f5fa] to-[#edf1f8] px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="card card-pad flex flex-wrap items-center gap-4">
          <img src={logo} alt={st.companyName} className="h-14 max-w-[180px] object-contain" />
          <div>
            <p className="text-lg font-bold text-navy">{st.companyName}</p>
            <p className="text-sm text-navy-600/80">{st.tagline}</p>
          </div>
        </header>

        <div>
          <h1 className="break-words text-2xl font-bold leading-tight tracking-tight text-navy sm:text-[30px]">Devis {q.number}</h1>
          <p className="mt-1 text-navy-600/80">{q.subject}</p>
        </div>

        <Flash className="mb-0" message={searchParams.ok ? "Merci, le devis est signé." : ""} clear={["ok"]} />
        <Flash className="mb-0" tone="error" message={searchParams.e ? ERR[searchParams.e] : ""} clear={["e"]} />

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="card card-pad">
            <p className="h-section">Client</p>
            <p className="font-bold">{client.name}</p>
          </div>
          <div className="card card-pad">
            <p className="h-section">Émis le</p>
            <p className="font-bold">{dateFr(q.issueDate)}</p>
            <p className="text-sm text-navy-600">Valable jusqu'au {dateFr(q.validUntil)}</p>
          </div>
          <div className="card card-pad">
            <p className="h-section">Acompte {q.depositPercent} %</p>
            <p className="font-bold">{fdj(deposit)}</p>
            <p className="text-sm text-navy-600">Solde {fdj(q.total - deposit)}</p>
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
        {q.notes && <div className="card card-pad"><p className="h-section mb-1">Conditions</p><p className="whitespace-pre-line">{q.notes}</p></div>}
        <p className="text-sm text-navy-600">{st.paymentTerms}</p>
        <a href={`/signer/${params.token}/pdf`} className="btn-ghost" target="_blank">Télécharger le PDF</a>

        {q.signedAt && q.signatureData ? (
          <div className="card card-pad">
            <p className="h-section mb-2">Signé</p>
            <img src={`data:image/png;base64,${q.signatureData}`} alt="Signature" className="h-24 bg-white" />
            <p className="text-sm text-navy-600 mt-2">Par {q.signerName}, le {dateFr(q.signedAt)}.</p>
          </div>
        ) : expired || refused ? (
          <p className="rounded-lg bg-red-50 text-red-700 px-4 py-2 font-bold">{expired ? ERR.expire : ERR.refuse}</p>
        ) : (
          <SignForm defaultName={client.name} action={signQuote.bind(null, params.token)} />
        )}

        <p className="text-xs text-navy-600/70">{st.companyName} · {st.address} · {st.phone} · {st.email}</p>
      </div>
    </main>
  );
}
