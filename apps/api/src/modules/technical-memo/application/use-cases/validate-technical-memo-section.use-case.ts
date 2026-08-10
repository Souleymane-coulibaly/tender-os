import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { TechnicalMemoSectionNotFoundError } from "../../domain/errors";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";

export type ValidateTechnicalMemoSectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  technicalMemoSectionId: string;
  requestId?: string | undefined;
}>;

/** Mission §38 — action humaine EXPLICITE, la seule qui fait transiter une section vers VALIDATED
 *  (jamais une conséquence automatique d'une génération, voir `TechnicalMemoSection.applyRevision`
 *  qui ne produit jamais que DRAFT/NEEDS_REVIEW). Réservé au CLIENT_MANAGER/palier organisation
 *  ("règle stricte", `ClientPermission.ValidateTechnicalMemo`), jamais délégué au CONTRIBUTOR. */
@Injectable()
export class ValidateTechnicalMemoSectionUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(command: ValidateTechnicalMemoSectionCommand): Promise<TechnicalMemoSection> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ValidateTechnicalMemo,
      requireUseOrgPermission: true,
    });

    const section = await this.sectionRepository.findById({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
    if (!section || section.technicalMemoId !== memo.id) {
      throw new TechnicalMemoSectionNotFoundError();
    }

    const occurredAt = this.clock.now();
    section.validate(occurredAt);
    await this.sectionRepository.save(section);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "technical_memo.section_validated",
      resourceType: "technical_memo_section",
      resourceId: section.id,
      requestId: command.requestId,
      metadata: { technicalMemoId: memo.id },
    });

    return section;
  }
}
