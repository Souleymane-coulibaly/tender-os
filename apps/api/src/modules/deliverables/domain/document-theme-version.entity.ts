import { InvalidVersionLifecycleTransitionError } from "./errors";
import type { DocumentThemeConfig } from "./document-theme-config";
import { ALLOWED_VERSION_LIFECYCLE_TRANSITIONS, VersionLifecycleStatus } from "./version-lifecycle-status";

export type DocumentThemeVersionProps = {
  id: string;
  organizationId: string;
  documentThemeId: string;
  version: number;
  status: VersionLifecycleStatus;
  logoStorageKey?: string | undefined;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  config: DocumentThemeConfig;
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | undefined;
  archivedAt?: Date | undefined;
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Mission §6 — créée DRAFT, jamais active d'emblée ; une fois ACTIVE, plus aucun champ ne change
 *  ("une version déjà utilisée dans un export final est immuable"). */
export class DocumentThemeVersion {
  private constructor(private props: DocumentThemeVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    documentThemeId: string;
    version: number;
    logoStorageKey?: string | undefined;
    accentColor?: string | undefined;
    fontFamily?: string | undefined;
    config: DocumentThemeConfig;
    createdBy: string;
    occurredAt: Date;
  }): DocumentThemeVersion {
    if (input.accentColor !== undefined && !HEX_COLOR_PATTERN.test(input.accentColor)) {
      throw new Error("accentColor must be a hex color (#RRGGBB)");
    }
    return new DocumentThemeVersion({
      id: input.id,
      organizationId: input.organizationId,
      documentThemeId: input.documentThemeId,
      version: input.version,
      status: VersionLifecycleStatus.Draft,
      logoStorageKey: input.logoStorageKey,
      accentColor: input.accentColor,
      fontFamily: input.fontFamily,
      config: input.config,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentThemeVersionProps): DocumentThemeVersion {
    return new DocumentThemeVersion(props);
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
  get documentThemeId(): string {
    return this.props.documentThemeId;
  }
  get version(): number {
    return this.props.version;
  }
  get status(): VersionLifecycleStatus {
    return this.props.status;
  }
  get logoStorageKey(): string | undefined {
    return this.props.logoStorageKey;
  }
  get accentColor(): string | undefined {
    return this.props.accentColor;
  }
  get fontFamily(): string | undefined {
    return this.props.fontFamily;
  }
  get config(): DocumentThemeConfig {
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
