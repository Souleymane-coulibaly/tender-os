import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { OrganizationsModule } from "../organizations";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY } from "./application/ports/membership.repository";
import { ChangeMembershipRoleUseCase } from "./application/use-cases/change-membership-role.use-case";
import { CountActiveMembersUseCase } from "./application/use-cases/count-active-members.use-case";
import { CreateMembershipUseCase } from "./application/use-cases/create-membership.use-case";
import { CreateOrganizationWithOwnerUseCase } from "./application/use-cases/create-organization-with-owner.use-case";
import { DeleteOrganizationAsOwnerUseCase } from "./application/use-cases/delete-organization-as-owner.use-case";
import { GetMembershipUseCase } from "./application/use-cases/get-membership.use-case";
import { ListMyMembershipsUseCase } from "./application/use-cases/list-my-memberships.use-case";
import { ListOrganizationMembersUseCase } from "./application/use-cases/list-organization-members.use-case";
import { RemoveMembershipUseCase } from "./application/use-cases/remove-membership.use-case";
import { SuspendMembershipUseCase } from "./application/use-cases/suspend-membership.use-case";
import { TransferOrganizationOwnershipUseCase } from "./application/use-cases/transfer-organization-ownership.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaMembershipRepository } from "./infrastructure/prisma-membership.repository";
import { OrganizationLifecycleController } from "./interfaces/http/organization-lifecycle.controller";
import { OrganizationMembershipsController } from "./interfaces/http/organization-memberships.controller";
import { OrganizationMembershipGuard } from "./interfaces/http/organization-membership.guard";

@Module({
  imports: [IdentityModule, OrganizationsModule],
  controllers: [OrganizationMembershipsController, OrganizationLifecycleController],
  providers: [
    CreateMembershipUseCase,
    GetMembershipUseCase,
    ListOrganizationMembersUseCase,
    ListMyMembershipsUseCase,
    ChangeMembershipRoleUseCase,
    SuspendMembershipUseCase,
    RemoveMembershipUseCase,
    CountActiveMembersUseCase,
    TransferOrganizationOwnershipUseCase,
    CreateOrganizationWithOwnerUseCase,
    DeleteOrganizationAsOwnerUseCase,
    OrganizationMembershipGuard,
    { provide: MEMBERSHIP_REPOSITORY, useClass: PrismaMembershipRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // MEMBERSHIP_REPOSITORY et OrganizationsModule sont réexportés uniquement pour
  // qu'OrganizationMembershipGuard reste résoluble quand il est réutilisé par un autre
  // module (ex. Tenders) via @UseGuards — même motif que ACCESS_TOKEN_SERVICE/
  // SESSION_REPOSITORY dans IdentityModule (le guard dépend aussi de GetOrganizationUseCase).
  exports: [CountActiveMembersUseCase, OrganizationMembershipGuard, MEMBERSHIP_REPOSITORY, OrganizationsModule],
})
export class MembershipsModule {}
