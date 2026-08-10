import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";

export type GetTechnicalMemoQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
}>;

export type GetTechnicalMemoResult = Readonly<{ memo: TechnicalMemo; sections: readonly TechnicalMemoSection[] }>;

/** Lecture — revérifie le ClientAccess À CHAQUE APPEL (mission §77/§78), jamais un accès mis en
 *  cache ni seulement `createdBy === currentUser`. */
@Injectable()
export class GetTechnicalMemoUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(query: GetTechnicalMemoQuery): Promise<GetTechnicalMemoResult> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: query.organizationId,
      technicalMemoId: query.technicalMemoId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadTechnicalMemo,
    });
    const sections = await this.sectionRepository.listByMemoId({ organizationId: query.organizationId, technicalMemoId: memo.id });
    return { memo, sections };
  }
}
