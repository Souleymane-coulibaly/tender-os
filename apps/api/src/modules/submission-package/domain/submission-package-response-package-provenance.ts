/**
 * Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — provenance MULTI-LOT du wrapper (mission implicite
 * du fix : "réutiliser le SOT existant, jamais un second moteur"), mirroir exact de
 * `submission/domain/submission-response-package-provenance.ts` (`TenderSubmission`, F2.3). Valeur
 * pure, jamais un agrégat/entité — une ligne par lot REQUIS dont le dossier de réponse V2 a été
 * résolu au moment de la création du wrapper. Réservée au mode LOT : le mode GLOBAL continue
 * d'utiliser les 3 colonnes scalaires F4.1 sur `SubmissionPackage`, jamais les deux à la fois.
 */
export type SubmissionPackageResponsePackageProvenance = Readonly<{
  id: string;
  submissionPackageId: string;
  lotId: string;
  responsePackageVersionId: string;
  responsePackageArtifactId: string;
  artifactChecksum: string;
  createdAt: Date;
}>;
