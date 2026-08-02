import type { ExportTemplateConfig } from "./export-template-config";
import type { ExportFormat } from "./export-format";
import { ALLOWED_EXPORT_TEMPLATE_VERSION_TRANSITIONS, ExportTemplateVersionStatus } from "./export-template-version-status";
import { InvalidExportTemplateVersionStatusTransitionError } from "./errors";

export type ExportTemplateVersionProps = {
  id: string;
  organizationId: string;
  exportTemplateId: string;
  version: number;
  status: ExportTemplateVersionStatus;
  format: ExportFormat;
  config: ExportTemplateConfig;
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | undefined;
  archivedAt?: Date | undefined;
};

/** Mission Sprint 8A §7/§16 — créée DRAFT, jamais active d'emblée (même discipline que
 *  `PromptVersion`, Sprint 6). Une fois ACTIVE, `config`/`format` ne changent plus jamais — seul
 *  `status` transite ensuite vers ARCHIVED. */
export class ExportTemplateVersion {
  private constructor(private props: ExportTemplateVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    exportTemplateId: string;
    version: number;
    format: ExportFormat;
    config: ExportTemplateConfig;
    createdBy: string;
    occurredAt: Date;
  }): ExportTemplateVersion {
    return new ExportTemplateVersion({
      id: input.id,
      organizationId: input.organizationId,
      exportTemplateId: input.exportTemplateId,
      version: input.version,
      status: ExportTemplateVersionStatus.Draft,
      format: input.format,
      config: input.config,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: ExportTemplateVersionProps): ExportTemplateVersion {
    return new ExportTemplateVersion(props);
  }

  private transitionTo(next: ExportTemplateVersionStatus, occurredAt: Date): void {
    if (!ALLOWED_EXPORT_TEMPLATE_VERSION_TRANSITIONS[this.props.status].includes(next)) {
      throw new InvalidExportTemplateVersionStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    if (next === ExportTemplateVersionStatus.Active) this.props.activatedAt = occurredAt;
    if (next === ExportTemplateVersionStatus.Archived) this.props.archivedAt = occurredAt;
  }

  activate(occurredAt: Date): void {
    this.transitionTo(ExportTemplateVersionStatus.Active, occurredAt);
  }

  archive(occurredAt: Date): void {
    this.transitionTo(ExportTemplateVersionStatus.Archived, occurredAt);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get exportTemplateId(): string {
    return this.props.exportTemplateId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): ExportTemplateVersionStatus {
    return this.props.status;
  }
  get format(): ExportFormat {
    return this.props.format;
  }
  get config(): ExportTemplateConfig {
    return this.props.config;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get activatedAt(): Date | undefined {
    return this.props.activatedAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
}
