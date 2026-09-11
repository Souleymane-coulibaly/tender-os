import type { ReactNode } from "react";
import { PageHeader, SectionTabs } from "../../../../components/ui";

const SUB_NAV_ITEMS = [
  { href: "/app/integrations/api-keys", label: "Clés API" },
  { href: "/app/integrations/webhooks", label: "Webhooks" },
  { href: "/app/integrations/connectors", label: "Connecteurs" },
];

/** Section Intégrations (V2 Sprint 16) : en-tête et onglets communs, puis la page de l'onglet —
 *  même anatomie que la fiche appel d'offres (PageHeader puis barre d'onglets). */
export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Paramètres" }, { label: "Intégrations" }]}
        title="Intégrations"
        description="API publique, clés API et webhooks pour connecter TenderOS à vos automatisations (n8n, etc.). Réservé Propriétaire/Administrateur."
      />
      <SectionTabs items={SUB_NAV_ITEMS} ariaLabel="Navigation des intégrations" />
      {children}
    </div>
  );
}
