/** Couleur de chaque catégorie de dépense / mode de paiement (classes Tailwind écrites en entier pour le JIT). */
export const CAT_COLOR: Record<string, string> = {
  salaires: "bg-navy-700",
  materiel: "bg-gold",
  carburant: "bg-sky-500",
  location: "bg-emerald-500",
  sous_traitance: "bg-violet-500",
  communication: "bg-rose-400",
  loyer: "bg-slate-400",
  autre: "bg-navy-200",
};

export const METHOD_COLOR: Record<string, string> = {
  waafi: "bg-sky-500",
  cacpay: "bg-violet-500",
  dmoney: "bg-gold",
  virement: "bg-navy-700",
  especes: "bg-emerald-500",
};
