import type { Block, DefinitionRow, Section, ServiceRow } from "./contractModel";

const p = (text: string): Block => ({ type: "p", text });
const ul = (items: string[]): Block => ({ type: "ul", items });
const subs = (items: string[]): Block => ({ type: "subs", items: items.map((text) => ({ text })) });

export type ClauseSeed = { key: string; kind: "article" | "annex"; title: string; blocks: Block[] };

export const CLAUSES: ClauseSeed[] = [
  { key: "definitions", kind: "article", title: "Définitions", blocks: [
    p("Pour l’application du présent contrat, les termes suivants ont la signification ci-après :"),
    { type: "table", id: "definitions" },
  ]},
  { key: "objet", kind: "article", title: "Objet du contrat", blocks: [
    p("Le présent contrat a pour objet de définir les conditions techniques, financières et juridiques dans lesquelles le Prestataire réalise, pour le compte du Client, les prestations décrites à l’article {{art.prestations}}, en vue de valoriser ses activités, ses projets et sa communication."),
  ]},
  { key: "documents", kind: "article", title: "Documents contractuels", blocks: [subs([
    "Les documents contractuels sont, par ordre de priorité décroissant : (1) le présent contrat ; (2) ses annexes ; (3) les avenants éventuels, qui prévalent sur les stipulations qu’ils modifient.",
    "Toute proposition commerciale antérieure n’a qu’une valeur informative. En cas de contradiction, les stipulations du présent contrat prévalent.",
  ])]},
  { key: "duree", kind: "article", title: "Entrée en vigueur et durée", blocks: [subs([
    "Le présent contrat entre en vigueur à la date de sa signature par les deux Parties.",
    "Les prestations débutent le {{date.debut}} {{duree.phrase}}.",
    "Le contrat pourra être renouvelé par avenant écrit signé des deux Parties. Le Prestataire adresse au Client une proposition de renouvellement au plus tard trente (30) jours avant le terme. À défaut de renouvellement, le contrat prend fin de plein droit à son terme.",
  ])]},
  { key: "prestations", kind: "article", title: "Description des prestations", blocks: [
    p("Pendant la durée du contrat, le Prestataire réalise les prestations suivantes :"),
    { type: "table", id: "services" },
    subs([
      "Les volumes indiqués s’entendent selon la périodicité précisée dans le tableau. Les volumes non consommés du fait du Client ne sont ni reportables au-delà de la période suivante, ni remboursables, sauf accord écrit.",
      "Toute prestation dépassant ces volumes ou non prévue au présent article est hors forfait. Elle fait l’objet d’un devis préalable et n’est exécutée qu’après accord écrit du Client.",
      "Les prestations sont réalisées à Djibouti-ville, sauf accord contraire. Les déplacements à l’intérieur font l’objet d’une prise en charge des frais, sur devis accepté.",
    ]),
  ]},
  { key: "execution", kind: "article", title: "Modalités d’exécution", blocks: [subs([
    "Calendrier. Le Prestataire soumet au Client un calendrier des contenus ou des interventions. Le Client le valide ou le commente dans un délai de deux (2) jours ouvrés.",
    "Information. Le Client informe le Prestataire de toute intervention à couvrir au moins quarante-huit (48) heures à l’avance. Une demande plus tardive est satisfaite dans la mesure du possible, sans que l’indisponibilité du Prestataire puisse lui être reprochée.",
    "Délais. Sauf accord contraire : sélection de photos le jour même lorsqu’il y a une activité ; reportage photo sous vingt-quatre (24) heures ; vidéo courte sous soixante-douze (72) heures ; publication soumise au moins quarante-huit (48) heures avant la date prévue.",
    "Report. Le Client peut reporter une intervention sans frais en prévenant au moins vingt-quatre (24) heures à l’avance. Une annulation plus tardive, une fois l’équipe mobilisée, est décomptée du volume prévu.",
  ])]},
  { key: "validation", kind: "article", title: "Validation, corrections et réception", blocks: [subs([
    "Chaque contenu est soumis au référent du Client avant publication. Le Client dispose de deux (2) séries de corrections, traitées sous vingt-quatre (24) à quarante-huit (48) heures.",
    "Une demande modifiant substantiellement le sujet, exigeant un nouveau tournage ou dépassant deux séries de corrections est une prestation hors forfait.",
    "À défaut de retour dans les trois (3) jours ouvrés, le contenu est réputé livré pour la facturation. Il n’est publié qu’après validation expresse du Client.",
    "Lorsque le contrat est mensuel, les Parties peuvent signer un procès-verbal de réception, selon le modèle joint en annexe.",
  ])]},
  { key: "publication", kind: "article", title: "Publication et accès aux comptes", blocks: [subs([
    "Lorsque la publication est confiée au Prestataire, le Client lui ouvre un accès à ses comptes, de préférence par un rôle nominatif plutôt que par la communication de ses mots de passe.",
    "Le Client demeure seul propriétaire de ses comptes. Le Prestataire n’utilise ces accès que pour l’exécution du contrat.",
    "Le Prestataire transmet, à la demande du Client ou chaque mois, un bref rapport : contenus publiés et principales statistiques disponibles.",
    "Le Prestataire n’est pas responsable des commentaires de tiers ni des restrictions imputables aux plateformes.",
  ])]},
  { key: "prix", kind: "article", title: "Prix", blocks: [
    p("En contrepartie des prestations définies à l’article {{art.prestations}}, le Client verse au Prestataire {{montant.formule}}."),
    { type: "table", id: "prices" },
    subs([
      "Le montant total du contrat est arrêté à la somme de {{montant.total.lettres}} ({{montant.total}}).",
      "Le prix comprend la main-d’œuvre, le matériel nécessaire, la post-production et les déplacements à Djibouti-ville prévus au contrat. Il est ferme pendant la durée convenue.",
      "Les montants s’entendent {{montant.mention}}, conformément à la réglementation fiscale applicable.",
    ]),
  ]},
  { key: "facturation", kind: "article", title: "Facturation et paiement", blocks: [subs([
    "Modalités : {{paiement.modalites}}",
    "Les prestations hors forfait sont facturées séparément, à leur réalisation, et payables à trente (30) jours, sauf accord différent.",
    "Les paiements sont effectués par {{paiement.moyens}}, au nom de {{prestataire.nom}}.",
  ])]},
  { key: "retard", kind: "article", title: "Retard de paiement", blocks: [subs([
    "Tout retard fait l’objet d’une relance écrite. Si la facture reste impayée quinze (15) jours après une mise en demeure restée sans effet, le Prestataire peut suspendre les prestations jusqu’au complet paiement.",
    "Les délais sont prolongés d’une durée égale à la suspension. Les sommes dues restent exigibles.",
    "Un retard supérieur à quarante-cinq (45) jours constitue un manquement grave au sens de l’article {{art.resiliation}}.",
  ])]},
  { key: "obligations_p", kind: "article", title: "Obligations du Prestataire", blocks: [
    p("Le Prestataire s’engage à :"),
    ul([
      "exécuter les prestations avec soin, dans les règles de l’art (obligation de moyens renforcée) ;",
      "mobiliser une équipe et un matériel adaptés ;",
      "désigner un interlocuteur joignable ;",
      "respecter la charte, les messages et la ligne éditoriale communiqués par le Client ;",
      "alerter le Client de toute difficulté susceptible d’affecter l’exécution ;",
      "conserver les fichiers sources pendant la durée du contrat et douze (12) mois après son terme.",
    ]),
  ]},
  { key: "obligations_c", kind: "article", title: "Obligations du Client", blocks: [
    p("Le Client s’engage à :"),
    ul([
      "désigner un référent habilité à valider les contenus : {{referent.nom}}, {{referent.fonction}} ;",
      "communiquer en temps utile le calendrier des interventions et les accès nécessaires ;",
      "fournir sa charte, ses logos et les informations à mettre en valeur, dont il garantit l’exactitude ;",
      "obtenir les autorisations administratives qui relèvent de sa compétence ;",
      "valider ou commenter les contenus dans les délais et régler les factures à leur échéance.",
    ]),
  ]},
  { key: "pi", kind: "article", title: "Propriété intellectuelle et droits d’exploitation", blocks: [subs([
    "Sous réserve du complet paiement, le Prestataire cède au Client, à titre exclusif pour les contenus finalisés, les droits de reproduction, de représentation et d’adaptation, pour les supports convenus, pour le monde entier et pour la durée légale de protection.",
    "Le Prestataire conserve ses méthodes, savoir-faire, modèles génériques et outils. Les musiques et éléments sous licence sont utilisés dans les limites de leurs licences.",
    "Le Prestataire peut citer le Client comme référence. L’usage des contenus dans son portfolio suppose l’accord écrit préalable du Client.",
    "Sur demande écrite, une copie des rushes peut être remise sur un support fourni par le Client.",
  ])]},
  { key: "image", kind: "article", title: "Droit à l’image et protection des personnes", blocks: [subs([
    "Le Prestataire recueille une autorisation écrite auprès de chaque personne filmée de manière identifiable. Pour un mineur, l’autorisation est signée par le représentant légal. Le modèle figure en annexe lorsqu’il est joint au contrat.",
    "Les Parties respectent la dignité et la vie privée des personnes filmées. Toute personne peut demander que son image ne soit plus utilisée pour les contenus à venir.",
  ])]},
  { key: "confidentialite", kind: "article", title: "Confidentialité", blocks: [subs([
    "Chaque Partie garde confidentielles les informations non publiques de l’autre et ne les utilise que pour l’exécution du contrat.",
    "Cette obligation vise aussi l’équipe du Prestataire. Elle dure pendant le contrat et deux (2) ans après son terme.",
  ])]},
  { key: "securite", kind: "article", title: "Sécurité sur site et vols de drone", blocks: [subs([
    "L’équipe respecte les règles de sécurité des sites et porte les équipements requis. Le Client signale les consignes particulières.",
    "Les vols de drone, lorsqu’ils sont prévus, respectent la réglementation djiboutienne et les zones réglementées.",
    "Le pilote reste seul juge de la faisabilité d’un vol. Un vol annulé pour raison météo ou de sécurité est reporté sans frais.",
  ])]},
  { key: "responsabilite", kind: "article", title: "Responsabilité et assurances", blocks: [subs([
    "Chaque Partie répond des dommages directs causés à l’autre par l’inexécution de ses obligations.",
    "Le Client est responsable des informations qu’il fournit ou valide. Le Prestataire est responsable de la qualité technique des contenus.",
    "Sauf faute lourde ou intentionnelle, la responsabilité du Prestataire est limitée aux sommes perçues au titre du contrat au cours des trois (3) derniers mois. Les dommages indirects sont exclus.",
    "Le Prestataire a la garde de son matériel et déclare être couvert, ou s’engage à se couvrir, pour sa responsabilité civile professionnelle.",
  ])]},
  { key: "qualite", kind: "article", title: "Engagement de qualité et pénalités", blocks: [subs([
    "Tout contenu non livré du fait du Prestataire est rattrapé à la période suivante, sans frais.",
    "À défaut, une réfaction peut être convenue d’un commun accord sur la facture suivante. Elle ne s’applique pas si le retard vient du Client ou d’un cas de force majeure.",
    "Le montant des réfactions éventuelles est plafonné à vingt pour cent (20 %) du prix de la période concernée.",
  ])]},
  { key: "force_majeure", kind: "article", title: "Force majeure", blocks: [subs([
    "Aucune Partie n’est responsable d’un manquement dû à un événement extérieur, imprévisible et irrésistible.",
    "La Partie empêchée prévient l’autre sans délai. Si l’empêchement dure plus de trente (30) jours, chaque Partie peut résilier sans indemnité, les prestations réalisées restant dues.",
  ])]},
  { key: "sous_traitance", kind: "article", title: "Sous-traitance et indépendance des Parties", blocks: [subs([
    "Le Prestataire peut s’adjoindre des collaborateurs sous sa responsabilité. Il ne sous-traite pas l’intégralité des prestations sans l’accord écrit du Client.",
    "Les Parties restent indépendantes. Le contrat ne crée aucun lien de subordination.",
  ])]},
  { key: "non_sollicitation", kind: "article", title: "Non-sollicitation", blocks: [
    p("Pendant le contrat et six (6) mois après son terme, chaque Partie s’interdit de débaucher un membre du personnel de l’autre ayant participé à l’exécution, sauf accord écrit."),
  ]},
  { key: "resiliation", kind: "article", title: "Résiliation", blocks: [subs([
    "Pour manquement. Si un manquement grave n’est pas réparé dans les quinze (15) jours d’une mise en demeure écrite, l’autre Partie peut résilier le contrat par écrit.",
    "Anticipée. Chaque Partie peut mettre fin au contrat avec un préavis d’un (1) mois. Les prestations réalisées et le préavis restent dus.",
  ])]},
  { key: "effets", kind: "article", title: "Effets de la fin du contrat", blocks: [
    p("À la fin du contrat, pour quelque cause que ce soit : le Prestataire restitue les accès et remet sous trente (30) jours les contenus finalisés et payés ; le Client règle les sommes restantes ; les stipulations relatives à la propriété intellectuelle, au droit à l’image, à la confidentialité, à la responsabilité et à la non-sollicitation survivent."),
  ]},
  { key: "generales", kind: "article", title: "Dispositions générales", blocks: [subs([
    "Intégralité. Le contrat et ses annexes expriment l’intégralité de l’accord et remplacent les échanges antérieurs.",
    "Modification. Toute modification fait l’objet d’un avenant écrit signé des deux Parties.",
    "Nullité partielle. La nullité d’une clause n’affecte pas les autres.",
    "Non-renonciation. Le fait de ne pas se prévaloir d’un manquement ne vaut pas renonciation.",
    "Cession. Le contrat ne peut être cédé sans l’accord écrit de l’autre Partie.",
    "Notifications. Elles sont faites par écrit aux adresses indiquées en tête des présentes.",
  ])]},
  { key: "droit", kind: "article", title: "Droit applicable et règlement des litiges", blocks: [subs([
    "Le contrat est régi par le droit de la République de Djibouti.",
    "Les Parties recherchent d’abord une solution amiable dans un délai de trente (30) jours.",
    "À défaut, le litige est porté devant les juridictions compétentes de Djibouti.",
  ])]},
  { key: "cdc", kind: "annex", title: "Cahier des charges détaillé", blocks: [
    p("Le présent cahier précise les prestations de l’article {{art.prestations}}. Il est adapté à chaque contrat."),
    { type: "table", id: "custom", headers: ["Prestation", "Précisions"], rows: [
      ["Vidéos", "Durée, formats et habillage convenus avec le Client."],
      ["Posts et visuels", "Formats des réseaux du Client, texte et visuel."],
      ["Couverture d’activité", "Photos et images vidéo, publication après validation."],
      ["Ligne éditoriale", "Les contenus suivent les messages et la charte fournis par le Client."],
    ]},
  ]},
  { key: "tarifs", kind: "annex", title: "Grille tarifaire des prestations hors forfait", blocks: [
    p("Tarifs indicatifs pendant la durée du contrat, pour toute prestation au-delà de l’article {{art.prestations}}, sur devis accepté par écrit."),
    { type: "table", id: "custom", headers: ["Prestation", "Tarif"], rows: [
      ["Vidéo courte supplémentaire", "Sur devis"],
      ["Visuel ou post supplémentaire", "Sur devis"],
      ["Couverture supplémentaire", "Sur devis"],
      ["Déplacement hors Djibouti-ville", "Frais réels sur devis"],
    ]},
  ]},
  { key: "pv", kind: "annex", title: "Procès-verbal de réception", blocks: [
    p("Période : ________________________________    Contrat n° : {{numero}}"),
    { type: "table", id: "custom", headers: ["Prestation", "Prévu", "Livré", "Observations"], rows: [
      ["", "", "", ""],
      ["", "", "", ""],
    ]},
    p("Le Client reconnaît avoir reçu les livrables listés ci-dessus, sous réserve des observations ci-dessus."),
    p("Pour le Client — nom, date, signature : ____________________"),
    p("Pour {{prestataire.nom}} — nom, date, signature : ____________________"),
  ]},
  { key: "image_auto", kind: "annex", title: "Autorisation de droit à l’image", blocks: [
    p("Je soussigné(e) ________________________________ autorise {{client.nom}} ({{client.sigle}}) et son prestataire {{prestataire.nom}} à me filmer, me photographier et enregistrer ma voix dans le cadre du tournage indiqué ci-dessous, et à utiliser ces images, sans contrepartie financière, pour la communication du Client, à Djibouti et à l’international, pour une durée de dix (10) ans."),
    p("Sujet / lieu / date : ________________________________"),
    p("Les images ne pourront pas porter atteinte à ma dignité ou à ma réputation. Je peux demander qu’elles ne soient plus utilisées pour les contenus à venir."),
    p("Fait à ______________  Le ______________  Signature, précédée de « Bon pour accord » :"),
  ]},
];

