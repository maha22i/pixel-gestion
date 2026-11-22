import { requireUser, can } from "@/lib/auth";
import { roleLabel } from "@/lib/modules";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { Bell } from "@/components/Bell";
import { MobileTables } from "@/components/MobileTables";
import { logoutAction } from "../login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const all = [
    { group: "moi" as const, href: "/pointer", label: "Pointer", icon: "pointer" as const, m: "presences" as const },
    { group: "moi" as const, href: "/ma-journee", label: "Ma journée", icon: "journee" as const, m: "taches" as const },
    { group: "pilotage" as const, href: "/", label: "Tableau de bord", icon: "dashboard" as const, m: "tableau_de_bord" as const },
    { group: "activite" as const, href: "/clients", label: "Clients", icon: "clients" as const, m: "clients" as const },
    { group: "activite" as const, href: "/projets", label: "Projets", icon: "projets" as const, m: "projets" as const },
    { group: "activite" as const, href: "/taches", label: "Tâches", icon: "taches" as const, m: "taches" as const },
    { group: "pilotage" as const, href: "/planning", label: "Planning", icon: "planning" as const, m: "planning" as const },
    { group: "pilotage" as const, href: "/suivi", label: "Suivi de l'équipe", icon: "suivi" as const, m: "suivi_equipe" as const },
    { group: "pilotage" as const, href: "/presences", label: "Présences", icon: "presences" as const, m: "presences" as const, write: true },
    { group: "activite" as const, href: "/materiel", label: "Matériel", icon: "materiel" as const, m: "materiel" as const },
    { group: "activite" as const, href: "/verification", label: "Vérification", icon: "verification" as const, m: "materiel" as const },
    { group: "finance" as const, href: "/catalogue", label: "Catalogue", icon: "catalogue" as const, m: "catalogue" as const },
    { group: "finance" as const, href: "/devis", label: "Devis", icon: "devis" as const, m: "devis" as const },
    { group: "finance" as const, href: "/factures", label: "Factures", icon: "factures" as const, m: "factures" as const },
    { group: "finance" as const, href: "/contrats", label: "Contrats", icon: "contrats" as const, m: "contrats" as const },
    { group: "finance" as const, href: "/paiements", label: "Paiements", icon: "paiements" as const, m: "paiements" as const },
    { group: "finance" as const, href: "/depenses", label: "Dépenses", icon: "depenses" as const, m: "depenses" as const },
  ];
  const items = all.filter((i) => can(user, i.m) && (!i.write || can(user, i.m, "write"))).map(({ group, href, label, icon }) => ({ group, href, label, icon }));
  const adminItems =
    user.role === "admin"
      ? [
          { href: "/utilisateurs", label: "Utilisateurs & droits", icon: "users" as const },
          { href: "/parametres", label: "Paramètres", icon: "settings" as const },
        ]
      : [];
  return (
    <div className="min-h-dvh lg:flex">
      <MobileTables />
      <Sidebar
        items={items}
        adminItems={adminItems}
        userName={user.name}
        roleLabel={roleLabel(user.role)}
        logout={logoutAction}
        bell={<Bell userId={user.id} tone="light" />}
      />
      <div className="min-w-0 flex-1 overflow-x-clip">
        <TopBar userName={user.name} roleLabel={roleLabel(user.role)} logout={logoutAction} bell={<Bell userId={user.id} />} />
        <main className="relative px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pt-6 lg:px-10">
          <div className="mx-auto w-full min-w-0 max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
