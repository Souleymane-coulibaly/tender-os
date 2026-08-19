import { Inject, Injectable } from "@nestjs/common";
import { CandidateIdentitySource, ResolveCandidateIdentityUseCase } from "../../../candidate-company";
import { GetCompanyProfileUseCase, type CompanyProfileSummary } from "../../../company-profile";
import { ListTenderDocumentsUseCase } from "../../../documents";
import { ListSubcontractorCertificationsUseCase, ListSubcontractorInsurancesUseCase } from "../../../subcontractors";
import {
  assertHasTenderPermission,
  CHECKLIST_ITEM_REPOSITORY,
  ChecklistSubjectType,
  loadChecklistItem,
  TenderPermission,
  type ChecklistItemRepository,
} from "../../../tenders";
import { matchChecklistItemDocuments, type ChecklistDocumentMatchResult } from "../services/checklist-document-matcher";

export type FindChecklistItemDocumentMatchesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  /** V2 Sprint 6 §13 — l'entreprise candidate DU TENDER dont la conformité est évaluée. Jamais
   *  partagée avec une autre entreprise (mission §13). Résolu par l'appelant HTTP (fiche Tender).
   *  Checkpoint 2.1-A6.1 — reste le seul chemin pour un Tender LEGACY (`candidateCompanyId` absent) ;
   *  pour un Tender moderne, `candidateCompanyId` prévaut, voir ci-dessous (NEW FLOW). */
  clientAccountId: string;
  /** Checkpoint 2.1-A6.1 — quand renseigné, `CandidateCompany` fait autorité pour l'identité
   *  candidate de ce Tender (mission A6.1 §9 "jamais company-profile utilisé malgré tout"). */
  candidateCompanyId?: string | undefined;
}>;

/**
 * V2 Sprint 6 §16-17 — recherche de correspondances, PUREMENT EN LECTURE : ne modifie jamais le
 * ChecklistItem. `AttachChecklistItemDocumentUseCase` est le seul point d'écriture, toujours une
 * action utilisateur explicite, même pour un score EXACT_MATCH.
 *
 * Checkpoint 2.1-A6.1 (Candidate SOT) — NEW FLOW / LEGACY FLOW, même discipline qu'A4/A5 (DC1/DC2/
 * DC4, mémoire technique) : `candidateCompanyId` renseigné → `CandidateCompany` fait autorité pour
 * l'identité, donc les CAPACITÉS (certifications/assurances) ne sont JAMAIS lues depuis le profil du
 * CLIENT (`company-profile` via `clientAccountId`) — `CandidateCompany` ne porte encore aucune table
 * satellite (mission A1 §6, DEFERRED-BE-01/A6.1 §7 "LEGACY_ONLY, ne pas inventer un champ Prisma"),
 * donc ces catégories restent honnêtement `NO_MATCH` plutôt que de suggérer les certifications d'une
 * AUTRE entité juridique (le Client) comme preuve pour le Candidat réellement rattaché. `candidateCompanyId`
 * absent (Tender legacy, jamais rétroactivement rempli) → comportement inchangé, retombe sur
 * `company-profile` via `clientAccountId`.
 */
@Injectable()
export class FindChecklistItemDocumentMatchesUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    private readonly listTenderDocumentsUseCase: ListTenderDocumentsUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
    private readonly resolveCandidateIdentityUseCase: ResolveCandidateIdentityUseCase,
    private readonly listSubcontractorCertificationsUseCase: ListSubcontractorCertificationsUseCase,
    private readonly listSubcontractorInsurancesUseCase: ListSubcontractorInsurancesUseCase,
  ) {}

  async execute(query: FindChecklistItemDocumentMatchesQuery): Promise<ChecklistDocumentMatchResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const item = await loadChecklistItem(this.checklistRepository, query);

    const candidateIdentity = await this.resolveCandidateIdentityUseCase.execute({ organizationId: query.organizationId, candidateCompanyId: query.candidateCompanyId });
    const usesCandidateCompany = candidateIdentity.source === CandidateIdentitySource.CandidateCompany;

    const [tenderDocuments, companyProfile] = await Promise.all([
      this.listTenderDocumentsUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole }),
      // NEW FLOW — CandidateCompany fait autorité et ne porte aucune capacité : jamais un repli
      // silencieux sur les certifications/assurances du CLIENT (mission A6.1 §9).
      usesCandidateCompany
        ? Promise.resolve(undefined)
        : this.getCompanyProfileUseCase
            .execute({ organizationId: query.organizationId, clientAccountId: query.clientAccountId, actorId: query.actorId, actorRole: query.actorRole })
            .catch((): CompanyProfileSummary | undefined => undefined),
    ]);

    let subcontractorCertifications: Awaited<ReturnType<ListSubcontractorCertificationsUseCase["execute"]>> = [];
    let subcontractorInsurances: Awaited<ReturnType<ListSubcontractorInsurancesUseCase["execute"]>> = [];
    if (item.subjectType === ChecklistSubjectType.Subcontractor && item.subjectSubcontractorProfileId) {
      const subcontractorQuery = { organizationId: query.organizationId, subcontractorProfileId: item.subjectSubcontractorProfileId, actorId: query.actorId, actorRole: query.actorRole };
      [subcontractorCertifications, subcontractorInsurances] = await Promise.all([
        this.listSubcontractorCertificationsUseCase.execute(subcontractorQuery),
        this.listSubcontractorInsurancesUseCase.execute(subcontractorQuery),
      ]);
    }

    return matchChecklistItemDocuments({
      item,
      tenderDocuments,
      companyProfile,
      subcontractorCertifications,
      subcontractorInsurances,
    });
  }
}
