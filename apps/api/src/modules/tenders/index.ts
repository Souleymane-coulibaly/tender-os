export { TendersModule } from "./tenders.module";
export type { TenderSummary, TenderLotSummary, BuyerSummary, AwardCriterionSummary, RequestedDocumentSummary, MilestoneSummary, RiskSummary } from "./application/dtos";
// Réexporté uniquement pour permettre au module Documents de vérifier qu'un Tender existe et
// appartient à l'organisation active avant d'y associer un document (AttachDocumentToTender/
// ListTenderDocuments) — même motif que les réexports déjà pratiqués par Memberships.
export { GetTenderUseCase } from "./application/use-cases/get-tender.use-case";
export type { GetTenderQuery, GetTenderResult } from "./application/use-cases/get-tender.use-case";

// V2 Sprint 5 — réexporté UNIQUEMENT pour `opportunity` (`PromoteOpportunityToTenderUseCase`) :
// la promotion Opportunity -> Tender délègue la création du Tender à ce use case public, jamais
// une seconde logique de création dupliquée (même motif que `UpdateTenderUseCase` ci-dessous).
export { CreateTenderUseCase } from "./application/use-cases/create-tender.use-case";
export type { CreateTenderCommand, CreateTenderResult } from "./application/use-cases/create-tender.use-case";

// Réexporté uniquement pour un usage système interne (mission Sprint 3 — Extraction lit
// `Tender.language` comme simple indication pour l'OCR, jamais comme vérité absolue) — jamais un
// contournement de la permission Tenders pour un acteur utilisateur. Même motif que les réexports
// internes déjà pratiqués par Documents/DCE (`GetTenderUseCase` reste RBAC-gated : une opération
// système ne doit jamais dépendre d'un rôle d'acteur qui n'existe pas dans ce contexte).
export { TENDER_REPOSITORY } from "./application/ports/tender.repository";
export type { TenderRepository } from "./application/ports/tender.repository";

// V2 Sprint 4 — réexportés UNIQUEMENT pour `ai-suggestion-bridge` : les use cases publics restent
// l'unique point d'écriture (jamais Prisma, jamais un repository pour écrire) ; les ports de
// repository ci-dessous ne sont réutilisés qu'en LECTURE SEULE (détection de conflit — la cible
// porte-t-elle déjà une valeur ?).
export { UpdateTenderUseCase } from "./application/use-cases/update-tender.use-case";
export type { UpdateTenderCommand } from "./application/use-cases/update-tender.use-case";
export { GetTenderLotUseCase } from "./application/use-cases/get-tender-lot.use-case";
export { CreateTenderLotUseCase } from "./application/use-cases/create-tender-lot.use-case";
export type { CreateTenderLotCommand } from "./application/use-cases/create-tender-lot.use-case";
export { UpdateTenderLotUseCase } from "./application/use-cases/update-tender-lot.use-case";
export type { UpdateTenderLotCommand } from "./application/use-cases/update-tender-lot.use-case";
export { TENDER_LOT_REPOSITORY } from "./application/ports/tender-lot.repository";
export type { TenderLotRepository } from "./application/ports/tender-lot.repository";

export { CreateAwardCriterionUseCase } from "./application/use-cases/create-award-criterion.use-case";
export type { CreateAwardCriterionCommand } from "./application/use-cases/create-award-criterion.use-case";
export { UpdateAwardCriterionUseCase } from "./application/use-cases/update-award-criterion.use-case";
export type { UpdateAwardCriterionCommand } from "./application/use-cases/update-award-criterion.use-case";
export { AWARD_CRITERION_REPOSITORY } from "./application/ports/award-criterion.repository";
export type { AwardCriterionRepository } from "./application/ports/award-criterion.repository";

export { CreateRequestedDocumentUseCase } from "./application/use-cases/create-requested-document.use-case";
export type { CreateRequestedDocumentCommand } from "./application/use-cases/create-requested-document.use-case";
export { UpdateRequestedDocumentUseCase } from "./application/use-cases/update-requested-document.use-case";
export type { UpdateRequestedDocumentCommand } from "./application/use-cases/update-requested-document.use-case";
export { REQUESTED_DOCUMENT_REPOSITORY } from "./application/ports/requested-document.repository";
export type { RequestedDocumentRepository } from "./application/ports/requested-document.repository";

