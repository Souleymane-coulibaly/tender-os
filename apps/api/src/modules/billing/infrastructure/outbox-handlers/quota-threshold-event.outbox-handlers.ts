import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import { CountActiveMembersUseCase } from "../../../memberships";
import { CountTodayChatUsageForOrganizationUseCase } from "../../../chat";
import { GetOrganizationStorageUsageUseCase } from "../../../documents";
import { CheckQuotaThresholdUseCase } from "../../application/use-cases/check-quota-threshold.use-case";

const BYTES_PER_GB = 1024 * 1024 * 1024;

function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 — round 4) — 3 handlers Outbox,
 * un par dimension de quota, chacun déclenché par l'événement écrit AU POINT D'ÉCRITURE RÉEL du
 * module producteur (jamais par une lecture `GET /billing/usage`, voir `CheckQuotaThresholdUseCase`).
 * Chaque handler recompte l'usage ACTUEL via le use case déjà exporté en lecture seule par son
 * module propriétaire (même motif que `GetOrganizationUsageUseCase`) plutôt que d'incrémenter un
 * compteur dénormalisé — `CheckQuotaThresholdUseCase`/`QuotaAlertRepository.recordIfNew` restent
 * seuls responsables de la déduplication.
 */
@Injectable()
export class MembershipCreatedQuotaCheckOutboxHandler implements OutboxEventHandler {
  readonly eventType = "MembershipCreated";
  constructor(
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    private readonly checkQuotaThresholdUseCase: CheckQuotaThresholdUseCase,
  ) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const used = await this.countActiveMembersUseCase.execute({ organizationId: event.organizationId });
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "USERS_MAX", used, now: event.occurredAt });
  }
}

@Injectable()
export class ChatMessageSentQuotaCheckOutboxHandler implements OutboxEventHandler {
  readonly eventType = "ChatMessageSent";
  constructor(
    private readonly countTodayChatUsageForOrganizationUseCase: CountTodayChatUsageForOrganizationUseCase,
    private readonly checkQuotaThresholdUseCase: CheckQuotaThresholdUseCase,
  ) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const used = await this.countTodayChatUsageForOrganizationUseCase.execute({
      organizationId: event.organizationId,
      since: startOfDayUtc(event.occurredAt),
    });
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "CHAT_AI_DAILY_MAX", used, now: event.occurredAt });
  }
}

@Injectable()
export class DocumentVersionAddedQuotaCheckOutboxHandler implements OutboxEventHandler {
  readonly eventType = "DocumentVersionAdded";
  constructor(
    private readonly getOrganizationStorageUsageUseCase: GetOrganizationStorageUsageUseCase,
    private readonly checkQuotaThresholdUseCase: CheckQuotaThresholdUseCase,
  ) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const usedBytes = await this.getOrganizationStorageUsageUseCase.execute(event.organizationId);
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "STORAGE_GB_MAX", used: usedBytes / BYTES_PER_GB, now: event.occurredAt });
  }
}

/** V2 Sprint 22 (billing, étape 22E, décision utilisateur "éventuellement changement de plan") —
 *  un changement de PALIER change la LIMITE (dénominateur), jamais l'usage lui-même : peut à lui
 *  seul faire franchir un seuil sans qu'aucune action d'usage n'ait eu lieu (ex. downgrade avec des
 *  utilisateurs déjà actifs au-delà de la nouvelle limite) — les 3 dimensions sont donc revérifiées
 *  ensemble ici, jamais une seule. `eventType` DISTINCT de `SubscriptionPlanChanged` (déjà consommé
 *  par `SubscriptionPlanChangedNotificationOutboxHandler`, voir `assign-subscription.use-case.ts`
 *  pour le pourquoi). */
@Injectable()
export class SubscriptionPlanChangedQuotaRecheckOutboxHandler implements OutboxEventHandler {
  readonly eventType = "SubscriptionPlanChangedQuotaRecheck";
  constructor(
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    private readonly countTodayChatUsageForOrganizationUseCase: CountTodayChatUsageForOrganizationUseCase,
    private readonly getOrganizationStorageUsageUseCase: GetOrganizationStorageUsageUseCase,
    private readonly checkQuotaThresholdUseCase: CheckQuotaThresholdUseCase,
  ) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const [activeUsers, chatMessagesToday, storageBytesUsed] = await Promise.all([
      this.countActiveMembersUseCase.execute({ organizationId: event.organizationId }),
      this.countTodayChatUsageForOrganizationUseCase.execute({ organizationId: event.organizationId, since: startOfDayUtc(event.occurredAt) }),
      this.getOrganizationStorageUsageUseCase.execute(event.organizationId),
    ]);
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "USERS_MAX", used: activeUsers, now: event.occurredAt });
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "CHAT_AI_DAILY_MAX", used: chatMessagesToday, now: event.occurredAt });
    await this.checkQuotaThresholdUseCase.execute({ organizationId: event.organizationId, quotaType: "STORAGE_GB_MAX", used: storageBytesUsed / BYTES_PER_GB, now: event.occurredAt });
  }
}
