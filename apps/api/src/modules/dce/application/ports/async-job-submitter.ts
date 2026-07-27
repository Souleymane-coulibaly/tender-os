export type AsyncJobSubmission = Readonly<{
  jobType: string;
  organizationId: string;
  payload: Record<string, unknown>;
}>;

/**
 * Port préparé pour les traitements longs futurs (classification, extraction de texte, OCR,
 * analyse IA — Sprint 2+) — mission Sprint 0 §"traitements longs" : "ne pas exécuter de
 * traitement long dans une requête HTTP, ne pas imposer BullMQ immédiatement si aucune
 * infrastructure de file n'existe déjà".
 *
 * Décision technique actée (aucune file n'existe dans ce dépôt à ce jour) : ce sprint définit
 * uniquement le contrat. Aucun adaptateur réel ne le sous-tend, et aucun cas d'usage ne l'appelle
 * — l'import Sprint 1 reste volontairement synchrone et borné (limites de taille/nombre strictes),
 * ce qui ne nécessite structurellement aucune file. Pistes déjà identifiées pour Sprint 2 :
 * Railway réserve déjà un process "Workers" (voir DEPLOYMENT_PATTERNS.md) ; `pg-boss` (file
 * appuyée sur PostgreSQL, déjà présent) est une option à moindre friction que BullMQ+Redis
 * puisqu'elle n'introduit aucune nouvelle dépendance d'infrastructure.
 */
export interface AsyncJobSubmitter {
  submit(job: AsyncJobSubmission): Promise<void>;
}

export const ASYNC_JOB_SUBMITTER = Symbol("ASYNC_JOB_SUBMITTER");
