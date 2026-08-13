import type { ExternalConnection } from "../../domain/external-connection.entity";
import type { ConnectorProvider } from "../../domain/enums";

export interface ExternalConnectionRepository {
  findById(input: { organizationId: string; connectionId: string }): Promise<ExternalConnection | null>;
  /** Mission §47 — la connexion PENDING/ACTIVE/REAUTH_REQUIRED courante pour ce provider, jamais
   *  une connexion REVOKED (l'historique n'est jamais retourné ici). */
  findActiveByOrganizationAndProvider(input: { organizationId: string; provider: ConnectorProvider }): Promise<ExternalConnection | null>;
  listByOrganization(input: { organizationId: string }): Promise<readonly ExternalConnection[]>;
  save(connection: ExternalConnection): Promise<void>;
  /** Mission §11/§95 — exécute `fn` avec la connexion RELUE sous verrou consultatif scopé à
   *  `connectionId`, puis persiste automatiquement l'état (muté en place par `fn`). Un second
   *  appelant concurrent sur la MÊME connexion attend le verrou puis observe l'état déjà mis à jour
   *  par le premier, au lieu de déclencher un second refresh redondant — potentiellement destructeur
   *  si le provider fait tourner le refresh token à chaque usage (rotation, mission §10). Lève
   *  `ExternalConnectionNotFoundError` si la connexion n'existe plus. */
  withLock<T>(input: { organizationId: string; connectionId: string }, fn: (connection: ExternalConnection) => Promise<T>): Promise<T>;
}

export const EXTERNAL_CONNECTION_REPOSITORY = Symbol("EXTERNAL_CONNECTION_REPOSITORY");
