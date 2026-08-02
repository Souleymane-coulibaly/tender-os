import type { DeliverableRevision } from "./deliverable-revision.aggregate";
import { RevisionNotValidatedForExportError } from "./errors";

export type DeliverableExportSelectionProps = {
  id: string;
  organizationId: string;
  deliverableSectionId: string;
  deliverableRevisionId: string;
  selectedBy: string;
  selectedAt: Date;
  justification?: string | undefined;
};

const MAX_JUSTIFICATION_LENGTH = 2000;

/**
 * Mission Sprint 8A.1 §11 — "règle absolue" : seule une révision explicitement VALIDÉE peut être
 * sélectionnée pour l'export ; "le dernier brouillon non validé n'est jamais utilisé
 * automatiquement". Le constructeur reçoit l'agrégat `DeliverableRevision` lui-même (pas un simple
 * id) pour que cette invariante soit imposée PAR LE DOMAINE, jamais seulement par une vérification
 * applicative facultative.
 */
export class DeliverableExportSelection {
  private constructor(private readonly props: DeliverableExportSelectionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableSectionId: string;
    revision: DeliverableRevision;
    selectedBy: string;
    justification?: string | undefined;
    occurredAt: Date;
  }): DeliverableExportSelection {
    if (!input.revision.isValidated) {
      throw new RevisionNotValidatedForExportError();
    }
    if (input.revision.deliverableSectionId !== input.deliverableSectionId) {
      throw new Error("the revision does not belong to the given section");
    }
    if (input.justification !== undefined && input.justification.length > MAX_JUSTIFICATION_LENGTH) {
      throw new Error(`justification must not exceed ${MAX_JUSTIFICATION_LENGTH} characters`);
    }
    return new DeliverableExportSelection({
      id: input.id,
      organizationId: input.organizationId,
      deliverableSectionId: input.deliverableSectionId,
      deliverableRevisionId: input.revision.id,
      selectedBy: input.selectedBy,
      selectedAt: input.occurredAt,
      justification: input.justification,
    });
  }

  static rehydrate(props: DeliverableExportSelectionProps): DeliverableExportSelection {
    return new DeliverableExportSelection(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableSectionId(): string {
    return this.props.deliverableSectionId;
  }
  get deliverableRevisionId(): string {
    return this.props.deliverableRevisionId;
  }
  get selectedBy(): string {
    return this.props.selectedBy;
  }
  get selectedAt(): Date {
    return this.props.selectedAt;
  }
  get justification(): string | undefined {
    return this.props.justification;
  }
}
