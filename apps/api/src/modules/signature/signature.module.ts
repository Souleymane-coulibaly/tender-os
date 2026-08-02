import { Module, type Provider } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { SIGNATURE_CONFIG } from "./application/ports/signature-config.port";
import { SIGNATORY_REPOSITORY } from "./application/ports/signatory.repository";
import { SIGNATURE_PROVIDER_EVENT_REPOSITORY } from "./application/ports/signature-provider-event.repository";
import { SIGNATURE_PROVIDER_PORT } from "./application/ports/signature-provider.port";
import { SIGNATURE_REQUIREMENT_REPOSITORY } from "./application/ports/signature-requirement.repository";
import { SIGNATURE_TRANSACTION_REPOSITORY } from "./application/ports/signature-transaction.repository";
import { SIGNATURE_WEBHOOK_VERIFIER_PORT } from "./application/ports/signature-webhook-verifier.port";
import { ConfirmSignatureRequirementUseCase } from "./application/use-cases/confirm-signature-requirement.use-case";
import { DetectSignatureRequirementUseCase } from "./application/use-cases/detect-signature-requirement.use-case";
import { DownloadSignatureArtifactUseCase } from "./application/use-cases/download-signature-artifact.use-case";
import { GetSignatureTransactionUseCase } from "./application/use-cases/get-signature-transaction.use-case";
import { HandleSignatureProviderEventUseCase } from "./application/use-cases/handle-signature-provider-event.use-case";
import { ImportSignedDocumentUseCase } from "./application/use-cases/import-signed-document.use-case";
import { ListSignatoriesUseCase } from "./application/use-cases/list-signatories.use-case";
import { ListSignatureRequirementsUseCase } from "./application/use-cases/list-signature-requirements.use-case";
import { ListSignatureTransactionsUseCase } from "./application/use-cases/list-signature-transactions.use-case";
import { PrepareSignatureRequestUseCase } from "./application/use-cases/prepare-signature-request.use-case";
import { RegisterSignatoryUseCase } from "./application/use-cases/register-signatory.use-case";
import { RejectSignatureRequirementUseCase } from "./application/use-cases/reject-signature-requirement.use-case";
import { RetrieveSignedArtifactsUseCase } from "./application/use-cases/retrieve-signed-artifacts.use-case";
import { StartSignatureTransactionUseCase } from "./application/use-cases/start-signature-transaction.use-case";
import { SyncSignatureTransactionStatusUseCase } from "./application/use-cases/sync-signature-transaction-status.use-case";
import { VerifySignatoryAuthorityUseCase } from "./application/use-cases/verify-signatory-authority.use-case";
import { VerifySignedDocumentIntegrityUseCase } from "./application/use-cases/verify-signed-document-integrity.use-case";
import { FakeSignatureProviderAdapter } from "./infrastructure/fake-signature-provider.adapter";
import { MisconfiguredSignatureConfig, MisconfiguredSignatureProviderAdapter, MisconfiguredWebhookVerifier } from "./infrastructure/misconfigured-signature-provider.adapter";
import { PrismaSignatoryRepository } from "./infrastructure/prisma-signatory.repository";
import { PrismaSignatureProviderEventRepository } from "./infrastructure/prisma-signature-provider-event.repository";
import { PrismaSignatureRequirementRepository } from "./infrastructure/prisma-signature-requirement.repository";
import { PrismaSignatureTransactionRepository } from "./infrastructure/prisma-signature-transaction.repository";
import { loadSignatureConfig, type LoadedSignatureConfig } from "./infrastructure/signature-config";
import { UniversignSignatureAdapter } from "./infrastructure/universign-signature.adapter";
import { UniversignWebhookVerifier } from "./infrastructure/universign-webhook-verifier";
import { SignatureController } from "./interfaces/http/signature.controller";
import { SignatureWebhookController } from "./interfaces/http/signature-webhook.controller";

/**
 * Résolution PARESSEUSE et UNIQUE de la configuration Universign — appelée une seule fois au
 * bootstrap du module (pas à chaque requête), mais son échec est capturé ici plutôt que propagé :
 * cela permet à l'API de démarrer même sans `SIGNATURE_PROVIDER` défini (mission §37 — ne jamais
 * casser les Sprints 0-7 déjà validés), tout en gardant l'échec disponible pour armer les
 * adaptateurs "misconfigured" que les trois factories ci-dessous lient à la place du vrai
 * provider. Aucune des trois factories ne fait de fallback silencieux vers FAKE : soit la
 * configuration est valide et le VRAI provider choisi est lié, soit elle échoue et TOUT accès
 * réel échoue explicitement au premier appel (`SignatureProviderMisconfiguredError`).
 */
