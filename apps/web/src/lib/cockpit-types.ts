import type { AlertTone } from "../components/ui/alert";
import type { BadgeTone } from "../components/ui/badge";
/** Mission Sprint 8A.2 — Cockpit Bid Manager : synthèse calculée EXCLUSIVEMENT côté backend
 *  (`GetTenderCockpitUseCase`), jamais reconstruite ici — ce fichier ne porte que les libellés
 *  français associés aux codes stables renvoyés par l'API. */

export type CockpitModuleSummary = {
  key: string;
  status: string;
  count?: number;
  total?: number;
};

export type CockpitAlert = {
  level: string;
  code: string;
};

export type TenderCockpit = {
  tenderId: string;
  currentStep: string;
  nextAction: string;
  modules: CockpitModuleSummary[];
  alerts: CockpitAlert[];
};

export const COCKPIT_MODULE_LABELS: Record<string, string> = {
  DCE: "Documents & DCE",
  ANALYSIS: "Analyse IA",
  // Checkpoint 2.1-A5 — distinct de "Chiffrage" (BPU/DPGF/DQE, prix final soumis), voir
  // tender-nav-tabs.ts. Ce module est l'estimation précoce + coût IA réel, jamais un prix soumis.
  PRICING: "Estimation & coûts IA",
  DELIVERABLES: "Livrables",
  EXPORT: "Export",
  VALIDATION: "Validation",
  SIGNATURE: "Signature",
  PACKAGE: "Dossier de soumission",
};

export const COCKPIT_MODULE_ROUTES: Record<string, string | undefined> = {
  DCE: undefined, // section sur la page Tender elle-même, jamais une sous-route dédiée
  ANALYSIS: undefined,
  PRICING: "pricing",
  DELIVERABLES: "deliverables",
  EXPORT: "export",
  VALIDATION: "validation",
  SIGNATURE: "signature",
  PACKAGE: "submission-package",
};

export const COCKPIT_MODULE_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Pas commencé",
  IN_PROGRESS: "En cours",
  ATTENTION: "À vérifier",
  DONE: "Terminé",
  NOT_APPLICABLE: "Non concerné",
};

/**
 * Design System — renvoie desormais un TON semantique et non des classes Tailwind ecrites a la
 * main. `Badge` porte la correspondance ton -> couleur ; en garder une seconde ici reviendrait a
 * maintenir deux palettes qui divergeraient au premier ajustement. Valeurs visuelles identiques.
 */
export function cockpitModuleStatusTone(status: string): BadgeTone {
  switch (status) {
    case "DONE":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "ATTENTION":
      return "warning";
    default:
      return "neutral";
  }
}

export const COCKPIT_STEP_LABELS: Record<string, string> = {
  DISCOVERY: "Découverte du dossier",
  ANALYSIS: "Analyse IA",
  PREPARATION: "Préparation de la réponse",
  VALIDATION: "Validation finale",
  SIGNATURE: "Signature",
  SUBMISSION: "Constitution du dossier",
  DONE: "Dossier prêt",
};

export const COCKPIT_NEXT_ACTION_LABELS: Record<string, string> = {
  INITIALIZE_DCE: "Initialiser le DCE",
  IMPORT_DOCUMENTS: "Importer les documents du DCE",
  RUN_ANALYSIS: "Lancer l'analyse IA",
  COMPLETE_DELIVERABLES: "Compléter les livrables",
  CREATE_PRICING_ESTIMATE: "Créer une estimation de coût",
  PREVIEW_EXPORT: "Générer un aperçu d'export",
  RUN_VALIDATION: "Lancer la validation finale",
  RESOLVE_BLOCKING_ISSUES: "Résoudre les blocages de validation",
  APPROVE_FINAL_VERSION: "Approuver la version finale",
  START_SIGNATURE: "Démarrer la signature",
  FOLLOW_SIGNATURE: "Suivre la signature en cours",
  CREATE_PACKAGE: "Constituer le dossier de soumission",
  NONE: "Aucune action requise",
};

export const COCKPIT_ALERT_LABELS: Record<string, string> = {
  DCE_EMPTY: "Le DCE est initialisé mais aucun document n'a encore été importé.",
  DELIVERABLE_BLOCKED: "Au moins un livrable est bloqué et doit être débloqué.",
  VALIDATION_OR_SIGNATURE_BLOCKED: "Des blocages de validation ou de signature doivent être résolus.",
  VALIDATION_WARNINGS: "La dernière validation contient des avertissements.",
};

/** Design System — meme raison que ci-dessus : `Alert` porte la palette, pas ce module. */
export function cockpitAlertTone(level: string): AlertTone {
  switch (level) {
    case "BLOCKER":
      return "danger";
    case "WARNING":
      return "warning";
    default:
      return "info";
  }
}
