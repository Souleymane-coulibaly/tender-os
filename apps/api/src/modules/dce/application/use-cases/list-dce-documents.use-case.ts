import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DceNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { DCE_DOCUMENT_REPOSITORY, type DceDocumentRepository } from "../ports/dce-document.repository";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import type { DceDocumentSummary } from "../dtos";

export type ListDceDocumentsQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string }>;

/** Mission Sprint 8A.2 (audit isolation inter-client) — même correctif que `GetDceUseCase` :
 *  `GetTenderUseCase` avec `actorId` déclenche la vérification d'affectation client, absente
 *  jusqu'ici (seul le rôle ORG-WIDE était vérifié). */
@Injectable()
export class ListDceDocumentsUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: ListDceDocumentsQuery): Promise<DceDocumentSummary[]> {
    assertHasDcePermission(query.actorRole, DcePermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    const dce = await this.dceRepository.findByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!dce) {
      throw new DceNotFoundError();
    }

    return this.dceDocumentRepository.listSummariesByDceId({
      organizationId: query.organizationId,
      dceId: dce.id.value,
    });
  }
}
