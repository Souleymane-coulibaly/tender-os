import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { UnknownProviderTransactionError, WebhookSignatureInvalidError } from "../../domain/errors";
import { SignatureProviderEvent } from "../../domain/signature-provider-event";
import { SIGNATURE_PROVIDER_EVENT_REPOSITORY, type SignatureProviderEventRepository } from "../ports/signature-provider-event.repository";
import { SIGNATURE_TRANSACTION_REPOSITORY, type SignatureTransactionRepository } from "../ports/signature-transaction.repository";
import { SIGNATURE_WEBHOOK_VERIFIER_PORT, type SignatureWebhookVerifierPort } from "../ports/signature-webhook-verifier.port";

export type HandleSignatureProviderEventCommand = Readonly<{ provider: string; rawBody: Buffer; signatureHeader: string }>;

/**
 * Mission Sprint 8A §39/§44/§45 — traite un événement webhook Universign. Ne fait JAMAIS confiance
 * au seul JSON reçu : vérifie d'abord la signature cryptographique réelle, enregistre TOUJOURS
 * l'événement brut (idempotence via la contrainte unique `(provider, providerEventId)`), rapproche
 * la transaction locale, applique la transition d'état si elle est valide — une transition
 * incohérente (événement désordonné/rejoué) est journalisée, jamais fatale (mission "gérer les
 * événements dans le désordre").
 */
@Injectable()
export class HandleSignatureProviderEventUseCase {
  private readonly logger = new Logger(HandleSignatureProviderEventUseCase.name);

  constructor(
    @Inject(SIGNATURE_WEBHOOK_VERIFIER_PORT) private readonly webhookVerifier: SignatureWebhookVerifierPort,
    @Inject(SIGNATURE_PROVIDER_EVENT_REPOSITORY) private readonly providerEventRepository: SignatureProviderEventRepository,
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: HandleSignatureProviderEventCommand): Promise<void> {
    const verification = await this.webhookVerifier.verify({ rawBody: command.rawBody, signatureHeader: command.signatureHeader });
    const payloadHash = createHash("sha256").update(command.rawBody).digest("hex");
    const receivedAt = this.clock.now();

    if (!verification.valid) {
      await this.providerEventRepository.tryRecord(
        SignatureProviderEvent.create({
          id: this.idGenerator.generate(),
          provider: command.provider,
          eventType: "UNKNOWN",
          receivedAt,
          status: "REJECTED",
          payloadHash,
          signatureVerified: false,
          errorCode: "INVALID_SIGNATURE",
          retryCount: 0,
        }),
      );
      throw new WebhookSignatureInvalidError();
    }

    const payload = verification.payload as { id?: string; type?: string; payload?: { object?: { id?: string } } };
    const providerEventId = payload.id;
    const eventType = payload.type ?? "UNKNOWN";
    const providerTransactionId = payload.payload?.object?.id;

    const event = SignatureProviderEvent.create({
      id: this.idGenerator.generate(),
      provider: command.provider,
      providerEventId,
      providerTransactionId,
      eventType,
      receivedAt,
      status: "RECEIVED",
      payloadHash,
      signatureVerified: true,
      retryCount: 0,
    });

    const isNew = await this.providerEventRepository.tryRecord(event);
    if (!isNew) {
      // Mission §45 — webhook dupliqué : idempotent, jamais retraité.
      this.logger.log(`Duplicate webhook event ignored (provider=${command.provider}, providerEventId=${providerEventId}).`);
      return;
    }

    if (!providerTransactionId) {
      await this.providerEventRepository.markRejected({ id: event.id, errorCode: "MISSING_TRANSACTION_ID" });
      return;
    }

    const found = await this.signatureTransactionRepository.findByProviderTransactionId({ provider: command.provider, providerTransactionId });
    if (!found) {
      await this.providerEventRepository.markRejected({ id: event.id, errorCode: "UNKNOWN_TRANSACTION" });
      throw new UnknownProviderTransactionError();
    }

    const { transaction } = found;
    try {
      applyEventToTransaction(transaction, eventType, this.clock.now());
      await this.signatureTransactionRepository.save(transaction);
      await this.providerEventRepository.markProcessed({ id: event.id, occurredAt: this.clock.now() });
    } catch (error) {
      this.logger.warn(`Could not apply event ${eventType} to transaction ${transaction.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      await this.providerEventRepository.markRejected({ id: event.id, errorCode: "INVALID_TRANSITION" });
    }
  }
}

function applyEventToTransaction(transaction: { markInProgress(): void; markSigned(d: Date): void; markCancelled(d: Date): void; markExpired(d: Date): void }, eventType: string, occurredAt: Date): void {
  switch (eventType) {
    case "transaction.lifecycle.started":
      transaction.markInProgress();
      return;
    case "transaction.lifecycle.completed":
      transaction.markSigned(occurredAt);
      return;
    case "transaction.lifecycle.cancelled":
      transaction.markCancelled(occurredAt);
      return;
    case "transaction.lifecycle.expired":
      transaction.markExpired(occurredAt);
      return;
    default:
      // Mission §45/§76 — types non mappés (ex. transaction.lifecycle.created/.paused,
      // action.*) : reçus et journalisés, jamais une transition forcée non documentée avec
      // certitude (voir rapport §Z, refus déclaré du côté "refusé" détaillé — non confirmable
      // sans accès réel Universign).
      return;
  }
}
