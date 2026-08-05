import type { AdministrativeFormType } from "./administrative-form-type";

export type AdministrativeFormDraftProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  documentType: AdministrativeFormType;
  /** Chaîne vide si sans sous-portée (DC1/ATTRI1) — jamais `undefined`, voir contrainte DB. */
  scopeId: string;
  data: Record<string, unknown>;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C.1 — brouillon éditable d'un formulaire officiel avant génération de l'Annexe TenderOS
 * (mission §2 "enregistrer un brouillon"). Un blob JSON borné — mission "pas de moteur de
 * formulaire dynamique abstrait" — jamais un modèle relationnel par champ.
 */
export class AdministrativeFormDraft {
  private constructor(private props: AdministrativeFormDraftProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    documentType: AdministrativeFormType;
    scopeId?: string | undefined;
    data: Record<string, unknown>;
    updatedBy: string;
    occurredAt: Date;
  }): AdministrativeFormDraft {
    return new AdministrativeFormDraft({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      documentType: input.documentType,
      scopeId: input.scopeId ?? "",
      data: input.data,
      updatedBy: input.updatedBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AdministrativeFormDraftProps): AdministrativeFormDraft {
    return new AdministrativeFormDraft(props);
  }

  /** Remplace le blob de données — mission "l'override reste local au brouillon, jamais une
   *  écriture automatique sur la fiche Organisation/Client de référence" (appliqué par l'appelant,
   *  cet agrégat ne touche jamais une autre agrégat). */
  updateData(input: { data: Record<string, unknown>; updatedBy: string; occurredAt: Date }): void {
    this.props.data = input.data;
    this.props.updatedBy = input.updatedBy;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get documentType(): AdministrativeFormType {
    return this.props.documentType;
  }
  get scopeId(): string {
    return this.props.scopeId;
  }
  get data(): Record<string, unknown> {
    return this.props.data;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
