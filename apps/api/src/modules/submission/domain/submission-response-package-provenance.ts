/**
 * Checkpoint TENDEROS-2.1-P2.2-F2.3 — provenance MULTI-LOT (mission §8/§13), ADDITIVE au mode
 * global existant (`TenderSubmission.responsePackageVersionId/…`, inchangé). Valeur pure, jamais un
 * agrégat/entité (aucun comportement, aucune transition d'état) — une ligne par lot REQUIS dont le
 * dossier de réponse a été résolu au moment du dépôt. Dénormalisée en LECTURE SEULE depuis
 * `response-package`/`tenders` (modules distincts), jamais une FK stricte vers eux (mission §9,
 * même discipline que les 3 colonnes scalaires F2).
 */
export type SubmissionResponsePackageProvenance = Readonly<{
  id: string;
  submissionId: string;
  lotId: string;
  responsePackageVersionId: string;
  responsePackageArtifactId: string;
  artifactChecksum: string;
  createdAt: Date;
}>;
