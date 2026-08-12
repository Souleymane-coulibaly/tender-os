import { DomainError } from "../../../shared-kernel/domain-error";

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

export class RemoteProviderError extends DomainError {
  readonly code = "REMOTE_PROVIDER_ERROR";
  constructor(message: string) {
    super(message);
  }
}

/** Mission §58/§59 — épuisement des tentatives face à un throttling persistant du provider. */
export class RemoteProviderRateLimitedError extends DomainError {
  readonly code = "REMOTE_PROVIDER_RATE_LIMITED";
  constructor() {
    super("The external provider is rate-limiting requests — try again shortly.");
  }
}

export class TenderDeadlineNotSetError extends DomainError {
  readonly code = "TENDER_DEADLINE_NOT_SET";
  constructor() {
    super("This tender has no submission deadline set — nothing to sync to the calendar.");
  }
}
