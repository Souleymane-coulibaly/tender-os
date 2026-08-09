import { DomainError } from "../../../shared-kernel/domain-error";

export class ConversationNotFoundError extends DomainError {
  readonly code = "CONVERSATION_NOT_FOUND";
  constructor() {
    super("Cette conversation est introuvable.");
  }
}

export class ConversationArchivedError extends DomainError {
  readonly code = "CONVERSATION_ARCHIVED";
  constructor() {
    super("Cette conversation est archivée et ne peut plus recevoir de message.");
  }
}

/** Mission décision §4 (garde anti-abus minimale) — au plus un message ASSISTANT `PENDING` par
 *  conversation ; toute tentative d'envoi pendant qu'une génération est en cours est refusée. */
export class ConversationGenerationInProgressError extends DomainError {
  readonly code = "CONVERSATION_GENERATION_IN_PROGRESS";
  constructor() {
    super("Une réponse est déjà en cours de génération pour cette conversation.");
  }
}

/** Correctif audit Codex P1 (garde-fou volume IA, décision utilisateur) — nombre de messages
 *  ASSISTANT facturables déjà atteint pour ce Tender sur la fenêtre glissante de 24h ; jamais
 *  d'appel au provider IA au-delà de ce plafond. */
export class ChatRateLimitReachedError extends DomainError {
  readonly code = "CHAT_RATE_LIMIT_REACHED";
  constructor() {
    super("La limite quotidienne de messages envoyés à l'assistant IA pour ce dossier est atteinte. Réessayez plus tard.");
  }
}

/** Mission §31/§32 (anti-hallucination) — la sortie du modèle n'a pas respecté le schéma structuré
 *  attendu (answer + citations + confidence) : jamais persistée comme réponse valide. */
export class ChatSchemaValidationFailedError extends DomainError {
  readonly code = "CHAT_SCHEMA_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`La réponse générée n'a pas respecté le format attendu : ${input.reason}`);
  }
}

/** Mission §"jamais une citation forgée par le LLM acceptée telle quelle" — une citation déclarée
 *  par le modèle ne correspond à AUCUNE source réellement fournie dans le contexte du prompt. */
export class ChatCitationValidationFailedError extends DomainError {
  readonly code = "CHAT_CITATION_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Une citation générée n'a pas pu être vérifiée : ${input.reason}`);
  }
}
