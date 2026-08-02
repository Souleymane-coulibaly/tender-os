import { InvalidVersionLifecycleTransitionError } from "./errors";
import type { DeliverableTemplateSectionConfig } from "./deliverable-template-section-config";
import { ALLOWED_VERSION_LIFECYCLE_TRANSITIONS, VersionLifecycleStatus } from "./version-lifecycle-status";

export type DeliverableTemplateVersionProps = {
  id: string;
  organizationId: string;
  deliverableTemplateId: string;
  version: number;
  status: VersionLifecycleStatus;
  sections: readonly DeliverableTemplateSectionConfig[];
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | undefined;
  archivedAt?: Date | undefined;
};

/** Mission §5 — créée DRAFT, jamais active d'emblée. Une fois ACTIVE, `sections` ne change plus
 *  jamais — seul `status` transite ensuite vers ARCHIVED (même discipline qu'`ExportTemplateVersion`,
 *  Sprint 8A, et `PromptVersion`, Sprint 6). */
export class DeliverableTemplateVersion {
  private constructor(private props: DeliverableTemplateVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableTemplateId: string;
    version: number;
    sections: readonly DeliverableTemplateSectionConfig[];
    createdBy: string;
    occurredAt: Date;
  }): DeliverableTemplateVersion {
    return new DeliverableTemplateVersion({
      id: input.id,
      organizationId: input.organizationId,
      deliverableTemplateId: input.deliverableTemplateId,
      version: input.version,
      status: VersionLifecycleStatus.Draft,
      sections: input.sections,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableTemplateVersionProps): DeliverableTemplateVersion {
    return new DeliverableTemplateVersion(props);
  }

  private transitionTo(next: VersionLifecycleStatus, occurredAt: Date): void {
    if (!ALLOWED_VERSION_LIFECYCLE_TRANSITIONS[this.props.status].includes(next)) {
      throw new InvalidVersionLifecycleTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    if (next === VersionLifecycleStatus.Active) this.props.activatedAt = occurredAt;
    if (next === VersionLifecycleStatus.Archived) this.props.archivedAt = occurredAt;
  }

  activate(occurredAt: Date): void {
    this.transitionTo(VersionLifecycleStatus.Active, occurredAt);
  }

  archive(occurredAt: Date): void {
    this.transitionTo(VersionLifecycleStatus.Archived, occurredAt);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableTemplateId(): string {
    return this.props.deliverableTemplateId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): VersionLifecycleStatus {
    return this.props.status;
  }
  get sections(): readonly DeliverableTemplateSectionConfig[] {
    return this.props.sections;
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
