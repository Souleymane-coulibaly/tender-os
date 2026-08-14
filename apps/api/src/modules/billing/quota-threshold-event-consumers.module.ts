import { Module } from "@nestjs/common";
import { BillingModule } from "./billing.module";
import { ChatModule } from "../chat";
import { DocumentsModule } from "../documents";
import { MembershipsModule } from "../memberships";
import {
  ChatMessageSentQuotaCheckOutboxHandler,
  DocumentVersionAddedQuotaCheckOutboxHandler,
  MembershipCreatedQuotaCheckOutboxHandler,
  SubscriptionPlanChangedQuotaRecheckOutboxHandler,
} from "./infrastructure/outbox-handlers/quota-threshold-event.outbox-handlers";

/** Les 4 handlers Outbox réellement enregistrés pour ce module (mission §43/§44/§45, correctif
 *  audit Codex P1-02 round 4). `MembershipCreated`/`ChatMessageSent`/`DocumentVersionAdded` sont
 *  écrits respectivement par `memberships`/`chat`/`documents` depuis Sprint 22E — aucun handler
 *  n'était enregistré dessus jusqu'ici, donc aucun risque de collision avec
 *  `NOTIFICATION_OUTBOX_HANDLERS`/`INTEGRATION_OUTBOX_HANDLERS` (`CompositeOutboxEventDispatcher`
 *  n'admet qu'UN SEUL handler par `eventType`, voir `outbox/application/ports/outbox-event-handler.ts`).
 *  `SubscriptionPlanChangedQuotaRecheck` (décision utilisateur "éventuellement changement de plan")
 *  est un eventType DISTINCT de `SubscriptionPlanChanged` (déjà consommé par
 *  `SubscriptionPlanChangedNotificationOutboxHandler` dans `notifications`) — précisément pour
 *  éviter cette même collision. */
export const QUOTA_THRESHOLD_OUTBOX_HANDLERS = [
  MembershipCreatedQuotaCheckOutboxHandler,
  ChatMessageSentQuotaCheckOutboxHandler,
  DocumentVersionAddedQuotaCheckOutboxHandler,
  SubscriptionPlanChangedQuotaRecheckOutboxHandler,
];

/**
 * V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 — round 4) — module feuille MINIMAL,
 * même motif que `NotificationEventConsumersModule` (Sprint 18) et `IntegrationEventConsumersModule`
 * (Sprint 16) : uniquement pour être importé par `OutboxModule.forRoot(...)` (app.module.ts) sans
 * créer de cycle. `billing.module.ts` importe déjà `MembershipsModule` (pour ses guards) — importer
 * `BillingModule` EN RETOUR depuis `memberships`/`chat`/`documents` créerait un cycle ; CE module-ci,
 * lui, n'est jamais importé par aucun des quatre, donc peut sans risque tous les importer.
 *
 * IMPORTANT (piège réel rencontré en l'écrivant) : ce module N'EST JAMAIS réexporté par
 * `billing/index.ts` — `ChatModule`/`DocumentsModule` importent tous deux `TendersModule`, qui
 * importe `BillingModule` via CE BARREL (`"../billing"`) ; le réexporter là refermerait un cycle de
 * modules au niveau du graphe de fichiers (pas seulement Nest DI) :
 * `billing/index.ts -> quota-threshold-event-consumers.module.ts -> chat -> tenders -> billing/index.ts`.
 * `app.module.ts` importe donc CE fichier directement (`./modules/billing/quota-threshold-event-consumers.module`),
 * jamais via `./modules/billing`.
 */
@Module({
  imports: [BillingModule, MembershipsModule, ChatModule, DocumentsModule],
  providers: [...QUOTA_THRESHOLD_OUTBOX_HANDLERS],
  // Correctif (bug réel trouvé en exécutant la suite réelle, pas seulement en compilant) — les
  // handlers ci-dessus sont instanciés comme providers de `OutboxModule` LUI-MÊME (voir
  // `OutboxModule.forRoot`, `providers: [...BASE_PROVIDERS, ...input.handlers, ...]`), jamais de
  // CE module : Nest résout donc leurs dépendances de constructeur contre ce que CE module
  // EXPORTE, pas ce qu'il importe simplement. `CountActiveMembersUseCase`/
  // `CountTodayChatUsageForOrganizationUseCase`/`GetOrganizationStorageUsageUseCase`/
  // `CheckQuotaThresholdUseCase` restent des providers de leurs modules propriétaires respectifs —
  // il faut donc réexporter ces quatre modules entiers (même motif que `MembershipsModule`
  // réexportant `OrganizationsModule`), jamais dupliquer leurs providers ici.
  exports: [BillingModule, MembershipsModule, ChatModule, DocumentsModule, ...QUOTA_THRESHOLD_OUTBOX_HANDLERS],
})
export class QuotaThresholdEventConsumersModule {}
