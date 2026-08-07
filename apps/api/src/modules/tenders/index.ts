export { TendersModule } from "./tenders.module";
export type { TenderSummary, TenderLotSummary, BuyerSummary, AwardCriterionSummary, RequestedDocumentSummary, MilestoneSummary, RiskSummary } from "./application/dtos";
// Réexporté uniquement pour permettre au module Documents de vérifier qu'un Tender existe et
// appartient à l'organisation active avant d'y associer un document (AttachDocumentToTender/
// ListTenderDocuments) — même motif que les réexports déjà pratiqués par Memberships.
export { GetTenderUseCase } from "./application/use-cases/get-tender.use-case";
export type { GetTenderQuery, GetTenderResult } from "./application/use-cases/get-tender.use-case";

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

export { TenderNotFoundError, TenderLotNotFoundError, AwardCriterionNotFoundError, RequestedDocumentNotFoundError, MilestoneNotFoundError, RiskNotFoundError, BuyerNotFoundError } from "./domain/errors";
