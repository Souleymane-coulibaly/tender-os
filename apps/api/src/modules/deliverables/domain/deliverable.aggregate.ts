import { DeliverableStatus } from "./deliverable-status";
import type { DeliverableType } from "./deliverable-type";
import { DeliverableCostReportAlreadyFrozenError } from "./errors";
import type { ScopeLevel } from "./scope-level";

export type DeliverableProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  type: DeliverableType;
  status: DeliverableStatus;
  templateVersionId?: string | undefined;
  templateSourceLevel?: ScopeLevel | undefined;
  themeVersionId?: string | undefined;
  themeSourceLevel?: ScopeLevel | undefined;
  themeSelectedBy?: string | undefined;
  themeSelectedAt?: Date | undefined;
  approvedBy?: string | undefined;
  approvedAt?: Date | undefined;
  /** Correctif audit Codex P1-002 — le rapport financier (COST_REPORT) référence explicitement une
   *  version Sprint 7 FIGÉE (pricingEstimateId + numéro de version précis), jamais "la dernière
   *  estimation courante" par défaut. Une fois sélectionnée, cette référence est immuable : un
   *  recalcul Sprint 7 ultérieur ne modifie jamais un rapport déjà figé. */
  costReportPricingEstimateId?: string | undefined;
  costReportPricingEstimateVersionNumber?: number | undefined;
  costReportSelectedBy?: string | undefined;
  costReportSelectedAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Mission Sprint 8A.1 §3/§15 — un espace Livrables métier par Tender, un `Deliverable` par
 * `(tenderId, type)` (mission "au minimum" 9 livrables, jamais dupliqué). `status` est CALCULÉ côté
 * backend (voir `deriveDeliverableStatus`) : cet agrégat expose uniquement un setter de confiance
 * (`applyComputedStatus`), jamais une transition libre appelable depuis un contrôleur.
 */
export class Deliverable {
  private constructor(private props: DeliverableProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    type: DeliverableType;
    createdBy: string;
    occurredAt: Date;
  }): Deliverable {
    return new Deliverable({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      type: input.type,
      status: DeliverableStatus.NotStarted,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableProps): Deliverable {
    return new Deliverable(props);
  }

  /** Mission §15 — appelé UNIQUEMENT par le service applicatif de recalcul de statut, jamais
   *  directement par un contrôleur (le calcul réel vit dans `deriveDeliverableStatus`). */
  applyComputedStatus(status: DeliverableStatus, occurredAt: Date): void {
    this.props.status = status;
    this.props.updatedAt = occurredAt;
  }

  /** Mission §5 — la priorité RÉELLEMENT utilisée (TENDER > CLIENT > ORGANIZATION) est toujours
   *  conservée explicitement, "aucune fusion silencieuse incohérente". */
  attachTemplate(input: { templateVersionId: string; sourceLevel: ScopeLevel; occurredAt: Date }): void {
    this.props.templateVersionId = input.templateVersionId;
    this.props.templateSourceLevel = input.sourceLevel;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §6 — conserve `themeVersionId`/`sourceLevel`/`selectedBy`/`selectedAt` à chaque
   *  (re)sélection explicite d'un thème documentaire. */
  attachTheme(input: { themeVersionId: string; sourceLevel: ScopeLevel; selectedBy: string; occurredAt: Date }): void {
    this.props.themeVersionId = input.themeVersionId;
    this.props.themeSourceLevel = input.sourceLevel;
    this.props.themeSelectedBy = input.selectedBy;
    this.props.themeSelectedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §15 — fait explicite, jamais déduit automatiquement des sections : appelé UNIQUEMENT
   *  par `ApproveDeliverableUseCase` après vérification que toutes les sections visibles sont
   *  VALIDÉES (cette vérification reste applicative, elle a besoin des sections, invisibles ici). */
  markApproved(input: { approvedBy: string; occurredAt: Date }): void {
    this.props.approvedBy = input.approvedBy;
    this.props.approvedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
  }

  /** Correctif audit Codex P1-002 — fige la référence pricing utilisée par le rapport financier.
   *  Immuable une fois posée : une seconde sélection portant sur une AUTRE estimation/version est
   *  refusée (jamais un remplacement silencieux d'un rapport déjà figé) ; re-sélectionner EXACTEMENT
   *  la même paire (estimateId, versionNumber) est un no-op toléré (idempotence). */
  selectCostReportEstimate(input: { pricingEstimateId: string; versionNumber: number; selectedBy: string; occurredAt: Date }): void {
    if (
      this.props.costReportPricingEstimateId !== undefined &&
      (this.props.costReportPricingEstimateId !== input.pricingEstimateId || this.props.costReportPricingEstimateVersionNumber !== input.versionNumber)
    ) {
      throw new DeliverableCostReportAlreadyFrozenError();
    }
    this.props.costReportPricingEstimateId = input.pricingEstimateId;
    this.props.costReportPricingEstimateVersionNumber = input.versionNumber;
    this.props.costReportSelectedBy = input.selectedBy;
    this.props.costReportSelectedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
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
  get type(): DeliverableType {
    return this.props.type;
  }
  get status(): DeliverableStatus {
    return this.props.status;
  }
  get templateVersionId(): string | undefined {
    return this.props.templateVersionId;
  }
  get templateSourceLevel(): ScopeLevel | undefined {
    return this.props.templateSourceLevel;
  }
  get themeVersionId(): string | undefined {
    return this.props.themeVersionId;
  }
  get themeSourceLevel(): ScopeLevel | undefined {
    return this.props.themeSourceLevel;
  }
  get themeSelectedBy(): string | undefined {
    return this.props.themeSelectedBy;
  }
  get themeSelectedAt(): Date | undefined {
    return this.props.themeSelectedAt;
  }
  get approvedBy(): string | undefined {
    return this.props.approvedBy;
  }
  get approvedAt(): Date | undefined {
    return this.props.approvedAt;
  }
  get costReportPricingEstimateId(): string | undefined {
    return this.props.costReportPricingEstimateId;
  }
  get costReportPricingEstimateVersionNumber(): number | undefined {
    return this.props.costReportPricingEstimateVersionNumber;
  }
  get costReportSelectedBy(): string | undefined {
    return this.props.costReportSelectedBy;
  }
  get costReportSelectedAt(): Date | undefined {
    return this.props.costReportSelectedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
