import { Module } from "@nestjs/common";
import { BillingModule } from "../billing";
import { ChatModule } from "../chat";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { PlatformAdministrationModule } from "../platform-administration";
import { GetOrganizationUsageUseCase } from "./application/use-cases/get-organization-usage.use-case";
import { AdminOrganizationBillingController } from "./interfaces/http/admin-organization-billing.controller";
import { SubscriptionUsageController } from "./interfaces/http/subscription-usage.controller";

/**
 * V2 Sprint 22 (billing, étape 22D) — "Écran Abonnement & utilisation" (mission §50/§51) +
 * "Platform Admin → Organisations → Abonnement & Usage" (mission §46-§49). Module DÉLIBÉRÉMENT
 * séparé de `billing` : la composition read-model a besoin de Chat (usage IA) et Documents
 * (stockage), et `ChatModule`/`DocumentsModule` importent tous deux `TendersModule`, qui importe
 * lui-même `BillingModule` — si CE module vivait dans `billing`, `BillingModule` devrait importer
 * `ChatModule`, fermant un cycle Billing -> Chat -> Tenders -> Billing. Ici, `subscription-usage`
 * importe Billing/Chat/Documents/Memberships SANS jamais être importé en retour par aucun d'eux
 * (module feuille, même rôle que `DashboardModule`, Sprint 15 : "read-model pur composant des use
 * cases déjà exportés par chaque module propriétaire, jamais un accès Prisma cross-module direct").
 *
 * Correctif audit Codex 22E (P1-02, round 3, décision utilisateur) — ce module reste une LECTURE
 * PURE : la vérification de seuil de quota (`CheckQuotaThresholdUseCase`) NE vit PLUS ici et n'est
 * PLUS appelée depuis `GET /billing/usage` — elle vit dans `billing` et est déclenchée depuis le
 * point d'écriture réel de chaque dimension (`CreateMembershipUseCase`/`SendMessageUseCase`/
 * `AddDocumentVersionUseCase`), jamais depuis une lecture.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, PlatformAdministrationModule, BillingModule, ChatModule, DocumentsModule],
  controllers: [SubscriptionUsageController, AdminOrganizationBillingController],
  providers: [GetOrganizationUsageUseCase],
})
export class SubscriptionUsageModule {}
