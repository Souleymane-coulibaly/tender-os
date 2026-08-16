import { Inject, Injectable } from "@nestjs/common";
import { ADMINISTRATIVE_DOCUMENT_REPOSITORY, type AdministrativeDocumentRepository } from "../ports/administrative-document.repository";

/**
 * V2 Sprint 25 (Dashboard Premium — checklist d'activation) — mission §25.69/§25.70 "Ajouter les
 * documents administratifs" doit être dérivé de l'état réel, jamais un second état manuel.
 * Existence org-wide uniquement (jamais un décompte ni une liste) : le seul signal dont la
 * checklist a besoin.
 */
@Injectable()
export class HasAnyAdministrativeDocumentUseCase {
  constructor(@Inject(ADMINISTRATIVE_DOCUMENT_REPOSITORY) private readonly repository: AdministrativeDocumentRepository) {}

  async execute(query: { organizationId: string }): Promise<boolean> {
    return this.repository.existsForOrganization(query.organizationId);
  }
}