export { CreateMilestoneUseCase } from "./application/use-cases/create-milestone.use-case";
export type { CreateMilestoneCommand } from "./application/use-cases/create-milestone.use-case";
export { UpdateMilestoneUseCase } from "./application/use-cases/update-milestone.use-case";
export type { UpdateMilestoneCommand } from "./application/use-cases/update-milestone.use-case";
export { MILESTONE_REPOSITORY } from "./application/ports/milestone.repository";
export type { MilestoneRepository } from "./application/ports/milestone.repository";

export { CreateRiskUseCase } from "./application/use-cases/create-risk.use-case";
export type { CreateRiskCommand } from "./application/use-cases/create-risk.use-case";
export { UpdateRiskUseCase } from "./application/use-cases/update-risk.use-case";
export type { UpdateRiskCommand } from "./application/use-cases/update-risk.use-case";
export { RISK_REPOSITORY } from "./application/ports/risk.repository";
export type { RiskRepository } from "./application/ports/risk.repository";

export { CreateBuyerUseCase, UpdateBuyerUseCase } from "./application/use-cases/buyer.use-cases";
export type { BuyerFields, CreateBuyerCommand } from "./application/use-cases/buyer.use-cases";
export { BUYER_REPOSITORY } from "./application/ports/buyer.repository";
export type { BuyerRepository } from "./application/ports/buyer.repository";

export { TenderNotFoundError, TenderLotNotFoundError, AwardCriterionNotFoundError, RequestedDocumentNotFoundError, MilestoneNotFoundError, RiskNotFoundError, BuyerNotFoundError, TenderPermissionMissingError } from "./domain/errors";

// V2 Sprint 5 — réexportés UNIQUEMENT pour `opportunity` (Niveau 2 : génération/régénération de
// GoNoGoReport, enregistrement de GoNoGoDecision au niveau Tender) — réutilise TEL QUEL le système
// de permissions Tenders existant, jamais une seconde matrice de rôles.
export { TenderPermission, roleHasTenderPermission } from "./domain/tender-permission";
export { assertHasTenderPermission } from "./application/policies/tender-authorization.policy";

// V2 Sprint 5 — `REQUESTED_DOCUMENT_REPOSITORY`/`TENDER_LOT_REPOSITORY` déjà exportés ci-dessus
// (pour `ai-suggestion-bridge`) sont réutilisés EN LECTURE SEULE par `opportunity` (calcul du
// GoNoGoReport Niveau 2) — seuls les types de valeur des entités manquaient encore.
export { RequestedDocumentStatus } from "./domain/requested-document.entity";
export type { RequestedDocument } from "./domain/requested-document.entity";
export type { TenderLot } from "./domain/tender-lot.entity";

