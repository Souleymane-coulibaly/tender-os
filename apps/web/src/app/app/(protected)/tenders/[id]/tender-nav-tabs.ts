import type { TabItem } from "../../../../../components/ui/tabs-nav";

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — mission §25F.15 "navigation contextuelle cohérente",
 * adaptée STRICTEMENT aux sous-routes réellement existantes sous `tenders/[id]/`. Auparavant
 * seule la page hub (`tenders/[id]/page.tsx`) avait un nav "onglets" (hors-composant, dupliqué) ;
 * les 16 sous-routes elles-mêmes (workspace, assistant, technical-memo, etc.) n'avaient AUCUN moyen
 * de revenir au dossier ou de naviguer vers un autre onglet — corrigé en centralisant la liste ici,
 * réutilisée par toutes les pages du dossier.
 */
export function buildTenderNavTabs(tenderId: string): readonly TabItem[] {
  const base = `/app/tenders/${tenderId}`;
  return [
    { label: "Vue d'ensemble", href: base },
    { label: "Workspace", href: `${base}/workspace` },
    { label: "Assistant IA", href: `${base}/assistant` },
    { label: "Rédaction IA du mémoire", href: `${base}/technical-memo` },
    { label: "Dossier administratif", href: `${base}/administrative-dossier` },
    { label: "Chiffrage", href: `${base}/pricing-schedule` },
    { label: "Pricing", href: `${base}/pricing` },
    { label: "Livrables", href: `${base}/deliverables` },
    { label: "Générations", href: `${base}/generations` },
    { label: "Documents générés", href: `${base}/documents-generated` },
    { label: "Validation", href: `${base}/validation` },
    { label: "Signature", href: `${base}/signature` },
    { label: "Dossier de soumission", href: `${base}/submission-package` },
    { label: "Dépôt", href: `${base}/submission` },
    { label: "Dossier final", href: `${base}/response-package` },
    { label: "Export", href: `${base}/export` },
  ] as const;
}
