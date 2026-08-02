import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { EXPORT_JOB_REPOSITORY, EXPORT_TEMPLATE_REPOSITORY, ExportJobNotFoundError, type ExportJobRepository, type ExportTemplateRepository } from "../../../export";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ValidationIssue } from "../../domain/validation-issue";
import { ValidationSeverity } from "../../domain/validation-severity";
import { ValidationRun } from "../../domain/validation-run.aggregate";
import { toValidationRunSummary, type ValidationRunSummary } from "../dtos";
import { runValidationRules } from "../services/validation-rules.engine";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type RunFinalValidationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  exportJobId: string;
}>;

/**
 * Mission Sprint 8A §8/§26/§29 — exécute le moteur de règles contre un `ExportJob` précis
 * (typiquement un aperçu) et fige un `ValidationRun` immuable. Chaque exécution crée une NOUVELLE
 * ligne (mission "une validation historique reste immuable") — jamais une mise à jour d'un run
 * existant.
 */
@Injectable()
export class RunFinalValidationUseCase {
  constructor(
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RunFinalValidationCommand): Promise<ValidationRunSummary> {
    const found = await this.exportJobRepository.findById({ organizationId: command.organizationId, exportJobId: command.exportJobId });
    if (!found) {
      throw new ExportJobNotFoundError();
    }
    const { job } = found;

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: job.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    const templateVersion = await this.exportTemplateRepository.findVersionById({ organizationId: command.organizationId, versionId: job.exportTemplateVersionId });
    const templateSections = templateVersion?.config.sections ?? [];
    const selectedIds = new Set(job.sections.map((s) => s.sectionId));

    const engineSections = [
      ...templateSections.map((templateSection) => {
        const selection = job.sections.find((s) => s.sectionId === templateSection.id);
        return {
          sectionId: templateSection.id,
          label: templateSection.label,
          mandatory: templateSection.mandatory,
          selected: selectedIds.has(templateSection.id),
          sourceType: selection?.sourceType,
          validationStatus: selection?.validationStatus,
          textLength: selection?.manualContent?.length,
        };
      }),
      // Sections sélectionnées hors catalogue du template (ex. annexes libres) — jamais ignorées.
      ...job.sections
        .filter((s) => !templateSections.some((t) => t.id === s.sectionId))
        .map((s) => ({
          sectionId: s.sectionId,
          label: s.sectionId,
          mandatory: false,
          selected: true,
          sourceType: s.sourceType,
          validationStatus: s.validationStatus,
          textLength: s.manualContent?.length,
        })),
    ];

    const engineIssues = runValidationRules({ exportJobId: job.id, sections: engineSections });

    const occurredAt = this.clock.now();
    const issues = engineIssues.map((issue) =>
      ValidationIssue.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        validationRunId: "", // renseigné juste après par le repository lors de la persistance
        ruleCode: issue.ruleCode,
        severity: issue.severity as ValidationSeverity,
        message: issue.message,
        resourceType: issue.resourceType,
        resourceId: issue.resourceId,
        source: issue.source,
        recommendation: issue.recommendation,
        occurredAt,
      }),
    );

    const run = ValidationRun.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: job.clientAccountId,
      tenderId: command.tenderId,
      exportJobId: command.exportJobId,
      runBy: command.actorId,
      occurredAt,
      issues,
    });

    // Renseigne rétroactivement le validationRunId (le run vient d'être instancié, la classe
    // ValidationIssue est immuable sur ce champ à dessein — rehydrate avec l'id correct).
    const issuesWithRunId = issues.map((issue) =>
      ValidationIssue.rehydrate({
        id: issue.id,
        organizationId: issue.organizationId,
        validationRunId: run.id,
        ruleCode: issue.ruleCode,
        severity: issue.severity,
        message: issue.message,
        resourceType: issue.resourceType,
        resourceId: issue.resourceId,
        source: issue.source,
        recommendation: issue.recommendation,
        detectedAt: issue.detectedAt,
        resolutionStatus: issue.resolutionStatus,
      }),
    );

    await this.validationRunRepository.create({ run, issues: issuesWithRunId });

    return toValidationRunSummary(ValidationRun.rehydrate({
      id: run.id,
      organizationId: run.organizationId,
      clientAccountId: run.clientAccountId,
      tenderId: run.tenderId,
      exportJobId: run.exportJobId,
      readinessStatus: run.readinessStatus,
      runBy: run.runBy,
      runAt: run.runAt,
      issues: issuesWithRunId,
    }));
  }
}
