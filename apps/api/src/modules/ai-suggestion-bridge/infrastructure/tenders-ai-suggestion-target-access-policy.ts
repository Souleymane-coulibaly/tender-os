import { Injectable } from "@nestjs/common";
import type { AiSuggestionTargetAccessPolicy } from "../../ai-suggestion";
import { GetTenderLotUseCase, GetTenderUseCase } from "../../tenders";
import { AiSuggestionLotMismatchError } from "../domain/errors";

/**
 * V2 Sprint 4 — implémentation réelle de `AiSuggestionTargetAccessPolicy` (Noop par défaut côté
 * `ai-suggestion`, jamais modifié). Rebindée globalement par `AiSuggestionBridgeModule`
 * (`@Global()`), donc utilisée aussi bien par les use cases du module `ai-suggestion` lui-même
 * (get/list/accept/modify/reject) que par le bridge.
 *
 * Vérifie systématiquement l'accès à `parentTenderId` (racine tenantée, toujours connue) via
 * `GetTenderUseCase` — qui applique déjà en interne `AssertClientAccessUseCase` (accès à
 * l'entreprise candidate du Tender). Si `parentLotId` est renseigné, vérifie en plus qu'il
 * appartient bien à ce Tender via `GetTenderLotUseCase` (jamais un lot d'un autre Tender/tenant).
 */
@Injectable()
export class TendersAiSuggestionTargetAccessPolicy implements AiSuggestionTargetAccessPolicy {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getTenderLotUseCase: GetTenderLotUseCase,
  ) {}

  async assertCanAccessTarget(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    entityType: string;
    entityId: string | undefined;
    parentTenderId: string;
    parentLotId: string | undefined;
  }): Promise<void> {
    // Lève TenderNotFoundError/ClientAccountNotFoundError/ClientPermissionMissingError si
    // l'acteur n'a pas accès à ce Tender (ou à l'entreprise candidate qui le porte) — jamais un
    // contournement, même use case public que partout ailleurs dans Tenders.
    await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.parentTenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    if (input.parentLotId !== undefined) {
      try {
        await this.getTenderLotUseCase.execute({
          organizationId: input.organizationId,
          tenderId: input.parentTenderId,
          lotId: input.parentLotId,
          actorRole: input.actorRole,
        });
      } catch {
        // Ne jamais laisser fuiter TenderLotNotFoundError tel quel (révélerait la distinction
        // entre "lot inexistant" et "lot d'un autre Tender") — un seul message, cohérent avec
        // TenderLotMismatchError côté Tenders.
        throw new AiSuggestionLotMismatchError();
      }
    }
  }
}
