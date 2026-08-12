import { Inject, Injectable } from "@nestjs/common";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, type TechnicalMemoSectionRevisionRepository } from "../ports/technical-memo-section-revision.repository";

export type SectionRevisionTenderRef = Readonly<{ revisionId: string; technicalMemoSectionId: string; tenderId: string }>;

/** V2 Sprint 18 — réexporté UNIQUEMENT pour `workspace` (mission §25/§26 : une ApprovalRequest
 *  ciblant TECHNICAL_MEMO_SECTION_REVISION doit vérifier que cette révision appartient bien au
 *  Tender de la demande AVANT toute écriture, jamais un `findById` nu). Une
 *  `TechnicalMemoSectionRevision` n'a pas de `tenderId` dénormalisé — remonte la chaîne
 *  révision -> section -> mémoire. Aucune vérification de permission ici (déjà porté par
 *  `ManageWorkspace`/`ValidateWorkspace` côté `workspace`) : lecture pure, jamais une écriture. */
@Injectable()
export class GetSectionRevisionTenderRefForApprovalUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY) private readonly revisionRepository: TechnicalMemoSectionRevisionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly memoRepository: TechnicalMemoRepository,
  ) {}

  async execute(input: { organizationId: string; revisionId: string }): Promise<SectionRevisionTenderRef | null> {
    const revision = await this.revisionRepository.findById({ organizationId: input.organizationId, revisionId: input.revisionId });
    if (!revision) return null;
    const section = await this.sectionRepository.findById({ organizationId: input.organizationId, technicalMemoSectionId: revision.technicalMemoSectionId });
    if (!section) return null;
    const memo = await this.memoRepository.findById({ organizationId: input.organizationId, technicalMemoId: section.technicalMemoId });
    if (!memo) return null;
    return { revisionId: revision.id, technicalMemoSectionId: section.id, tenderId: memo.tenderId };
  }
}
