import type { ReactNode } from "react";
import { PageHeader, SectionTabs } from "../../../../components/ui";

const SUB_NAV_ITEMS = [
  { href: "/app/ai-configuration/models", label: "Modèles" },
  { href: "/app/ai-configuration/model-preferences", label: "Choix des modèles" },
  { href: "/app/ai-configuration/prompts", label: "Prompts" },
  { href: "/app/ai-configuration/export-templates", label: "Templates d'export" },
  { href: "/app/ai-configuration/document-templates", label: "Templates documentaires" },
  { href: "/app/ai-configuration/deliverable-templates", label: "Templates de mémoire" },
  { href: "/app/ai-configuration/document-themes", label: "Identité documentaire" },
];

/** Section Configuration IA (Sprint 5.2) : en-tête et onglets communs, puis la page de l'onglet —
 *  même anatomie que la fiche appel d'offres (PageHeader puis barre d'onglets). Les pages ne
 *  rendent donc jamais leur propre PageHeader : leur contenu vit dans des `Card`. */
export default function AiConfigurationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Paramètres" }, { label: "Configuration IA" }]}
        title="Configuration IA"
        description="Modèles d'IA, prompts et modèles de documents utilisés par TenderOS."
      />
      <SectionTabs items={SUB_NAV_ITEMS} ariaLabel="Navigation de la configuration IA" />
      {children}
    </div>
  );
}
