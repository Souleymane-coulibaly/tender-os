import { InvalidSectionSelectionError } from "./errors";
import { ExportSectionSource, isExportSectionSource } from "./export-section-source";

export const ExportSectionValidationStatus = {
  Validated: "VALIDATED",
  NotValidated: "NOT_VALIDATED",
  Unknown: "UNKNOWN",
} as const;
export type ExportSectionValidationStatus = (typeof ExportSectionValidationStatus)[keyof typeof ExportSectionValidationStatus];

export type ExportSectionSelectionProps = Readonly<{
  sectionId: string;
  taskType?: string | undefined;
  sourceType: ExportSectionSource;
  generationId?: string | undefined;
  /** Mission (audit de correction) — l'identifiant réel de l'ESTIMATION `PricingEstimate.id`,
   *  jamais l'identifiant d'une version : `GetPricingEstimateQuery` n'accepte que
   *  `{ estimateId, version? }`, jamais un identifiant de version directement. Renommé depuis
   *  `pricingEstimateVersionId` (bug réel : ce champ était utilisé comme un `estimateId` mais
   *  nommé/documenté comme un identifiant de version — l'export ne gelait donc jamais une
   *  version précise, il affichait toujours la version COURANTE au moment du rendu). */
  pricingEstimateId?: string | undefined;
  /** Le numéro de version PRÉCIS à figer (mission "un export fige exactement une ancienne
   *  version, ne bascule jamais sur la version courante") — absent = version courante au moment
   *  de la sélection, explicitement, jamais un défaut implicite silencieux. */
  pricingEstimateVersionNumber?: number | undefined;
  manualContent?: string | undefined;
  validationStatus: ExportSectionValidationStatus;
  selectedBy: string;
  selectedAt: Date;
  order: number;
  notes?: string | undefined;
}>;

/**
 * Une section incluse dans un export (mission Sprint 8A §17/§20) — conserve la provenance
 * minimale pour reconstruire exactement les sources d'un export historique. Valeur immuable :
 * un export final ne réutilise jamais une sélection mutée, il en clone une nouvelle (voir
 * `ExportJob.createFinalFrom`).
 */
export class ExportSectionSelection {
  private constructor(private readonly props: ExportSectionSelectionProps) {}

  static create(input: ExportSectionSelectionProps): ExportSectionSelection {
    if (!input.sectionId.trim()) {
      throw new InvalidSectionSelectionError("sectionId is required");
    }
    if (!isExportSectionSource(input.sourceType)) {
      throw new InvalidSectionSelectionError(`unknown sourceType "${input.sourceType}"`);
    }
    if (input.sourceType === ExportSectionSource.Generation && !input.generationId) {
      throw new InvalidSectionSelectionError("a GENERATION section requires a generationId");
    }
    if (input.sourceType === ExportSectionSource.Pricing && !input.pricingEstimateId) {
      throw new InvalidSectionSelectionError("a PRICING section requires a pricingEstimateId");
    }
    if (input.sourceType === ExportSectionSource.Manual && !input.manualContent?.trim()) {
      throw new InvalidSectionSelectionError("a MANUAL section requires manualContent");
    }
    if (input.order < 0 || !Number.isInteger(input.order)) {
      throw new InvalidSectionSelectionError("order must be a non-negative integer");
    }
    return new ExportSectionSelection(input);
  }

  get sectionId(): string {
    return this.props.sectionId;
  }
  get taskType(): string | undefined {
    return this.props.taskType;
  }
  get sourceType(): ExportSectionSource {
    return this.props.sourceType;
  }
  get generationId(): string | undefined {
    return this.props.generationId;
  }
  get pricingEstimateId(): string | undefined {
    return this.props.pricingEstimateId;
  }
  get pricingEstimateVersionNumber(): number | undefined {
    return this.props.pricingEstimateVersionNumber;
  }
  get manualContent(): string | undefined {
    return this.props.manualContent;
  }
  get validationStatus(): ExportSectionValidationStatus {
    return this.props.validationStatus;
  }
  get selectedBy(): string {
    return this.props.selectedBy;
  }
  get selectedAt(): Date {
    return this.props.selectedAt;
  }
  get order(): number {
    return this.props.order;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
}
