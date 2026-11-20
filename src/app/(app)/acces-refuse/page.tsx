import Link from "next/link";

export default function Denied() {
  return (
    <div className="card card-pad max-w-lg mx-auto mt-16 text-center">
      <p className="text-5xl font-bold text-gold">403</p>
      <h1 className="text-xl font-bold text-navy mt-2">Accès non autorisé</h1>
      <p className="text-navy-600/70 mt-2">Vous n'avez pas les droits pour ce module. Demandez à l'administrateur de vous les attribuer.</p>
      <Link href="/profil" className="btn-ghost mt-6">Mon profil</Link>
    </div>
  );
}
