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
  // CreateOrganizationUseCase et DeleteOrganizationUseCase sont réexportés pour que Memberships
  // (qui dépend déjà de ce module) puisse composer la création atomique Organization+OWNER et la
  // suppression réservée à l'OWNER (bible/03-domain/business-rules.md BR-ORG-002/§4) — Organizations
  // ne doit jamais dépendre de Memberships en retour (dépendance circulaire interdite), c'est
  // pourquoi ces deux endpoints sont composés côté Memberships plutôt qu'ici.
  exports: [
    CreateOrganizationUseCase,
    GetOrganizationUseCase,
    DeleteOrganizationUseCase,
    ListOrganizationsUseCase,
    SuspendOrganizationUseCase,
    ReactivateOrganizationUseCase,
    CountOrganizationsByStatusUseCase,
  ],
})
export class OrganizationsModule {}
