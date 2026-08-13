import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OrganizationsModule } from "../organizations";
import { PLATFORM_ADMINISTRATOR_REPOSITORY } from "./application/ports/platform-administrator.repository";
import { PLATFORM_AUDIT_LOG_READER, PLATFORM_AUDIT_LOG_WRITER } from "./application/ports/platform-audit-log.port";
import { PLATFORM_DEAD_LETTER_EVENT_READER } from "./application/ports/platform-dead-letter-event.port";
import { GetPlatformMetricsUseCase } from "./application/use-cases/get-platform-metrics.use-case";
import { GetPlatformOrganizationUseCase } from "./application/use-cases/get-platform-organization.use-case";
import { ListPlatformAuditLogsUseCase } from "./application/use-cases/list-platform-audit-logs.use-case";
import { ListPlatformDeadLetterEventsUseCase } from "./application/use-cases/list-platform-dead-letter-events.use-case";
import { ListPlatformOrganizationsUseCase } from "./application/use-cases/list-platform-organizations.use-case";
import { ListPlatformUsersUseCase } from "./application/use-cases/list-platform-users.use-case";
import { ReactivatePlatformOrganizationUseCase } from "./application/use-cases/reactivate-platform-organization.use-case";
import { SuspendPlatformOrganizationUseCase } from "./application/use-cases/suspend-platform-organization.use-case";
import { PrismaPlatformAdministratorRepository } from "./infrastructure/prisma-platform-administrator.repository";
import { PrismaPlatformAuditLog } from "./infrastructure/prisma-platform-audit-log";
import { PrismaPlatformDeadLetterEvents } from "./infrastructure/prisma-platform-dead-letter-event";
import { PlatformAccessGuard } from "./interfaces/http/platform-access.guard";
import { PlatformAdminController } from "./interfaces/http/platform-admin.controller";

@Module({
  imports: [IdentityModule, OrganizationsModule, MembershipsModule],
  controllers: [PlatformAdminController],
  providers: [
    ListPlatformOrganizationsUseCase,
    GetPlatformOrganizationUseCase,
    SuspendPlatformOrganizationUseCase,
    ReactivatePlatformOrganizationUseCase,
    ListPlatformUsersUseCase,
    ListPlatformAuditLogsUseCase,
    GetPlatformMetricsUseCase,
    ListPlatformDeadLetterEventsUseCase,
    PlatformAccessGuard,
    { provide: PLATFORM_ADMINISTRATOR_REPOSITORY, useClass: PrismaPlatformAdministratorRepository },
    PrismaPlatformAuditLog,
    { provide: PLATFORM_AUDIT_LOG_WRITER, useExisting: PrismaPlatformAuditLog },
    { provide: PLATFORM_AUDIT_LOG_READER, useExisting: PrismaPlatformAuditLog },
    PrismaPlatformDeadLetterEvents,
    { provide: PLATFORM_DEAD_LETTER_EVENT_READER, useExisting: PrismaPlatformDeadLetterEvents },
  ],
  // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-02) — réexporté pour que `billing`
  // puisse protéger ses propres endpoints d'overrides d'entitlement par le MÊME mécanisme Platform
  // Admin, jamais une seconde implémentation dupliquée (même motif que `AuthenticatedGuard` réexporté
  // par `identity`). `PLATFORM_ADMINISTRATOR_REPOSITORY` doit être réexporté AUSSI : Nest résout les
  // dépendances d'un provider réutilisé (`PlatformAccessGuard`) via le graphe du module CONSOMMATEUR
  // (`BillingModule`), pas uniquement celui d'origine — exporter le seul guard sans sa propre
  // dépendance échoue au bootstrap ("Nest can't resolve dependencies of the PlatformAccessGuard").
  exports: [PlatformAccessGuard, PLATFORM_ADMINISTRATOR_REPOSITORY],
})
export class PlatformAdministrationModule {}