function resolveSignatureConfigOutcome(): { ok: true; config: LoadedSignatureConfig } | { ok: false; reason: string } {
  try {
    return { ok: true, config: loadSignatureConfig() };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "unknown misconfiguration" };
  }
}

const signatureConfigProvider: Provider = {
  provide: SIGNATURE_CONFIG,
  useFactory: () => {
    const outcome = resolveSignatureConfigOutcome();
    return outcome.ok ? { provider: outcome.config.provider } : new MisconfiguredSignatureConfig(outcome.reason);
  },
};

const signatureProviderPortProvider: Provider = {
  provide: SIGNATURE_PROVIDER_PORT,
  useFactory: () => {
    const outcome = resolveSignatureConfigOutcome();
    if (!outcome.ok) {
      return new MisconfiguredSignatureProviderAdapter(outcome.reason);
    }
    if (outcome.config.provider === "FAKE") {
      return new FakeSignatureProviderAdapter();
    }
    return new UniversignSignatureAdapter(outcome.config.universign!);
  },
};

const signatureWebhookVerifierProvider: Provider = {
  provide: SIGNATURE_WEBHOOK_VERIFIER_PORT,
  useFactory: () => {
    const outcome = resolveSignatureConfigOutcome();
    if (!outcome.ok) {
      return new MisconfiguredWebhookVerifier(outcome.reason);
    }
    if (outcome.config.provider === "FAKE") {
      // Mission §45 — en mode FAKE, aucun webhook réel ne sera jamais reçu depuis Universign ;
      // ce vérificateur refuse tout appel plutôt que d'accepter une signature non prouvée.
      return new MisconfiguredWebhookVerifier("SIGNATURE_PROVIDER=FAKE has no real webhook to verify");
    }
    return new UniversignWebhookVerifier(outcome.config.universign!);
  },
};

/**
 * Module Signature (Sprint 8A bis) — importe `TendersModule`/`ClientPortfolioModule`/
 * `ExportModule`/`DocumentsModule` dans UN SEUL sens (lit `GetTenderUseCase`,
 * `AssertClientAccessUseCase`, `GetExportJobUseCase`/`EXPORT_JOB_REPOSITORY`, `StorageProvider`) :
 * aucun de ces modules n'importe jamais Signature en retour. Package (Sprint 8A bis) importera
 * SignatureModule dans ce même sens unique, jamais l'inverse.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, ExportModule, DocumentsModule],
  controllers: [SignatureController, SignatureWebhookController],
  providers: [
    DetectSignatureRequirementUseCase,
    ListSignatureRequirementsUseCase,
    ConfirmSignatureRequirementUseCase,
    RejectSignatureRequirementUseCase,
    RegisterSignatoryUseCase,
    ListSignatoriesUseCase,
    ListSignatureTransactionsUseCase,
    VerifySignatoryAuthorityUseCase,
    PrepareSignatureRequestUseCase,
    StartSignatureTransactionUseCase,
    SyncSignatureTransactionStatusUseCase,
    GetSignatureTransactionUseCase,
    HandleSignatureProviderEventUseCase,
    RetrieveSignedArtifactsUseCase,
    ImportSignedDocumentUseCase,
    VerifySignedDocumentIntegrityUseCase,
    DownloadSignatureArtifactUseCase,

    { provide: SIGNATURE_REQUIREMENT_REPOSITORY, useClass: PrismaSignatureRequirementRepository },
    { provide: SIGNATORY_REPOSITORY, useClass: PrismaSignatoryRepository },
    { provide: SIGNATURE_TRANSACTION_REPOSITORY, useClass: PrismaSignatureTransactionRepository },
    { provide: SIGNATURE_PROVIDER_EVENT_REPOSITORY, useClass: PrismaSignatureProviderEventRepository },

    signatureConfigProvider,
    signatureProviderPortProvider,
    signatureWebhookVerifierProvider,
  ],
  // Réexportés pour permettre à SubmissionPackage (Sprint 8A bis) de vérifier, en LECTURE SEULE,
  // que les exigences de signature d'un Tender sont satisfaites avant de constituer un package —
  // jamais une seconde écriture sur ces tables (même motif que EXPORT_JOB_REPOSITORY par Export).
  exports: [SIGNATURE_REQUIREMENT_REPOSITORY, SIGNATURE_TRANSACTION_REPOSITORY, GetSignatureTransactionUseCase],
})
export class SignatureModule {}
