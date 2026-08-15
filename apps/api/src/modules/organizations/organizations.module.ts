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

@Module({
  imports: [IdentityModule],
  controllers: [],
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
  //
  // V2 Sprint 24 (onboarding, correctif sécurité) — `UpdateOrganizationUseCase` réexporté pour le
  // même motif : `GET`/`PATCH /organizations/me` (étape "Entreprise" de l'onboarding) vivent
  // désormais dans `OrganizationLifecycleController` (module Memberships), jamais ici — l'ancien
  // `OrganizationsController` (`GET`/`PATCH /organizations/:id`) exposait ces routes avec pour
  // seule garde `AuthenticatedGuard` (aucune vérification de Membership), un IDOR réel confirmé
  // sans appelant frontend légitime : n'importe quel utilisateur authentifié pouvait lire/modifier
  // n'importe quelle organisation en devinant son UUID. Supprimé, jamais réintroduit tel quel.
  exports: [
    CreateOrganizationUseCase,
    GetOrganizationUseCase,
    UpdateOrganizationUseCase,
    DeleteOrganizationUseCase,
    ListOrganizationsUseCase,
    SuspendOrganizationUseCase,
    ReactivateOrganizationUseCase,
    CountOrganizationsByStatusUseCase,
  ],
})
export class OrganizationsModule {}
