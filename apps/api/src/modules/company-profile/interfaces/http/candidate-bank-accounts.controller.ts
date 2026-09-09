import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import {
  ArchiveCandidateBankAccountUseCase,
  CreateCandidateBankAccountUseCase,
  ListCandidateBankAccountsUseCase,
  UpdateCandidateBankAccountUseCase,
} from "../../application/use-cases/candidate-bank-account.use-cases";
import { CandidateCapabilityErrorFilter } from "./candidate-capability-error.filter";
import { presentCandidateBankAccount } from "./candidate-bank-account.presenters";
import { CreateCompanyBankAccountBodySchema, IdParamSchema, UpdateCompanyBankAccountBodySchema } from "./schemas";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C.1 — surface bancaire de l'entreprise candidate.
 *
 * Contrôleur SÉPARÉ de `CandidateCapabilitiesController` : le banking n'est pas une capacité comme
 * une autre, il est gardé par une permission distincte (`candidate:read_banking` /
 * `candidate:manage_banking`) et par une politique de sérialisation propre. Les séparer rend
 * structurellement impossible l'ajout accidentel d'un IBAN à une réponse de capacités.
 *
 * AUCUN contrôle de rôle n'est écrit ici : l'autorisation vit dans les use cases, via
 * `CandidateCapabilityAccessService` — le contrôleur reste mince.
 *
 * `DELETE` archive (`status = ARCHIVED`, `isPrimary = false`), jamais de suppression physique —
 * même règle que le chemin Legacy.
 */
@Controller("candidate-companies/:candidateCompanyId/bank-accounts")
@UseFilters(CandidateCapabilityErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CandidateBankAccountsController {
  constructor(
    private readonly listUseCase: ListCandidateBankAccountsUseCase,
    private readonly createUseCase: CreateCandidateBankAccountUseCase,
    private readonly updateUseCase: UpdateCandidateBankAccountUseCase,
    private readonly archiveUseCase: ArchiveCandidateBankAccountUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
  ) {
    const accounts = await this.listUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorRole: membership.role,
    });
    return { items: accounts.map(presentCandidateBankAccount) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Body(new ZodValidationPipe(CreateCompanyBankAccountBodySchema)) body: Record<string, unknown>,
  ) {
    const created = await this.createUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...(body as { accountHolder: string; iban: string }),
    });
    return presentCandidateBankAccount(created);
  }

  @Patch(":bankAccountId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("bankAccountId", new ZodValidationPipe(IdParamSchema)) bankAccountId: string,
    @Body(new ZodValidationPipe(UpdateCompanyBankAccountBodySchema)) body: Record<string, unknown>,
  ) {
    const updated = await this.updateUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      bankAccountId,
      actorId: actor.userId,
      actorRole: membership.role,
      patch: body,
    });
    return presentCandidateBankAccount(updated);
  }

  @Delete(":bankAccountId")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("bankAccountId", new ZodValidationPipe(IdParamSchema)) bankAccountId: string,
  ) {
    const archived = await this.archiveUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      bankAccountId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return presentCandidateBankAccount(archived);
  }
}
