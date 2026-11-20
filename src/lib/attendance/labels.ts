export const REASON_TEXT: Record<string, string> = {
  qr: "QR code invalide ou remplacé",
  telephone: "Téléphone non autorisé. Le manager doit valider cet appareil.",
  telephone_autre: "Ce téléphone est déjà lié à un autre employé.",
  gps_absent: "Localisation désactivée ou indisponible.",
  gps_hors: "Position hors de la zone du bureau.",
  gps_flou: "Position imprécise : la zone du bureau est dans la marge d'erreur.",
  ip: "Réseau du bureau non reconnu.",
  position_site: "La position du bureau n'est pas encore enregistrée.",
};

export const STATUS_LABEL: Record<string, string> = {
  valide: "Valide",
  a_verifier: "À vérifier",
  refuse: "Refusé",
  mission: "Mission – à valider",
};

export const DAY_STATUS_LABEL: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  justifie: "Justifié",
  ferie: "Férié",
  mission: "Mission",
  repos: "Repos",
  avenir: "À venir",
  attente: "À vérifier",
};

export const ABSENCE_KIND: Record<string, string> = {
  conge: "Congé",
  maladie: "Maladie",
  mission: "Mission",
  autre: "Autre",
};

export const WEEKDAY_LABELS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function reasonLabel(codes: string) {
  return codes.split(",").map((c) => c.trim()).filter(Boolean).map((c) => REASON_TEXT[c] ?? c).join(" · ");
}

export const GPS_HELP = "La localisation est coupée, le pointage est donc refusé. Sur iPhone : Réglages → Confidentialité et sécurité → Service de localisation → Safari ou Pixel Nomade → Lorsque l'app est active. Sur Android : Réglages → Localisation, puis autorise le site dans le navigateur (icône à gauche de l'adresse).";

export const PRIVATE_HELP = "Le pointage est refusé en navigation privée : le téléphone ne peut pas y être mémorisé. Ouvre Pixel Nomade dans le navigateur habituel, ou depuis l'icône sur l'écran d'accueil.";
