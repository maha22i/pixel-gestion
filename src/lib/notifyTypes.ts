/** Types de notifications réellement envoyés par l'application, regroupés pour l'affichage. */
export const NOTIFY_GROUPS = [
  {
    label: "Tâches",
    items: [
      { key: "assign", label: "Une tâche m'est assignée" },
      { key: "mention", label: "Quelqu'un me mentionne (@Nom)" },
      { key: "comment", label: "Nouveau commentaire sur mes tâches" },
      { key: "review", label: "Tâche à valider / validée / renvoyée" },
      { key: "blocked", label: "Une tâche est bloquée" },
    ],
  },
  {
    label: "Pointage",
    items: [
      { key: "presence_refuse", label: "Pointage refusé" },
      { key: "presence_telephone", label: "Demande de nouveau téléphone" },
      { key: "presence_absent", label: "Absence non justifiée" },
      { key: "presence_depart", label: "Départ oublié" },
    ],
  },
  {
    label: "Ressources humaines",
    items: [
      { key: "rh_demande", label: "Nouvelle demande de congé ou d'absence (responsables)" },
      { key: "rh_decision", label: "Réponse à mes demandes de congé" },
    ],
  },
  {
    label: "Matériel",
    items: [{ key: "equipment", label: "Retour de matériel en retard" }],
  },
] as const;

export const NOTIFY_KEYS: string[] = NOTIFY_GROUPS.flatMap((g) => g.items.map((i) => i.key));
