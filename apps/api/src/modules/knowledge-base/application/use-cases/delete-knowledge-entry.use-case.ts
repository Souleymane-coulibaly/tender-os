import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeEntryNotArchivedError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";

export type DeleteKnowledgeEntryCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Suppression définitive d'une entrée (mission Sprint 5 §11) — exige explicitement un archivage
 * PRÉALABLE (règle métier volontairement plus stricte que `DeleteDocumentUseCase`, module
 * Documents : une entrée de connaissance porte un contenu organisationnel curé, jamais supprimable
 * en un seul clic direct depuis l'état actif). Supprime en cascade (migration §"cascades
 * maîtrisées") SES PROPRES dépendances (versions, liens document, chunks, associations de tags) —
 * jamais le `Document` du module Documents lui-même, qui reste sous la seule autorité de ce
 * module (mission §"respecter... les dépendances").
 *
 * Correction "Corrections Sprint 5" §"atomicité audit/mutation" — l'entrée d'audit est désormais
 * transmise à `KnowledgeEntryRepository.delete` et écrite DANS LA MÊME transaction que les
 * suppressions (voir `PrismaKnowledgeEntryRepository.delete`) : jamais une suppression sans trace
 * d'audit correspondante, jamais une trace d'audit "supprimé" si la suppression a finalement été
 * refusée (ex. garde-fou anti-concurrence).
 */
@Injectable()
export class DeleteKnowledgeEntryUseCase {
  constructor(@Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository) {}

  async execute(command: DeleteKnowledgeEntryCommand): Promise<void> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Delete);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    if (entry.status !== KnowledgeEntryStatus.Archived) {
      throw new KnowledgeEntryNotArchivedError();
    }

    await this.knowledgeEntryRepository.delete({
      organizationId: command.organizationId,
      knowledgeEntryId: command.knowledgeEntryId,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.deleted",
        resourceType: "knowledge_entry",
        resourceId: command.knowledgeEntryId,
        requestId: command.requestId,
      },
    });
  }
}
