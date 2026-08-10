export type PricingScheduleFinalFileProps = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  documentId: string;
  documentVersionId: string;
  injectedCellCount: number;
  generatedBy: string;
  generatedAt: Date;
};

/** Immuable, APPEND-ONLY (mission "snapshot au moment de la génération") — pointeur de provenance
 *  vers un fichier financier final RÉEL (les octets vivent dans Document/DocumentVersion, jamais
 *  ici, mission "jamais un système de stockage parallèle"). Une nouvelle génération pour la même
 *  `PricingScheduleVersion` VALIDATED crée une NOUVELLE ligne, jamais une mise à jour en place. */
export class PricingScheduleFinalFile {
  private constructor(private readonly props: PricingScheduleFinalFileProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    pricingScheduleVersionId: string;
    documentId: string;
    documentVersionId: string;
    injectedCellCount: number;
    generatedBy: string;
    occurredAt: Date;
  }): PricingScheduleFinalFile {
    return new PricingScheduleFinalFile({
      id: input.id,
      organizationId: input.organizationId,
      pricingScheduleVersionId: input.pricingScheduleVersionId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      injectedCellCount: input.injectedCellCount,
      generatedBy: input.generatedBy,
      generatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PricingScheduleFinalFileProps): PricingScheduleFinalFile {
    return new PricingScheduleFinalFile(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get pricingScheduleVersionId(): string {
    return this.props.pricingScheduleVersionId;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get documentVersionId(): string {
    return this.props.documentVersionId;
  }
  get injectedCellCount(): number {
    return this.props.injectedCellCount;
  }
  get generatedBy(): string {
    return this.props.generatedBy;
  }
  get generatedAt(): Date {
    return this.props.generatedAt;
  }
}
