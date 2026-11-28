import { redirect } from "next/navigation";

/** Ancienne fiche utilisateur : tout se fait désormais dans les fenêtres de /utilisateurs. */
export default function EditUser({ params }: { params: { id: string } }) {
  redirect(`/utilisateurs?modifier=${Number(params.id) || ""}`);
}