// V2 Sprint 6 — réexportés pour `ai-suggestion-bridge` (nouvel adaptateur CHECKLIST_ITEM, même
// motif que Milestone/Risk/RequestedDocument ci-dessus) ET pour le nouveau module cross-cutting
// `checklist-intelligence` (rapprochement documentaire + réconciliation nouvelle analyse, qui ne
// peuvent pas vivre DANS `tenders` : `documents`/`analysis` importent déjà `TendersModule`, un
// import inverse créerait un cycle).
export { CreateChecklistItemUseCase } from "./application/use-cases/create-checklist-item.use-case";
export type { CreateChecklistItemCommand } from "./application/use-cases/create-checklist-item.use-case";
export { UpdateChecklistItemUseCase } from "./application/use-cases/update-checklist-item.use-case";
export type { UpdateChecklistItemCommand } from "./application/use-cases/update-checklist-item.use-case";
export { loadChecklistItem } from "./application/use-cases/update-checklist-item.use-case";
export { ValidateChecklistItemUseCase, MarkChecklistItemNotApplicableUseCase } from "./application/use-cases/validate-checklist-item.use-case";
export { GetChecklistProgressUseCase } from "./application/use-cases/get-checklist-progress.use-case";
export { CHECKLIST_ITEM_REPOSITORY } from "./application/ports/checklist-item.repository";
export type { ChecklistItemRepository } from "./application/ports/checklist-item.repository";
export { findChecklistDedupMatch } from "./application/services/checklist-dedup";
export { assertTenderMutationAllowed, assertLotBelongsToTender } from "./application/policies/tender-mutation-client-access.helper";
export { ChecklistItem, ChecklistItemType, ChecklistRequirementLevel, ChecklistItemCriticality, ChecklistComplianceStatus, ChecklistDocumentStatus, ChecklistItemOrigin, ChecklistSubjectType, ChecklistDocumentMatchStatus } from "./domain/checklist-item.entity";
export type { ChecklistDocumentMatch } from "./domain/checklist-item.entity";
export { ChecklistItemNotFoundError, ChecklistSubcontractorSubjectNotFoundError, InvalidChecklistSubjectError } from "./domain/errors";
export type { ChecklistItemSummary } from "./application/dtos";
export { toChecklistItemSummary } from "./application/dtos";
// V2 Sprint 6 (correctif audit Codex P2) — port réexporté UNIQUEMENT pour le pont @Global()
// `SubcontractorSubjectValidationBridgeModule` (module `subcontractors`), qui fournit
// l'implémentation réelle sans jamais créer de cycle Nest (voir subcontractor-subject-validator.ts).
export { SUBCONTRACTOR_SUBJECT_VALIDATOR } from "./application/ports/subcontractor-subject-validator";
export type { SubcontractorSubjectValidator } from "./application/ports/subcontractor-subject-validator";
export { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
export type { AuditLogWriter, TenderAuditLogEntry } from "./application/ports/audit-log-writer";

// V2 Sprint 15 (Dashboard opérationnel) — réexportés UNIQUEMENT pour `dashboard` : les KPI/pipeline
// (score de préparation, risques, échéances, "à traiter") réutilisent EXACTEMENT le moteur de
// lecture déjà éprouvé par la vue Statistiques/Liste Tenders (mission §53 "le Dashboard est une
// projection/read model, il ne doit pas réimplémenter la logique métier"), jamais un second calcul
// de readiness/pipeline dupliqué. Restent RBAC/ClientAccess-gated exactement comme leurs appelants
// existants (`TendersController`) — Dashboard ne contourne rien, il consomme le même chemin qu'un
// acteur humain sur la vue Tenders.
export { GetTenderStatisticsUseCase } from "./application/use-cases/get-tender-statistics.use-case";
export type { GetTenderStatisticsQuery } from "./application/use-cases/get-tender-statistics.use-case";
export { GetTenderListViewUseCase } from "./application/use-cases/get-tender-list-view.use-case";
export type { GetTenderListViewQuery, GetTenderListViewResult } from "./application/use-cases/get-tender-list-view.use-case";
export type { TenderStatisticsDto, TenderListItemDto, TenderBoardItemDto } from "./application/board-dtos";
export { ReadinessStatus } from "./domain/readiness-status";
export { TenderStatus, isTenderStatus } from "./domain/tender-status";

// V2 Sprint 16 (Integration Hub) — réexportés UNIQUEMENT pour `integrations` (Public API en
// lecture seule) : même repository que `ListTendersUseCase`/`GetTenderUseCase`, mais le périmètre
// ClientAccess est fourni directement par l'appelant (principal technique ApiKey, jamais un
// `actorId` humain — `ListAccessibleClientsUseCase` ne s'applique pas à ce principal).
export { ListTendersForPublicApiUseCase } from "./application/use-cases/list-tenders-for-public-api.use-case";
export type { ListTendersForPublicApiQuery, ListTendersForPublicApiResult } from "./application/use-cases/list-tenders-for-public-api.use-case";
export { GetTenderForPublicApiUseCase } from "./application/use-cases/get-tender-for-public-api.use-case";
export type { GetTenderForPublicApiQuery } from "./application/use-cases/get-tender-for-public-api.use-case";
