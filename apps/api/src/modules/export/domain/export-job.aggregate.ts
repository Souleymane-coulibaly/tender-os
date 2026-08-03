import { ExportBlockedError, ExportNotFinalError } from "./errors";
import type { ExportFormat } from "./export-format";
import { ExportMode } from "./export-mode";
import type { ExportSectionSelection } from "./export-section-selection";
import { canTransitionExportStatus, ExportStatus } from "./export-status";

export type ExportJobProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportTemplateId: string;
  exportTemplateVersionId: string;
  documentType: string;
  mode: ExportMode;
  format: ExportFormat;
  status: ExportStatus;
  version: number;
  basedOnExportJobId?: string | undefined;
  sections: readonly ExportSectionSelection[];
  /** Mission Sprint 8A.2 (correction bugs #7/#8) — thème RÉELLEMENT résolu au moment du rendu
   *  (voir ThemeResolver/TemplateThemeResolverService), jamais recalculé après coup : un export
   *  déjà généré garde la preuve exacte du thème qui l'a produit. */
  themeVersionId?: string | undefined;
  themeSourceLevel?: string | undefined;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

/**
 * Mission Sprint 8A §7/§19/§22 — un "job" EST l'export (aperçu ou final), jamais muté après
 * COMPLETED/FAILED ("un export historique reste immuable"). Une ligne FINAL réutilise TOUJOURS une
 * sélection de sections copiée verbatim depuis un aperçu déjà approuvé (`basedOnExportJobId`),
 * jamais une resélection libre au moment du figeage (mission §32 "aucune substitution silencieuse
 * d'une version validée").
 */
export class ExportJob {
  private constructor(private props: ExportJobProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    exportTemplateId: string;
    exportTemplateVersionId: string;
    documentType: string;
    mode: ExportMode;
    format: ExportFormat;
    version: number;
    basedOnExportJobId?: string | undefined;
    sections: readonly ExportSectionSelection[];
    themeVersionId?: string | undefined;
    themeSourceLevel?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): ExportJob {
    if (input.sections.length === 0) {
      throw new ExportBlockedError("at least one section must be selected");
    }
    if (input.mode === ExportMode.Final && !input.basedOnExportJobId) {
      throw new ExportBlockedError("a FINAL export must be based on an approved PREVIEW export");
    }
    return new ExportJob({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      exportTemplateId: input.exportTemplateId,
      exportTemplateVersionId: input.exportTemplateVersionId,
      documentType: input.documentType,
      mode: input.mode,
      format: input.format,
      status: ExportStatus.Pending,
      version: input.version,
      basedOnExportJobId: input.basedOnExportJobId,
      sections: input.sections,
      themeVersionId: input.themeVersionId,
      themeSourceLevel: input.themeSourceLevel,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExportJobProps): ExportJob {
    return new ExportJob(props);
  }

  private transitionTo(next: ExportStatus): void {
    if (!canTransitionExportStatus(this.props.status, next)) {
      throw new ExportBlockedError(`cannot transition export job from ${this.props.status} to ${next}`);
    }
    this.props.status = next;
  }

  markGenerating(): void {
    this.transitionTo(ExportStatus.Generating);
  }

  markCompleted(occurredAt: Date): void {
    this.transitionTo(ExportStatus.Completed);
    this.props.completedAt = occurredAt;
  }

  markFailed(input: { errorCode: string; errorMessage: string; occurredAt: Date }): void {
    this.transitionTo(ExportStatus.Failed);
    this.props.completedAt = input.occurredAt;
    this.props.errorCode = input.errorCode;
    this.props.errorMessage = input.errorMessage;
  }

  /** Mission §22/§38 — un document ne peut être proposé à la validation/signature que s'il s'agit
   *  d'un export FINAL réellement complété. */
  assertUsableAsFinalArtifactSource(): void {
    if (this.props.mode !== ExportMode.Final) {
      throw new ExportNotFinalError();
    }
    if (this.props.status !== ExportStatus.Completed) {
      throw new ExportBlockedError("the export must have completed successfully");
    }
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get exportTemplateId(): string {
    return this.props.exportTemplateId;
  }
  get exportTemplateVersionId(): string {
    return this.props.exportTemplateVersionId;
  }
  get documentType(): string {
    return this.props.documentType;
  }
  get mode(): ExportMode {
    return this.props.mode;
  }
  get format(): ExportFormat {
    return this.props.format;
  }
  get status(): ExportStatus {
    return this.props.status;
  }
  get version(): number {
    return this.props.version;
  }
  get basedOnExportJobId(): string | undefined {
    return this.props.basedOnExportJobId;
  }
  get sections(): readonly ExportSectionSelection[] {
    return this.props.sections;
  }
  get themeVersionId(): string | undefined {
    return this.props.themeVersionId;
  }
  get themeSourceLevel(): string | undefined {
    return this.props.themeSourceLevel;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
}