export const DEFAULT_DEFINITIONS: DefinitionRow[] = [
  { term: "Contenu", definition: "Toute production réalisée par le Prestataire au titre du contrat : vidéo, visuel, photographie, texte ou publication." },
  { term: "Vidéo courte", definition: "Vidéo montée, en général de 30 secondes à 1 minute 30, destinée principalement aux réseaux sociaux." },
  { term: "Post digital", definition: "Publication destinée aux réseaux sociaux, composée d’un visuel et d’un texte." },
  { term: "Activité", definition: "Visite, atelier, cérémonie, tournage, événement ou rencontre organisé ou suivi par le Client." },
  { term: "Rushes", definition: "Fichiers bruts, non montés, issus des prises de vue." },
  { term: "Référent", definition: "Personne désignée par une Partie pour le suivi du contrat." },
  { term: "Jour ouvré", definition: "Jour du dimanche au jeudi, hors jours fériés en République de Djibouti." },
];

export const DEFAULT_SERVICES: ServiceRow[] = [
  { prestation: "Vidéos courtes", contenu: "Témoignages, présentation des activités et des réalisations.", volume: "Selon le forfait mensuel" },
  { prestation: "Posts digitaux", contenu: "Visuels, carrousels et textes rédigés.", volume: "Selon le forfait mensuel" },
  { prestation: "Couverture d’activités", contenu: "Photo et vidéo, puis publication après validation.", volume: "Selon le forfait mensuel" },
];

