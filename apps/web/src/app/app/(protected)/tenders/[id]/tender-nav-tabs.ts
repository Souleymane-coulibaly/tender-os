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
    // Checkpoint 2.1-A5 (wave 2, Tender Workspace) — DCE devient un onglet canonique, à parité avec
    // Administratif/Chiffrage/Mémoire technique qui en disposaient déjà (mission §23, structure
    // cible "Vue d'ensemble / DCE / Analyse / ..."). Positionné juste après Vue d'ensemble, dans
    // l'ordre du flux métier réel (DCE avant Analyse, avant tout le reste).
    { label: "DCE", href: `${base}/dce` },
    // Checkpoint 2.1-A5 (wave 2) — même motif que DCE : mission §23/§28, juste après DCE (l'analyse
    // porte sur les documents DCE déjà importés).
    { label: "Analyse", href: `${base}/analysis` },
    // Checkpoint 2.1-A5 (wave 2) — checklist GÉNÉRIQUE du Tender (mission §29), distincte de la
    // checklist ADMINISTRATIVE (documents DC1/DC2/DC4 requis, sous administrative-dossier/checklist)
    // — deux fonctionnalités réellement différentes (confirmé wave 1), jamais fusionnées.
    { label: "Checklist", href: `${base}/checklist` },
    // « Tender Workspace » désigne l'espace du dossier ENTIER (UBIQUITOUS_LANGUAGE.md) : l'onglet
    // de collaboration (commentaires, tâches, participants) porte donc son propre nom.
    { label: "Collaboration", href: `${base}/workspace` },
    { label: "Assistant IA", href: `${base}/assistant` },
    { label: "Rédaction IA du mémoire", href: `${base}/technical-memo` },
    { label: "Dossier administratif", href: `${base}/administrative-dossier` },
    // Checkpoint 2.1-A5 — "Chiffrage" (BPU/DPGF/DQE, prix final soumis à l'acheteur) et
    // "Estimation & coûts IA" (estimation précoce interne + coût IA réel de TenderOS sur ce Tender,
    // jamais un prix soumis) sont deux fonctionnalités RÉELLEMENT distinctes qui partageaient
    // jusqu'ici le mot "Pricing", ambigu côte à côte — jamais fusionnées, seul le libellé change.
    { label: "Chiffrage", href: `${base}/pricing-schedule` },
    { label: "Estimation & coûts IA", href: `${base}/pricing` },
    { label: "Livrables", href: `${base}/deliverables` },
    { label: "Générations", href: `${base}/generations` },
    { label: "Documents générés", href: `${base}/documents-generated` },
    { label: "Validation", href: `${base}/validation` },
    { label: "Signature", href: `${base}/signature` },
    { label: "Dossier de soumission", href: `${base}/submission-package` },
    // Avant « Dépôt » : l'enregistrement d'un dépôt s'appuie sur le dossier de réponse (il refuse
    // un dépôt dont le ZIP n'a jamais été généré) — l'ordre des onglets suit ce flux.
    { label: "Dossier final", href: `${base}/response-package` },
    { label: "Dépôt", href: `${base}/submission` },
    { label: "Export", href: `${base}/export` },
  ] as const;
}
