export { SignatureModule } from "./signature.module";

// Réexportés pour permettre à SubmissionPackage (Sprint 8A bis) de vérifier, en LECTURE SEULE,
// que les exigences de signature d'un Tender sont satisfaites (toutes CONFIRMED/NOT_REQUIRED) et
// que les transactions associées sont VERIFIED avant de constituer un package — jamais une
// seconde écriture sur ces tables (même motif que le réexport de `EXPORT_JOB_REPOSITORY` par
// Export pour Validation/Signature).
export { SIGNATURE_REQUIREMENT_REPOSITORY } from "./application/ports/signature-requirement.repository";
export type { SignatureRequirementRepository } from "./application/ports/signature-requirement.repository";
export { SIGNATURE_TRANSACTION_REPOSITORY } from "./application/ports/signature-transaction.repository";
export type { SignatureTransactionRepository, SignatureTransactionWithDetails } from "./application/ports/signature-transaction.repository";

export { GetSignatureTransactionUseCase } from "./application/use-cases/get-signature-transaction.use-case";
export { DownloadSignatureArtifactUseCase } from "./application/use-cases/download-signature-artifact.use-case";
// Réexportés pour Sprint 8A.1 (Deliverables) — vue LECTURE SEULE "Documents à signer" (mission
// §14), jamais une seconde écriture ni une intégration Universign réelle redéveloppée.
export { ListSignatureRequirementsUseCase } from "./application/use-cases/list-signature-requirements.use-case";
export type { ListSignatureRequirementsQuery } from "./application/use-cases/list-signature-requirements.use-case";
export { ListSignatureTransactionsUseCase } from "./application/use-cases/list-signature-transactions.use-case";
export type { ListSignatureTransactionsQuery } from "./application/use-cases/list-signature-transactions.use-case";

export type { SignatureTransactionSummary, SignatorySummary, SignatureRequirementSummary, SignatureArtifactSummary } from "./application/dtos";

export { SignatureRequirementStatus } from "./domain/signature-requirement";
export { SignatureTransactionStatus, isTerminalSignatureTransactionStatus } from "./domain/signature-transaction-status";
export { SIGNATURE_PROVIDER } from "./domain/signature-level";
export type { SignatureProviderName } from "./domain/signature-level";
