import { DomainError } from "../../../shared-kernel/domain-error";
import type { ProviderErrorCode } from "./enums";

export class ExternalConnectionNotFoundError extends DomainError {
  readonly code = "EXTERNAL_CONNECTION_NOT_FOUND";
  constructor() {
    super("External connection not found.");
  }
}

export class ExternalConnectionRevokedError extends DomainError {
  readonly code = "EXTERNAL_CONNECTION_REVOKED";
  constructor() {
    super("This connection has been revoked.");
  }
}

export class ExternalConnectionNotUsableError extends DomainError {
  readonly code = "EXTERNAL_CONNECTION_NOT_USABLE";
  constructor() {
    super("This connection is not active — reconnect it before using it.");
  }
}

/** Mission §47 — au plus une connexion active par (organisation, provider). */
export class ExternalConnectionAlreadyExistsError extends DomainError {
  readonly code = "EXTERNAL_CONNECTION_ALREADY_EXISTS";
  constructor() {
    super("An active connection already exists for this provider — disconnect it first.");
  }
}

export class ConnectorPermissionMissingError extends DomainError {
  readonly code = "CONNECTOR_PERMISSION_MISSING";
  constructor() {
    super("You do not have permission to manage connectors for this organization.");
  }
}

/** Mission §7/§52 — jamais un accès élargi au-delà des clients autorisés sur cette connexion. */
export class ExternalConnectionClientNotAllowedError extends DomainError {
  readonly code = "EXTERNAL_CONNECTION_CLIENT_NOT_ALLOWED";
  constructor() {
    super("This connection is not authorized for this client.");
  }
}

/** Mission §54/§55/§102 — state OAuth invalide, expiré, déjà consommé, ou n'appartenant pas à
 *  l'acteur/l'organisation courante. Jamais de détail sur LEQUEL de ces cas s'est produit
 *  (anti-énumération, même motif que les erreurs 404 ClientAccess). */
export class OAuthStateInvalidError extends DomainError {
  readonly code = "OAUTH_STATE_INVALID";
  constructor() {
    super("Invalid or expired OAuth flow — please start the connection again.");
  }
}

export class SyncConfigurationNotFoundError extends DomainError {
  readonly code = "SYNC_CONFIGURATION_NOT_FOUND";
  constructor() {
    super("Sync configuration not found.");
  }
}

/** Correctif audit Codex (P1-002) — un autre appel est déjà en train de traiter EXACTEMENT la même
 *  clé d'idempotence (import ou export) et n'a pas terminé dans la fenêtre d'attente bornée. Jamais
 *  levée dans le cas normal (séquentiel ou même concurrent typique, où l'attente suffit) — seulement
 *  si le traitement en cours dépasse le budget d'attente. Le client peut retenter. */
export class ExternalFileOperationInProgressError extends DomainError {
  readonly code = "EXTERNAL_FILE_OPERATION_IN_PROGRESS";
  constructor() {
    super("Another operation is already in progress for this exact file/destination — try again shortly.");
  }
}

/** Correctif audit Codex (P1-003) — un export précédent a échoué APRÈS que la requête ait
 *  potentiellement atteint le provider (timeout/connexion perdue, jamais un statut HTTP reçu
 *  positivement en échec) : TenderOS ne sait pas si un fichier distant a réellement été créé.
 *  Bloque volontairement tout nouvel essai automatique vers cette MÊME destination — jamais un
 *  second upload silencieux qui risquerait de dupliquer un fichier déjà créé côté provider. Une
 *  résolution manuelle (vérification côté SharePoint/Drive) est nécessaire avant de réessayer. */
export class ExternalFileExportNeedsReconciliationError extends DomainError {
  readonly code = "EXTERNAL_FILE_EXPORT_NEEDS_RECONCILIATION";
  constructor() {
    super("A previous export to this exact destination failed ambiguously — the remote file may already exist. Manual verification is required before retrying.");
  }
}

/** Mission §42 — jamais "latest" résolu tardivement : la cible doit être une DocumentVersion
 *  précise, déjà existante, au moment de l'export. */
export class ExportTargetNotFoundError extends DomainError {
  readonly code = "EXPORT_TARGET_NOT_FOUND";
  constructor() {
    super("The document version to export could not be found.");
  }
}

/** Mission §31 — Google Docs/Sheets sans conversion fiable supportée. */
export class UnsupportedRemoteFileTypeError extends DomainError {
  readonly code = "UNSUPPORTED_REMOTE_FILE_TYPE";
  constructor() {
    super("This file type cannot be imported — no reliable conversion is supported.");
  }
}

/** Mission §84/§101 — le message est TOUJOURS un texte générique gouverné par
 *  `providerErrorCode`, jamais le corps brut de la réponse provider (qui peut contenir des détails
 *  internes au provider non destinés à l'utilisateur final) ni un statut HTTP transmis tel quel.
 *  Le détail technique réel (statut HTTP, extrait de réponse tronqué) est capturé séparément dans
 *  `technicalDetail`, jamais sérialisé dans la réponse HTTP TenderOS (mission §12/§71) — réservé au
 *  logging technique serveur uniquement (mission §70, jamais AuditLog — mission §75). */
const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorCode, string> = {
  AUTH_ERROR: "The connection to the external provider is no longer valid — reconnect it.",
  PERMISSION_DENIED: "The external provider refused this operation (insufficient permissions on the remote account).",
  NOT_FOUND: "The requested file or folder no longer exists on the external provider.",
  CONFLICT: "The external provider reported a conflict for this operation.",
  RATE_LIMITED: "The external provider is rate-limiting requests — try again shortly.",
  TIMEOUT: "The external provider did not respond in time.",
  PROVIDER_UNAVAILABLE: "The external provider is temporarily unavailable.",
  INVALID_REQUEST: "The external provider rejected this request as invalid.",
  UNKNOWN: "The external provider returned an unexpected error.",
};

export class RemoteProviderError extends DomainError {
  readonly code = "REMOTE_PROVIDER_ERROR";
  readonly providerErrorCode: ProviderErrorCode;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  /** Diagnostic serveur uniquement — jamais exposé dans une réponse HTTP (mission §84/§101). */
  readonly technicalDetail: string | undefined;
  /** Correctif audit Codex (P1-003) — `true` uniquement quand TenderOS n'a JAMAIS reçu de réponse
   *  HTTP du provider (timeout, connexion perdue) : dans ce cas, l'opération a PEUT-ÊTRE réussi côté
   *  provider malgré l'échec local — jamais une simple erreur "safe to retry". `false` (défaut) pour
   *  toute erreur dérivée d'un VRAI statut HTTP reçu (4xx/5xx) : le provider a positivement répondu
   *  que l'opération n'a pas abouti, un retry est alors sûr. Distinction posée dans
   *  `provider-http-client.ts`, jamais devinée ailleurs. */
  readonly isAmbiguousOutcome: boolean;

  constructor(input: { providerErrorCode: ProviderErrorCode; retryable: boolean; retryAfterSeconds?: number | undefined; technicalDetail?: string | undefined; isAmbiguousOutcome?: boolean | undefined }) {
    super(PROVIDER_ERROR_MESSAGES[input.providerErrorCode]);
    this.providerErrorCode = input.providerErrorCode;
    this.retryable = input.retryable;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.technicalDetail = input.technicalDetail;
    this.isAmbiguousOutcome = input.isAmbiguousOutcome ?? false;
  }
}

export class TenderDeadlineNotSetError extends DomainError {
  readonly code = "TENDER_DEADLINE_NOT_SET";
  constructor() {
    super("This tender has no submission deadline set — nothing to sync to the calendar.");
  }
}
