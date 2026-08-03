import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { GetTenderUseCase } from "../../../tenders";
import { DceImportJob } from "../../domain/dce-import-job.aggregate";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { toDceImportJobSummary, type DceImportJobSummary } from "../dtos";
import { DCE_IMPORT_DISPATCHER, type DceImportDispatcher } from "../ports/dce-import-dispatcher";
import { DCE_IMPORT_JOB_REPOSITORY, type DceImportJobRepository } from "../ports/dce-import-job.repository";

export type StartDceZipImportCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  originalFilename: string;
  sizeBytes: number;
  requestId?: string | undefined;
}>;

/**
 * Déclenche un import ZIP ASYNCHRONE (mission Sprint 8A.2, correction bug #3 "import ZIP lourd
 * échoue ou bloque") — ne fait plus que valider l'upload (déjà fait par Multer/le contrôleur avant
 * cet appel) et créer la ligne de suivi ; l'extraction et l'import fichier-par-fichier
 * (déjà sûrs et inchangés, voir ProcessDceZipImportUseCase/ImportDceFilesUseCase) se déroulent en tâche
 * de fond (voir ProcessDceZipImportUseCase), déclenchée par `DceImportDispatcher`. Le buffer ZIP
 * lui-même est transmis au dispatcher, jamais persisté en base — même limite documentée que
 * `InProcessExtractionDispatcher` : un redémarrage du process pendant le traitement laisse le job
 * dans un état non terminal (retry manuel), acceptable pour cette tranche.
 */
@Injectable()
export class StartDceZipImportUseCase {
  constructor(
    @Inject(DCE_IMPORT_JOB_REPOSITORY) private readonly jobRepository: DceImportJobRepository,
    @Inject(DCE_IMPORT_DISPATCHER) private readonly dispatcher: DceImportDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: StartDceZipImportCommand, zipBuffer: Buffer): Promise<DceImportJobSummary> {
    assertHasDcePermission(command.actorRole, DcePermission.Import);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
      actorId: command.actorId,
    });
    assertTenderNotArchivedForDceMutation(tender);

    const occurredAt = this.clock.now();
    const job = DceImportJob.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      originalFilename: command.originalFilename,
      sizeBytes: command.sizeBytes,
      createdByUserId: command.actorId,
      occurredAt,
    });
    await this.jobRepository.create(job);

    this.dispatcher.dispatch({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      jobId: job.id,
      actorId: command.actorId,
      actorRole: command.actorRole,
      zipBuffer,
      requestId: command.requestId,
    });

    return toDceImportJobSummary(job);
  }
}
