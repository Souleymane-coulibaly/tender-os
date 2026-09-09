import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ArchiveCompanyBankAccountUseCase, ListCompanyBankAccountsUseCase } from "../../application/use-cases/company-bank-account.use-cases";
import { ListCompanyCertificationsUseCase } from "../../application/use-cases/company-certification.use-cases";
import { ListCompanyHumanResourcesUseCase } from "../../application/use-cases/company-human-resource.use-cases";
import { ListCompanyInsurancesUseCase } from "../../application/use-cases/company-insurance.use-cases";
import { GetCompanyLegalIdentityUseCase } from "../../application/use-cases/company-legal-identity.use-cases";
import { ListCompanyMaterialResourcesUseCase } from "../../application/use-cases/company-material-resource.use-cases";
import { ListCompanyReferenceDocumentsUseCase, ListCompanyReferencesUseCase } from "../../application/use-cases/company-reference.use-cases";
import { CreateCompanyRepresentativeUseCase, ListCompanyRepresentativesUseCase, UpdateCompanyRepresentativeUseCase } from "../../application/use-cases/company-representative.use-cases";
import { AttachDocumentToClientAccountUseCase, ListClientAccountDocumentAssociationsUseCase } from "../../application/use-cases/document-client-account-association.use-cases";
import { GetCompanyProfileUseCase } from "../../application/use-cases/get-company-profile.use-case";
import { CompanyProfileErrorFilter } from "./company-profile-error.filter";
import { maskBankAccountForList } from "./mask-bank-account";
import {
  AttachClientAccountDocumentBodySchema,
  CreateClientCommercialContactBodySchema,
  IdParamSchema,
  UpdateClientCommercialContactBodySchema,
  type AttachClientAccountDocumentBody,
  type CreateClientCommercialContactBody,
  type UpdateClientCommercialContactBody,
} from "./schemas";

/**
 * Mission V2 Sprint 2 §9/§10 — fiche "Entreprise candidate" : identité légale + satellites
 * progressifs. Routes nichées sous `/clients/:clientId/...`, même préfixe que `ClientPortfolioController`
 * (`:clientId`, pas `:id`, pour rester cohérent avec la convention déjà en place).
 */
@Controller("clients")
@UseFilters(CompanyProfileErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CompanyProfileController {
  constructor(
    private readonly getProfileUseCase: GetCompanyProfileUseCase,
    private readonly getLegalIdentityUseCase: GetCompanyLegalIdentityUseCase,
    private readonly listRepresentativesUseCase: ListCompanyRepresentativesUseCase,
    private readonly createRepresentativeUseCase: CreateCompanyRepresentativeUseCase,
    private readonly updateRepresentativeUseCase: UpdateCompanyRepresentativeUseCase,
    private readonly listBankAccountsUseCase: ListCompanyBankAccountsUseCase,
    private readonly archiveBankAccountUseCase: ArchiveCompanyBankAccountUseCase,
    private readonly listInsurancesUseCase: ListCompanyInsurancesUseCase,
    private readonly listCertificationsUseCase: ListCompanyCertificationsUseCase,
    private readonly listReferencesUseCase: ListCompanyReferencesUseCase,
    private readonly listReferenceDocumentsUseCase: ListCompanyReferenceDocumentsUseCase,
    private readonly listHumanResourcesUseCase: ListCompanyHumanResourcesUseCase,
    private readonly listMaterialResourcesUseCase: ListCompanyMaterialResourcesUseCase,
    private readonly listDocumentAssociationsUseCase: ListClientAccountDocumentAssociationsUseCase,
    private readonly attachDocumentUseCase: AttachDocumentToClientAccountUseCase,
  ) {}


  /**
   * Checkpoint TENDEROS-2.1-CCV2-I.4 — 14 routes d'ECRITURE de candidature ont ete RETIREES
   * PHYSIQUEMENT de ce controleur (identite juridique, comptes bancaires, assurances,
   * certifications, references + leurs pieces, moyens humains et materiels).
   *
   * Elles repondaient depuis CCV2-I.1 un 409 `CLIENT_BIDDER_WRITE_RETIRED` a TOUTES leurs requetes,
   * sans exception : leur seule fonction restante etait de refuser. Leur retrait ne supprime donc
   * aucune capacite produit — il remplace un refus applicatif par une absence, garantie plus forte
   * puisqu'elle ne peut plus etre contournee par un oubli de garde.
   *
   * CE QUI RESTE, ET POURQUOI :
   *  - les LECTURES historiques des memes domaines : des lignes Legacy subsistent chez les clients
   *    sans entreprise candidate (registre de migration CCV2-I.2), et rien d'autre ne les affiche.
   *    Les retirer rendrait cette donnee inaccessible depuis le produit ;
   *  - `POST/PATCH :clientId/representatives` : ce sont les CONTACTS CRM, donnee client legitime —
   *    seuls les types portant une autorite juridique y sont refuses ;
   *  - `POST :clientId/bank-accounts/:id/archive` : transitionnel, seul moyen de neutraliser une
   *    ligne Legacy (CCV2-I.2 §8) ;
   *  - `GET/POST :clientId/documents` : documents COMMERCIAUX, recentres en CCV2-I.3.
   */
  @Get(":clientId/profile")
  async getProfile(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.getProfileUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":clientId/legal-identity")
  async getLegalIdentity(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.getLegalIdentityUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }


  @Get(":clientId/representatives")
  async listRepresentatives(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listRepresentativesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/representatives")
  @HttpCode(HttpStatus.CREATED)
  async createRepresentative(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateClientCommercialContactBodySchema)) body: CreateClientCommercialContactBody,
  ) {
    return this.createRepresentativeUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/representatives/:representativeId")
  async updateRepresentative(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("representativeId", new ZodValidationPipe(IdParamSchema)) representativeId: string,
    @Body(new ZodValidationPipe(UpdateClientCommercialContactBodySchema)) body: UpdateClientCommercialContactBody,
  ) {
    return this.updateRepresentativeUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, representativeId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/bank-accounts")
  async listBankAccounts(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    const accounts = await this.listBankAccountsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
    return accounts.map(maskBankAccountForList);
  }



  @Post(":clientId/bank-accounts/:bankAccountId/archive")
  @HttpCode(HttpStatus.OK)
  async archiveBankAccount(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("bankAccountId", new ZodValidationPipe(IdParamSchema)) bankAccountId: string,
  ) {
    return this.archiveBankAccountUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, bankAccountId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":clientId/insurances")
  async listInsurances(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listInsurancesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }



  @Get(":clientId/certifications")
  async listCertifications(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listCertificationsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }



  @Get(":clientId/references")
  async listReferences(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listReferencesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }



  @Get(":clientId/references/:referenceId/documents")
  async listReferenceDocuments(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("referenceId", new ZodValidationPipe(IdParamSchema)) referenceId: string,
  ) {
    return this.listReferenceDocumentsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, referenceId, actorId: actor.userId, actorRole: membership.role });
  }


  @Get(":clientId/human-resources")
  async listHumanResources(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listHumanResourcesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }



  @Get(":clientId/material-resources")
  async listMaterialResources(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listMaterialResourcesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }



  @Get(":clientId/documents")
  async listDocuments(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listDocumentAssociationsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/documents")
  @HttpCode(HttpStatus.CREATED)
  async attachDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(AttachClientAccountDocumentBodySchema)) body: AttachClientAccountDocumentBody,
  ) {
    return this.attachDocumentUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }
}
