import { Inject, Injectable, Logger } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SignatureTransactionNotFoundError } from "../../domain/errors";
import type { SignatureTransaction } from "../../domain/signature-transaction.aggregate";
import { toSignatureTransactionSummary, type SignatureTransactionSummary } from "../dtos";
import { SIGNATURE_PROVIDER_PORT, type ProviderTransactionStatus, type SignatureProviderPort } from "../ports/signature-provider.port";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";

export type SyncSignatureTransactionStatusCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; transactionId: string }>;

/**
 * Mission Sprint 8A bis §37/§46 — "simulation locale de signature" : en mode FAKE il n'existe
 * AUCUN webhook réel, donc aucun événement ne fera jamais avancer une transaction SENT/IN_PROGRESS
 * au-delà. Ce use case interroge le prestataire (`getTransaction`, un simple GET, jamais une
 * action qui signe/valide quoi que ce soit côté prestataire) et applique la transition locale
 * correspondante si elle est valide — exactement le même mapping que le webhook, jamais un second
 * chemin de confiance. Utile aussi en mode UNIVERSIGN comme rafraîchissement manuel de secours si
 * un webhook a été manqué (mission "gérer les événements dans le désordre") ; le webhook reste la
 * voie primaire documentée. Une transition impossible (poll répété après un état déjà terminal)
 * est silencieusement ignorée, jamais fatale.
 */
@Injectable()
export class SyncSignatureTransactionStatusUseCase {
  private readonly logger = new Logger(SyncSignatureTransactionStatusUseCase.name);

  constructor(
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(SIGNATURE_PROVIDER_PORT) private readonly signatureProvider: SignatureProviderPort,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SyncSignatureTransactionStatusCommand): Promise<SignatureTransactionSummary> {
    const found = await this.signatureTransactionRepository.findById({ organizationId: command.organizationId, transactionId: command.transactionId });
    if (!found) {
      throw new SignatureTransactionNotFoundError();
    }
    const { transaction } = found;

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: transaction.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ReadExport,
    });

    if (!transaction.providerTransactionId) {
      return toSignatureTransactionSummary(found);
    }

    const result = await this.signatureProvider.getTransaction({ providerTransactionId: transaction.providerTransactionId });
    const occurredAt = this.clock.now();
    try {
      applyProviderStatus(transaction, result.status, occurredAt);
      await this.signatureTransactionRepository.save(transaction);
    } catch (error) {
      this.logger.log(`No-op sync for transaction ${transaction.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    return toSignatureTransactionSummary({ transaction, participants: found.participants, artifacts: found.artifacts });
  }
}

function applyProviderStatus(transaction: SignatureTransaction, status: ProviderTransactionStatus, occurredAt: Date): void {
  switch (status) {
    case "STARTED":
      transaction.markInProgress();
      return;
    case "COMPLETED":
      transaction.markSigned(occurredAt);
      return;
    case "CANCELLED":
      transaction.markCancelled(occurredAt);
      return;
    case "EXPIRED":
      transaction.markExpired(occurredAt);
      return;
    case "DRAFT":
    case "PAUSED":
      // Mission §46 — aucun mapping local pour ces états intermédiaires (pas de transition
      // pertinente côté TenderOS), jamais une transition forcée non documentée.
      return;
  }
}
