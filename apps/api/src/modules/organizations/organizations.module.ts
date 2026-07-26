import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { ORGANIZATION_REPOSITORY } from "./application/ports/organization.repository";
import { CountOrganizationsByStatusUseCase } from "./application/use-cases/count-organizations-by-status.use-case";
import { CreateOrganizationUseCase } from "./application/use-cases/create-organization.use-case";
import { DeleteOrganizationUseCase } from "./application/use-cases/delete-organization.use-case";
import { GetOrganizationUseCase } from "./application/use-cases/get-organization.use-case";
import { ListOrganizationsUseCase } from "./application/use-cases/list-organizations.use-case";
import { ReactivateOrganizationUseCase } from "./application/use-cases/reactivate-organization.use-case";
import { SuspendOrganizationUseCase } from "./application/use-cases/suspend-organization.use-case";
import { UpdateOrganizationUseCase } from "./application/use-cases/update-organization.use-case";
import { PrismaOrganizationRepository } from "./infrastructure/prisma-organization.repository";
import { OrganizationsController } from "./interfaces/http/organizations.controller";

@Module({
  imports: [IdentityModule],
  controllers: [OrganizationsController],
  providers: [
    CreateOrganizationUseCase,
    GetOrganizationUseCase,
    UpdateOrganizationUseCase,
    DeleteOrganizationUseCase,
    ListOrganizationsUseCase,
    SuspendOrganizationUseCase,
    ReactivateOrganizationUseCase,
    CountOrganizationsByStatusUseCase,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
  ],
  exports: [
    GetOrganizationUseCase,
    ListOrganizationsUseCase,
    SuspendOrganizationUseCase,
    ReactivateOrganizationUseCase,
    CountOrganizationsByStatusUseCase,
  ],
})
export class OrganizationsModule {}
