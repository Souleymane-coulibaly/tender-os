import { Inject, Injectable } from "@nestjs/common";
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
   *  partagée avec une autre entreprise (mission §13). Résolu par l'appelant HTTP (fiche Tender). */
  clientAccountId: string;
}>;

/**
 * V2 Sprint 6 §16-17 — recherche de correspondances, PUREMENT EN LECTURE : ne modifie jamais le
 * ChecklistItem. `AttachChecklistItemDocumentUseCase` est le seul point d'écriture, toujours une
 * action utilisateur explicite, même pour un score EXACT_MATCH.
 */
@Injectable()
export class FindChecklistItemDocumentMatchesUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    private readonly listTenderDocumentsUseCase: ListTenderDocumentsUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
    private readonly listSubcontractorCertificationsUseCase: ListSubcontractorCertificationsUseCase,
    private readonly listSubcontractorInsurancesUseCase: ListSubcontractorInsurancesUseCase,
  ) {}

  async execute(query: FindChecklistItemDocumentMatchesQuery): Promise<ChecklistDocumentMatchResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const item = await loadChecklistItem(this.checklistRepository, query);

    const [tenderDocuments, companyProfile] = await Promise.all([
      this.listTenderDocumentsUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole }),
      this.getCompanyProfileUseCase
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
