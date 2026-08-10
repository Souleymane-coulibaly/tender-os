import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin, type IncomingFile } from "../../../documents";
import { assertLotBelongsToTender, TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../../../tenders";
import { extractBodyXml, extractOutline, splitBody } from "../../infrastructure/docx-outline-extractor";
import { buildTenderOsSystemMemoTemplate } from "../../infrastructure/system-template-builder";
import { DuplicateTechnicalMemoError } from "../../domain/errors";
import { TechnicalMemoTemplateOrigin } from "../../domain/enums";
import { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import { assertTechnicalMemoTenderAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { buildSectionsFromOutline } from "../services/build-sections-from-outline";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";

const MAX_TEMPLATE_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type CreateTechnicalMemoCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  lotId?: string | undefined;
  templateOrigin: TechnicalMemoTemplateOrigin;
  /** Requis pour COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE, absent pour TENDEROS_SYSTEM (mission §20
   *  "générer sans modèle" — aucun upload utilisateur, gabarit système déjà préparé). */
  file?: IncomingFile | undefined;
  requestId?: string | undefined;
}>;

export type CreateTechnicalMemoResult = Readonly<{ memo: TechnicalMemo; sections: readonly TechnicalMemoSection[] }>;

/**
 * Étape 1 du pipeline (mission §2 "Template DOCX → Analyse structurelle → Document Outline →
 * Sections") — upload (si applicable) + analyse structurelle synchrone, TOUJOURS lecture seule sur
 * le contenu (mission §9 "upload→analyser ne doit JAMAIS produire un mémoire généré") : seules des
 * `TechnicalMemoSection` vides (statut EMPTY) sont créées ici, aucun contenu IA. La préparation du
 * gabarit dérivé exploitable par document-generation (insertion de placeholders, mission §53-56)
 * est un second temps séparé (voir `PrepareTechnicalMemoTemplateUseCase`), pas cette étape.
 */
@Injectable()
export class CreateTechnicalMemoUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
  ) {}

  async execute(command: CreateTechnicalMemoCommand): Promise<CreateTechnicalMemoResult> {
    const clientAccountId = await assertTechnicalMemoTenderAccess(this.accessService, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    // Anti-IDOR (mission §81) — un `lotId` fourni doit réellement appartenir à CE Tender, jamais
    // accepté tel quel (même motif que `assertLotBelongsToTender` déjà utilisé par Chat/Workspace).
    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: command.organizationId, tenderId: command.tenderId, lotId: command.lotId });

    const existing = await this.technicalMemoRepository.findByScope({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId ?? null,
    });
    if (existing) {
      throw new DuplicateTechnicalMemoError();
    }

    const occurredAt = this.clock.now();
    let originalDocumentId: string | undefined;
    let originalDocumentVersionId: string | undefined;
    let buffer: Buffer;

    if (command.templateOrigin === TechnicalMemoTemplateOrigin.TenderOsSystem) {
      buffer = await buildTenderOsSystemMemoTemplate();
    } else {
      if (!command.file) {
        throw new Error("A DOCX file is required for COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE origins.");
      }
      const stored = await this.createDocumentWithFirstVersionUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        title: `Mémoire technique — modèle source (${command.templateOrigin})`,
        origin: DocumentOrigin.UserUpload,
        domain: DocumentDomain.Template,
        file: command.file,
        maxFileSizeBytes: MAX_TEMPLATE_FILE_SIZE_BYTES,
        requestId: command.requestId,
      });
      originalDocumentId = stored.id;
      originalDocumentVersionId = stored.currentVersion!.id;
      buffer = command.file.buffer;
    }

    const bodyXml = extractBodyXml(buffer);
    const segments = splitBody(bodyXml);
    const outline = extractOutline(segments);

    const memo = TechnicalMemo.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      clientAccountId,
      lotId: command.lotId,
      templateOrigin: command.templateOrigin,
      originalDocumentId,
      originalDocumentVersionId,
      createdBy: command.actorId,
      occurredAt,
    });

    const sections = buildSectionsFromOutline({
      outline,
      organizationId: command.organizationId,
      technicalMemoId: memo.id,
      createdBy: command.actorId,
      occurredAt,
      idGenerator: this.idGenerator,
    });

    // Correctif audit — le mémo, ses sections, et les deux entrées d'audit sont écrits ENSEMBLE
    // dans une seule transaction courte (même motif que `GenerateTechnicalMemoSectionUseCase`) :
    // jamais un `TechnicalMemo` créé sans ses sections (ou l'inverse) si une écriture échoue en
    // cours de route. Le stockage du fichier source (déjà effectué ci-dessus) reste hors de cette
    // transaction — `CreateDocumentWithFirstVersionUseCase` gère déjà sa propre atomicité/
    // compensation (suppression du fichier stocké en cas d'échec de sa propre transaction interne).
    await this.atomicTransactionRunner.run(async () => {
      await this.technicalMemoRepository.create(memo);
      await this.sectionRepository.createMany(sections);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "technical_memo.created",
        resourceType: "technical_memo",
        resourceId: memo.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, lotId: command.lotId ?? null, templateOrigin: command.templateOrigin },
      });
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "technical_memo.template_analyzed",
        resourceType: "technical_memo",
        resourceId: memo.id,
        requestId: command.requestId,
        metadata: { sectionCount: sections.length },
      });
    });

    return { memo, sections };
  }
}
