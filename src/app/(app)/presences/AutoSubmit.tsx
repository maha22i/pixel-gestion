"use client";

/** Formulaire GET qui s'envoie dès qu'un champ change (filtres sans bouton « Afficher »). */
export function AutoSubmitForm({ children, className, action }: { children: React.ReactNode; className?: string; action: string }) {
  return (
    <form action={action} method="get" className={className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}
