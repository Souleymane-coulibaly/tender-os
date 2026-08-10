import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { TechnicalMemoSectionRevisionSource } from "../../domain/enums";
import { TechnicalMemoSectionNotFoundError } from "../../domain/errors";
import { TechnicalMemoSectionRevision } from "../../domain/technical-memo-section-revision.entity";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import { TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY, type TechnicalMemoSectionRevisionRepository } from "../ports/technical-memo-section-revision.repository";

export type EditTechnicalMemoSectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  technicalMemoSectionId: string;
  content: string;
  requestId?: string | undefined;
}>;

/**
 * Édition manuelle (mission §39) — crée une NOUVELLE révision (source MANUAL, sans citation :
 * l'utilisateur assume seul ce contenu, jamais une citation IA recopiée sur un texte qu'il a
 * modifié), jamais un écrasement en place de `content` (mission §39 "jamais silencieusement
 * écraser l'historique"). Verrou de section identique à la génération (mission §84 "édition pendant
 * une génération en cours").
 */
@Injectable()
export class EditTechnicalMemoSectionUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REVISION_REPOSITORY) private readonly revisionRepository: TechnicalMemoSectionRevisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
  ) {}

  async execute(command: EditTechnicalMemoSectionCommand): Promise<TechnicalMemoSectionRevision> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    return this.atomicTransactionRunner.run(async () => {
      await this.revisionRepository.lockSection({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });

      const section = await this.sectionRepository.findById({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });
      if (!section || section.technicalMemoId !== memo.id) {
        throw new TechnicalMemoSectionNotFoundError();
      }

      const occurredAt = this.clock.now();
      const revisionNumber = await this.revisionRepository.nextRevisionNumber({ organizationId: command.organizationId, technicalMemoSectionId: command.technicalMemoSectionId });

      const revision = TechnicalMemoSectionRevision.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        technicalMemoSectionId: command.technicalMemoSectionId,
        revisionNumber,
        source: TechnicalMemoSectionRevisionSource.Manual,
        content: command.content,
        createdBy: command.actorId,
        occurredAt,
      });
      await this.revisionRepository.create({ revision, citations: [] });

      section.applyRevision({ content: command.content, hasMissingData: false, occurredAt });
      await this.sectionRepository.save(section);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "technical_memo.section_edited",
        resourceType: "technical_memo_section",
        resourceId: section.id,
        requestId: command.requestId,
        metadata: { technicalMemoId: memo.id, revisionNumber },
      });

      return revision;
    });
  }
}
