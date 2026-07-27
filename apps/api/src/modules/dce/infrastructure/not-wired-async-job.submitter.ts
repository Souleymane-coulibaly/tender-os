import { Injectable } from "@nestjs/common";
import type { AsyncJobSubmission, AsyncJobSubmitter } from "../application/ports/async-job-submitter";

/**
 * Adaptateur volontairement non fonctionnel (mission Sprint 0 §"traitements longs") : complète le
 * graphe de dépendances NestJS pour que le port `AsyncJobSubmitter` soit typé et injectable, sans
 * introduire de file d'attente réelle. Aucun cas d'usage de ce sprint n'appelle `submit` — s'il
 * était appelé, l'échec explicite (plutôt qu'un no-op silencieux) empêcherait de croire à tort
 * qu'un traitement asynchrone a été déclenché. Sera remplacé en Sprint 2 par un adaptateur réel
 * (piste : `pg-boss`, voir le port pour la justification).
 */
@Injectable()
export class NotWiredAsyncJobSubmitter implements AsyncJobSubmitter {
  async submit(_job: AsyncJobSubmission): Promise<void> {
    throw new Error(
      "Async job submission is not wired yet (Sprint 0/1 deliberately ship no queue infrastructure — see AsyncJobSubmitter port doc).",
    );
  }
}
