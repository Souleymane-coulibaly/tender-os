import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { TechnicalMemoNotFoundError } from "../../domain/errors";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";

/**
 * Point d'entrée UNIQUE pour charger un TechnicalMemo avec vérification RBAC + tenant + client —
 * même motif que `AdministrativeDossierAccessService` (Sprint 11) / `DeliverableAccessService` :
 * charge le Tender (org-tier déjà vérifié par l'appelant via `assertTechnicalMemoAccess`) puis
 * revérifie le ClientAccess AU MOMENT DE LA REQUÊTE (mission §77/§78 — jamais seulement
 * `createdBy === currentUser`, jamais un accès hérité d'une vérification passée).
 */
@Injectable()
export class TechnicalMemoAccessService {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async loadMemo(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    technicalMemoId: string;
    permission: ClientPermission;
  }): Promise<TechnicalMemo> {
    const memo = await this.technicalMemoRepository.findById({ organizationId: input.organizationId, technicalMemoId: input.technicalMemoId });
    if (!memo) {
      throw new TechnicalMemoNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: memo.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return memo;
  }

  /** Vérifie l'accès au Tender SANS exiger qu'un mémoire existe déjà — utilisé par
   *  `CreateTechnicalMemoUseCase` (mission §7-12). */
  async assertTenderAccess(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; permission: ClientPermission }): Promise<string> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return tender.clientAccountId;
  }
}
