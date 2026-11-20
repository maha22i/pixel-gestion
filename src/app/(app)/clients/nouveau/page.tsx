import { requirePerm } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../ClientForm";
import { createClient } from "../actions";

export default async function NewClient({ searchParams }: { searchParams: { back?: string } }) {
  await requirePerm("clients", "write");
  const back = searchParams.back && searchParams.back.startsWith("/") ? searchParams.back : undefined;
  return (
    <>
      <PageHeader title="Nouveau client" back={{ href: back ?? "/clients", label: back ? "Retour" : "Clients" }} />
      <div className="max-w-3xl"><ClientForm action={createClient} back={back} /></div>
    </>
  );
}
