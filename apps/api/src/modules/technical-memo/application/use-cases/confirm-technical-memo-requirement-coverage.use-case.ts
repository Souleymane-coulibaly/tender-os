import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import type { TechnicalMemoCoverageStatus } from "../../domain/enums";
import { TechnicalMemoSectionRequirementNotFoundError } from "../../domain/errors";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import {
  TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY,
  type TechnicalMemoSectionRequirementRepository,
} from "../ports/technical-memo-section-requirement.repository";
import type { TechnicalMemoSectionRequirement } from "../../domain/technical-memo-section-requirement.entity";

export type ConfirmTechnicalMemoRequirementCoverageCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  technicalMemoSectionRequirementId: string;
  coverageStatus: TechnicalMemoCoverageStatus;
  coverageReason?: string | undefined;
  requestId?: string | undefined;
}>;

/** Correction manuelle explicite (mission §47/§55) — toujours prioritaire, jamais réécrasée par une
 *  future suggestion IA automatique (voir `TechnicalMemoSectionRequirement.confirmCoverage`). */
@Injectable()
export class ConfirmTechnicalMemoRequirementCoverageUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REQUIREMENT_REPOSITORY) private readonly requirementRepository: TechnicalMemoSectionRequirementRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(command: ConfirmTechnicalMemoRequirementCoverageCommand): Promise<TechnicalMemoSectionRequirement> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    const link = await this.requirementRepository.findById({ organizationId: command.organizationId, technicalMemoSectionRequirementId: command.technicalMemoSectionRequirementId });
    if (!link) {
      throw new TechnicalMemoSectionRequirementNotFoundError();
    }

    // Anti-IDOR (mission §81) — `requirementRepository.findById` ne scope que par organizationId :
    // vérifie explicitement que le lien appartient bien à une section DE CE mémoire, jamais un lien
    // d'un autre Tender/client de la même organisation atteint via un id deviné.
    const section = await this.sectionRepository.findById({ organizationId: command.organizationId, technicalMemoSectionId: link.technicalMemoSectionId });
    if (!section || section.technicalMemoId !== memo.id) {
      throw new TechnicalMemoSectionRequirementNotFoundError();
    }

    const occurredAt = this.clock.now();
    link.confirmCoverage({ coverageStatus: command.coverageStatus, coverageReason: command.coverageReason, occurredAt });
    await this.requirementRepository.save(link);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "technical_memo.requirement_coverage_confirmed",
      resourceType: "technical_memo_section_requirement",
      resourceId: link.id,
      requestId: command.requestId,
      metadata: { technicalMemoId: memo.id, coverageStatus: command.coverageStatus },
    });

    return link;
  }
}
