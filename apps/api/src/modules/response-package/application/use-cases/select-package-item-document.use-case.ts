import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import {
  DOCUMENT_REPOSITORY,
  DOCUMENT_TENDER_ASSOCIATION_REPOSITORY,
  DOCUMENT_VERSION_REPOSITORY,
  type DocumentRepository,
  type DocumentTenderAssociationRepository,
  type DocumentVersionRepository,
} from "../../../documents";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../../../tenders";
import { PackageItemNotFoundError } from "../../domain/errors";
import type { PackageItem } from "../../domain/package-item.entity";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { PackageItemEditGuard } from "../services/package-item-edit-guard.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";

export type SelectPackageItemDocumentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  packageItemId: string;
  documentId: string;
  documentVersionId: string;
  requestId?: string | undefined;
}>;

/** Mission §71/§89 — résolution explicite d'un matching ambigu ou rattachement direct. Mission
 *  §86/§89 "impossible d'inclure un fichier arbitraire par storageKey" : `documentId`/
 *  `documentVersionId` sont TOUJOURS revérifiés contre le module Documents (jamais fait confiance
 *  au corps de la requête tel quel) — un document/une version inexistant(e) OU d'une AUTRE
 *  organisation échoue explicitement, jamais un rattachement silencieux.
 *
 *  Correctif audit Codex RP-P1-01 — vérifier l'existence du document dans l'ORGANISATION ne
 *  suffisait pas : un document appartenant à un AUTRE client/Tender de la MÊME organisation
 *  passait la vérification précédente. `DocumentTenderAssociationRepository.exists(...)` revérifie
 *  en plus que ce document est structurellement rattaché au MÊME Tender que ce dossier de réponse
 *  (mission §8/§81 "jamais mélanger silencieusement les documents de plusieurs lots/clients") —
 *  jamais une simple confiance dans "existe quelque part dans l'organisation".
 *
 *  Correctif audit Codex round 2 (réserve bloquante restante) — "même Tender" ne suffit pas non
 *  plus pour un `ResponsePackage` scopé à un LOT précis : un `Document` n'a structurellement AUCUNE
 *  notion de lot nulle part dans ce dépôt (`DocumentTenderAssociation` ne porte que
 *  organizationId/documentId/tenderId, confirmé par grep exhaustif) — il n'existe donc PAS de
 *  signal positif fiable "ce document est destiné au lot 1" pour un document jamais rapproché d'une
 *  Checklist (mission §71 : la sélection manuelle résout justement une AMBIGUÏTÉ ou une ABSENCE de
 *  matching automatique — exiger un match préexistant casserait ce cas légitime).
 *
 *  La règle retenue est donc NÉGATIVE, pas positive : un document explicitement rapproché (mission
 *  §16-18 `ChecklistItem.matchedDocumentId`, Sprint 6) d'un `ChecklistItem` d'un AUTRE lot
 *  spécifique de ce même Tender (jamais un item Tender-global, `lotId undefined`) est REFUSÉ pour
 *  ce package — c'est le seul cas où ce dépôt connaît réellement "ce document est destiné à un
 *  AUTRE lot" (le scénario exact remonté : document déjà rapproché du Lot 2, sélectionné pour le
 *  Lot 1). Un document jamais rapproché d'AUCUN `ChecklistItem`, ou rapproché de CE lot, ou d'un
 *  item Tender-global, reste sélectionnable — jamais une sur-restriction qui bloquerait le
 *  rattachement manuel légitime d'un document encore non classifié. Pour un package "tous lots"
 *  (`lotId` absent), cette règle ne s'applique pas — la vérification "même Tender" reste
 *  suffisante. */
@Injectable()
export class SelectPackageItemDocumentUseCase {
  constructor(
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(DOCUMENT_TENDER_ASSOCIATION_REPOSITORY) private readonly documentTenderAssociationRepository: DocumentTenderAssociationRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: ResponsePackageAccessService,
    private readonly editGuard: PackageItemEditGuard,
  ) {}

  async execute(command: SelectPackageItemDocumentCommand): Promise<PackageItem> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: command.organizationId,
      responsePackageId: command.responsePackageId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageResponsePackage,
      requireUseOrgPermission: true,
    });

    const { item } = await this.editGuard.loadEditableItem({ organizationId: command.organizationId, responsePackageId: command.responsePackageId, packageItemId: command.packageItemId });

    const document = await this.documentRepository.findById({ organizationId: command.organizationId, documentId: command.documentId });
    if (!document) {
      throw new PackageItemNotFoundError();
    }
    const version = await this.documentVersionRepository.findById({ organizationId: command.organizationId, documentId: command.documentId, versionId: command.documentVersionId });
    if (!version) {
      throw new PackageItemNotFoundError();
    }
    const belongsToThisTender = await this.documentTenderAssociationRepository.exists({ organizationId: command.organizationId, documentId: command.documentId, tenderId: pkg.tenderId });
    if (!belongsToThisTender) {
      throw new PackageItemNotFoundError();
    }

    if (pkg.lotId) {
      const checklistItems = await this.checklistItemRepository.listByTender({ organizationId: command.organizationId, tenderId: pkg.tenderId });
      const matches = checklistItems.filter((checklistItem) => checklistItem.matchedDocumentId === command.documentId);
      const claimedByThisLotOrGlobal = matches.some((checklistItem) => checklistItem.lotId === undefined || checklistItem.lotId === pkg.lotId);
      const claimedByAnotherLot = matches.some((checklistItem) => checklistItem.lotId !== undefined && checklistItem.lotId !== pkg.lotId);
      if (claimedByAnotherLot && !claimedByThisLotOrGlobal) {
        throw new PackageItemNotFoundError();
      }
    }

    const occurredAt = this.clock.now();
    item.setDocument({ documentId: command.documentId, documentVersionId: command.documentVersionId, occurredAt });
    await this.itemRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "response_package.item_document_selected",
      resourceType: "package_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { responsePackageId: command.responsePackageId, documentId: command.documentId, documentVersionId: command.documentVersionId },
    });

    return item;
  }
}
