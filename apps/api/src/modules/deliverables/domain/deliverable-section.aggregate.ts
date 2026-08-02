import { DeliverableSectionLockedError } from "./errors";
import { DeliverableSectionStatus } from "./deliverable-section-status";

export type DeliverableSectionProps = {
  id: string;
  organizationId: string;
  deliverableId: string;
  code: string;
  title: string;
  order: number;
  headingLevel: 1 | 2 | 3;
  mandatory: boolean;
  hidden: boolean;
  locked: boolean;
  status: DeliverableSectionStatus;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_CODE_LENGTH = 80;
const MAX_TITLE_LENGTH = 300;

/**
 * Mission Sprint 8A.1 §4 — une section peut être obligatoire/facultative/masquée/verrouillée
 * (mission §4 "peut être : obligatoire, facultative, conditionnelle, masquée, verrouillée..."). Le
 * contenu réel vit exclusivement sur `DeliverableRevision` ; `status` est CALCULÉ (voir
 * `deriveDeliverableSectionStatus`), jamais transité librement ici.
 */
export class DeliverableSection {
  private constructor(private props: DeliverableSectionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableId: string;
    code: string;
    title: string;
    order: number;
    headingLevel: 1 | 2 | 3;
    mandatory: boolean;
    hidden?: boolean | undefined;
    locked?: boolean | undefined;
    occurredAt: Date;
  }): DeliverableSection {
    const code = input.code.trim();
    const title = input.title.trim();
    if (!code || code.length > MAX_CODE_LENGTH) {
      throw new Error(`code must be between 1 and ${MAX_CODE_LENGTH} characters`);
    }
    if (!title || title.length > MAX_TITLE_LENGTH) {
      throw new Error(`title must be between 1 and ${MAX_TITLE_LENGTH} characters`);
    }
    return new DeliverableSection({
      id: input.id,
      organizationId: input.organizationId,
      deliverableId: input.deliverableId,
      code,
      title,
      order: input.order,
      headingLevel: input.headingLevel,
      mandatory: input.mandatory,
      hidden: input.hidden ?? false,
      locked: input.locked ?? false,
      status: DeliverableSectionStatus.NotStarted,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableSectionProps): DeliverableSection {
    return new DeliverableSection(props);
  }

  applyComputedStatus(status: DeliverableSectionStatus, occurredAt: Date): void {
    this.props.status = status;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §4 "verrouillée" — bloque toute nouvelle révision/édition tant que verrouillée. */
  assertEditable(): void {
    if (this.props.locked) {
      throw new DeliverableSectionLockedError();
    }
  }

  lock(occurredAt: Date): void {
    this.props.locked = true;
    this.props.updatedAt = occurredAt;
  }

  unlock(occurredAt: Date): void {
    this.props.locked = false;
    this.props.updatedAt = occurredAt;
  }

  hide(occurredAt: Date): void {
    this.props.hidden = true;
    this.props.updatedAt = occurredAt;
  }

  show(occurredAt: Date): void {
    this.props.hidden = false;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableId(): string {
    return this.props.deliverableId;
  }
  get code(): string {
    return this.props.code;
  }
  get title(): string {
    return this.props.title;
  }
  get order(): number {
    return this.props.order;
  }
  get headingLevel(): 1 | 2 | 3 {
    return this.props.headingLevel;
  }
  get mandatory(): boolean {
    return this.props.mandatory;
  }
  get hidden(): boolean {
    return this.props.hidden;
  }
  get locked(): boolean {
    return this.props.locked;
  }
  get status(): DeliverableSectionStatus {
    return this.props.status;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