const byKey = Object.fromEntries(CLAUSES.map((c) => [c.key, c]));

export function sectionsFrom(keys: string[]): Section[] {
  return keys.filter((k) => byKey[k]).map((k) => ({ key: k, kind: byKey[k].kind, title: byKey[k].title, blocks: byKey[k].blocks }));
}

const ALL = CLAUSES.map((c) => c.key);

export const TEMPLATE_SEEDS = [
  {
    name: "Contrat mensuel de production & communication digitale",
    description: "Institutions et entreprises. Articles et annexes du contrat type.",
    title: "Production audiovisuelle\net communication digitale",
    subtitle: "Couverture, production et publication des contenus de {{client.nom}}",
    preamble: "{{client.nom}} ({{client.sigle}}) souhaite confier à un prestataire spécialisé la production et la publication régulières de ses contenus.\n\n{{prestataire.nom}} est une agence de {{prestataire.activite}}, disposant des compétences, des équipes et du matériel nécessaires.\n\nLes Parties se sont rapprochées afin de fixer, par le présent contrat, les conditions de leur collaboration.",
    amountMode: "monthly",
    durationUnit: "months",
    durationValue: 6,
    keys: ALL,
    services: DEFAULT_SERVICES,
    definitions: DEFAULT_DEFINITIONS,
  },
  {
    name: "Contrat mensuel restaurant / commerce",
    description: "Version courte pour un commerce : quelques vidéos par mois.",
    title: "Communication digitale\ndu commerce",
    subtitle: "Production mensuelle de contenus pour {{client.nom}}",
    preamble: "{{client.nom}} souhaite une présence régulière sur ses réseaux. {{prestataire.nom}} réalise les contenus prévus au présent contrat.",
    amountMode: "monthly",
    durationUnit: "months",
    durationValue: 6,
    keys: ["objet", "duree", "prestations", "prix", "facturation", "retard", "obligations_p", "obligations_c", "resiliation", "droit"],
    services: [{ prestation: "Vidéos courtes", contenu: "Présentation des plats, de la salle et de l’ambiance.", volume: "3 par mois" }],
    definitions: DEFAULT_DEFINITIONS.slice(0, 4),
  },
  {
    name: "Contrat de prestation ponctuelle",
    description: "Événement, tournage ou vidéo publicitaire, montant unique.",
    title: "Prestation ponctuelle",
    subtitle: "Couverture ou production convenue avec {{client.nom}}",
    preamble: "Le Client confie au Prestataire une prestation déterminée, décrite à l’article {{art.prestations}}, sans engagement de reconduction.",
    amountMode: "flat",
    durationUnit: "end",
    durationValue: null as number | null,
    keys: ["objet", "prestations", "prix", "facturation", "image", "responsabilite", "droit"],
    services: [{ prestation: "Prestation convenue", contenu: "Tournage, montage et livraison des fichiers validés.", volume: "Forfait unique" }],
    definitions: [],
  },
  {
    name: "Contrat vierge",
    description: "Aucun article. À composer depuis la bibliothèque.",
    title: "Prestation de services",
    subtitle: "",
    preamble: "",
    amountMode: "flat",
    durationUnit: "end",
    durationValue: null as number | null,
    keys: [] as string[],
    services: [] as ServiceRow[],
    definitions: [] as DefinitionRow[],
  },
];
