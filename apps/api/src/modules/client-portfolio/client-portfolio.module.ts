import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { CLIENT_ACCOUNT_REPOSITORY } from "./application/ports/client-account.repository";
import { CLIENT_ASSIGNMENT_REPOSITORY } from "./application/ports/client-assignment.repository";
import { ArchiveClientAccountUseCase } from "./application/use-cases/archive-client-account.use-case";
import { AssertClientAccessUseCase } from "./application/use-cases/assert-client-access.use-case";
import { AssignUserToClientUseCase } from "./application/use-cases/assign-user-to-client.use-case";
import { CreateClientAccountUseCase } from "./application/use-cases/create-client-account.use-case";
import { DeleteClientAccountUseCase } from "./application/use-cases/delete-client-account.use-case";
import { GetClientAccountUseCase } from "./application/use-cases/get-client-account.use-case";
import { ListAccessibleClientsUseCase } from "./application/use-cases/list-accessible-clients.use-case";
import { ListClientAccountsUseCase } from "./application/use-cases/list-client-accounts.use-case";
import { ListClientAssignmentsUseCase } from "./application/use-cases/list-client-assignments.use-case";
import { RemoveClientAssignmentUseCase } from "./application/use-cases/remove-client-assignment.use-case";
import { RestoreClientAccountUseCase } from "./application/use-cases/restore-client-account.use-case";
import { UpdateClientAccountUseCase } from "./application/use-cases/update-client-account.use-case";
import { UpdateClientAssignmentUseCase } from "./application/use-cases/update-client-assignment.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaClientAccountRepository } from "./infrastructure/prisma-client-account.repository";
import { PrismaClientAssignmentRepository } from "./infrastructure/prisma-client-assignment.repository";
import { ClientPortfolioController } from "./interfaces/http/client-portfolio.controller";

/**
 * Module Client Portfolio (mission Sprint 5.1) — `AssertClientAccessUseCase` et
 * `ListAccessibleClientsUseCase` sont exportés pour être réutilisés par Tenders/Documents/Analysis/
 * Knowledge Base (mission §"réutilisable par... jamais recopiée dans un contrôleur") : dépendance
 * UNIQUEMENT dans ce sens (Tenders/Documents/Analysis/Knowledge Base → Client Portfolio), jamais
 * l'inverse — ce module n'importe aucun de ces modules, évitant tout risque de dépendance
 * circulaire (`forwardRef`).
 */
@Module({
  imports: [IdentityModule, MembershipsModule],
  controllers: [ClientPortfolioController],
  providers: [
    CreateClientAccountUseCase,
    GetClientAccountUseCase,
    ListClientAccountsUseCase,
    UpdateClientAccountUseCase,
    ArchiveClientAccountUseCase,
    RestoreClientAccountUseCase,
    DeleteClientAccountUseCase,
    AssignUserToClientUseCase,
    UpdateClientAssignmentUseCase,
    RemoveClientAssignmentUseCase,
    ListClientAssignmentsUseCase,
    ListAccessibleClientsUseCase,
    AssertClientAccessUseCase,

    { provide: CLIENT_ACCOUNT_REPOSITORY, useClass: PrismaClientAccountRepository },
    { provide: CLIENT_ASSIGNMENT_REPOSITORY, useClass: PrismaClientAssignmentRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // V2 Sprint 25 (Dashboard Premium — checklist d'activation) — `ListClientAccountsUseCase` ajouté :
  // même motif que les autres réexports ci-dessus, nécessaire à `dashboard` pour énumérer les
  // clients accessibles (mission §25.69 "Compléter l'entreprise candidate").
  exports: [AssertClientAccessUseCase, ListAccessibleClientsUseCase, GetClientAccountUseCase, ListClientAccountsUseCase],
})
export class ClientPortfolioModule {}
