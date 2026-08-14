import { Inject, Injectable } from "@nestjs/common";
import { DOCUMENT_VERSION_REPOSITORY, type DocumentVersionRepository } from "../ports/document-version.repository";

/**
 * V2 Sprint 22 (billing, étape 22D) — vue en LECTURE consommée par l'écran "Abonnement &
 * utilisation" (mission §45) et Platform Admin, réexportée en LECTURE SEULE pour `billing` — même
 * motif que `ListTenderDocumentsUseCase`/`AttachDocumentToTenderUseCase` déjà réexportés pour un
 * usage cross-module, jamais un second accès Prisma direct (mission Dashboard Sprint 15 : "jamais
 * un accès Prisma cross-module direct").
 */
@Injectable()
export class GetOrganizationStorageUsageUseCase {
  constructor(@Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository) {}

  async execute(organizationId: string): Promise<number> {
    return this.documentVersionRepository.sumStorageBytesForOrganization(organizationId);
  }
}
