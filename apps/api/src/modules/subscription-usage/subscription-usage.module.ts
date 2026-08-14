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
 */
@Module({
  imports: [IdentityModule, MembershipsModule, PlatformAdministrationModule, BillingModule, ChatModule, DocumentsModule],
  controllers: [SubscriptionUsageController, AdminOrganizationBillingController],
  providers: [GetOrganizationUsageUseCase],
})
export class SubscriptionUsageModule {}
