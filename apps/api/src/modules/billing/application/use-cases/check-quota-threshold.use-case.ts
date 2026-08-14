import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { UNLIMITED } from "../../domain/quota-type";
import { QUOTA_ALERT_REPOSITORY, type QuotaAlertRepository } from "../ports/quota-alert.repository";
import { GetOrganizationEntitlementsUseCase } from "./get-organization-entitlements.use-case";

const THRESHOLDS = [80, 100] as const;

/** CHAT_AI_DAILY_MAX se remet à zéro chaque jour (mission §44) — periodKey quotidien. USERS_MAX/
 *  STORAGE_GB_MAX sont des quotas persistants — periodKey mensuel (re-alerte au plus une fois par
 *  mois tant que le seuil reste dépassé, jamais un spam à chaque action). */
const DAILY_QUOTA_TYPES = new Set(["CHAT_AI_DAILY_MAX"]);

function dailyPeriodKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function monthlyPeriodKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

export type CheckQuotaThresholdCommand = Readonly<{
  organizationId: string;
  quotaType: "USERS_MAX" | "CHAT_AI_DAILY_MAX" | "STORAGE_GB_MAX";
  /** Usage ACTUEL dans la même unité que la limite déclarée par le catalogue (nombre d'utilisateurs,
   *  nombre de messages Chat IA aujourd'hui, ou Go de stockage — jamais des octets bruts, l'appelant
   *  convertit avant d'appeler). */
  used: number;
  now: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 — round 3, décision utilisateur) —
 * "action métier -> consommation/évolution du quota -> vérification du seuil -> notification si
 * franchissement ; GET /billing/usage -> lecture pure uniquement".
 *
 * Correctif round 4 (auto-correction en cours d'implémentation) — `billing.module.ts` importe déjà
 * `MembershipsModule` (pour ses guards) : `memberships` important `BillingModule` en retour créerait
 * un cycle direct à 2 nœuds. `chat`/`documents` pourraient importer `BillingModule` directement (ils
 * dépendent déjà de `billing` via `TendersModule`), mais par cohérence et pour ne jamais dépendre de
 * l'ordre d'import entre les trois dimensions, LES TROIS déclenchent ce use case via le motif
 * producteur/consommateur Outbox (déjà l'idiome établi du dépôt, voir `NotificationEventConsumersModule`)
 * plutôt qu'un appel direct :
 *  - `memberships` écrit `MembershipCreated` (via `OUTBOX_WRITER`, jamais un import direct de `billing`) ;
 *  - `chat` écrit `ChatMessageSent` (idem) ;
 *  - `documents` écrit `DocumentVersionAdded` (idem).
 * `QuotaThresholdEventConsumersModule` (nouveau module feuille, importé UNIQUEMENT par
 * `OutboxModule.forRoot(...)` dans `app.module.ts`) consomme ces 3 événements et appelle CE use case
 * — il peut sans risque importer `BillingModule` + `MembershipsModule` + `ChatModule` +
 * `DocumentsModule` puisqu'aucun producteur ne dépend jamais de lui en retour.
 *
 * Dédup : `QuotaAlertRepository.recordIfNew` (contrainte unique réelle) — jamais un second moteur
 * de notification, réutilise l'Outbox existant.
 */
@Injectable()
export class CheckQuotaThresholdUseCase {
  constructor(
    private readonly getOrganizationEntitlementsUseCase: GetOrganizationEntitlementsUseCase,
    @Inject(QUOTA_ALERT_REPOSITORY) private readonly quotaAlertRepository: QuotaAlertRepository,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: CheckQuotaThresholdCommand): Promise<void> {
    const entitlements = await this.getOrganizationEntitlementsUseCase.execute(command.organizationId);
    const quotas = entitlements.quotas;
    if (!quotas) return;

    const limit = quotas[command.quotaType];
    if (limit === UNLIMITED || limit <= 0) return;

    const periodKey = DAILY_QUOTA_TYPES.has(command.quotaType) ? dailyPeriodKey(command.now) : monthlyPeriodKey(command.now);
    const percentage = command.used / limit;

    for (const threshold of THRESHOLDS) {
      if (percentage < threshold / 100) continue;
      const isNew = await this.quotaAlertRepository.recordIfNew({ organizationId: command.organizationId, quotaType: command.quotaType, threshold, periodKey });
      if (!isNew) continue;
      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "QuotaThresholdReached",
            aggregateType: "BillingQuotaAlertState",
            aggregateId: `${command.organizationId}:${command.quotaType}:${threshold}:${periodKey}`,
            payload: { quotaType: command.quotaType, threshold, used: command.used, limit },
            occurredAt: command.now,
          },
        ],
      });
    }
  }
}
