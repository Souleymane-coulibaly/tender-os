import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { ListTenderClausesUseCase, ListTenderCriteriaUseCase, ListTenderRequirementsUseCase } from "../../../analysis";
import type { TechnicalMemoSectionRequirement } from "../../domain/technical-memo-section-requirement.entity";
import { mapFindingsToSections } from "../services/map-findings-to-sections";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import {
  TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY,
  type TechnicalMemoSectionRequirementRepository,
} from "../ports/technical-memo-section-requirement.repository";

const FINDINGS_PAGE_LIMIT = 200;

export type MapTechnicalMemoSectionsCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  requestId?: string | undefined;
}>;

/**
 * Mapping DCE → Sections (mission §21) — un seul passage automatique par mémoire (idempotent : si
 * des liens existent déjà, aucune recréation, mission §55/§56 "corrections utilisateur jamais
 * écrasées par une re-suggestion IA silencieuse"). Limite le corpus à `FINDINGS_PAGE_LIMIT` findings
 * par type (mission §33 "jamais tout le DCE envoyé sans contrôle") — un DCE plus large nécessiterait
 * une pagination/priorisation plus fine, hors périmètre de cette passe.
 */
@Injectable()
export class MapTechnicalMemoSectionsUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
  ) {}

  async execute(command: MapTechnicalMemoSectionsCommand): Promise<readonly TechnicalMemoSectionRequirement[]> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    const existing = await this.requirementRepository.listByMemoId({ organizationId: command.organizationId, technicalMemoId: memo.id });
    if (existing.length > 0) {
      return existing;
    }

    const sections = await this.sectionRepository.listByMemoId({ organizationId: command.organizationId, technicalMemoId: memo.id });

    const findingQuery = { organizationId: command.organizationId, tenderId: memo.tenderId, actorId: command.actorId, actorRole: command.actorRole, limit: FINDINGS_PAGE_LIMIT, offset: 0 };
    const [requirementsPage, criteriaPage, clausesPage] = await Promise.all([
      this.listTenderRequirementsUseCase.execute(findingQuery),
      this.listTenderCriteriaUseCase.execute(findingQuery),
      this.listTenderClausesUseCase.execute(findingQuery),
    ]);

    const occurredAt = this.clock.now();
    const links = mapFindingsToSections({
      sections,
      corpus: { requirements: requirementsPage.items, criteria: criteriaPage.items, clauses: clausesPage.items },
      organizationId: command.organizationId,
      idGenerator: this.idGenerator,
      occurredAt,
    });

    await this.requirementRepository.createMany(links);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "technical_memo.sections_mapped",
      resourceType: "technical_memo",
      resourceId: memo.id,
      requestId: command.requestId,
      metadata: { linkCount: links.length, requirementCount: requirementsPage.items.length, criterionCount: criteriaPage.items.length, clauseCount: clausesPage.items.length },
    });

    return links;
  }
}
