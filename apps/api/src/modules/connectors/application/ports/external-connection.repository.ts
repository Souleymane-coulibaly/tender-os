import type { ExternalConnection } from "../../domain/external-connection.entity";
import type { ConnectorProvider } from "../../domain/enums";

export interface ExternalConnectionRepository {
  findById(input: { organizationId: string; connectionId: string }): Promise<ExternalConnection | null>;
  /** Mission §47 — la connexion PENDING/ACTIVE/REAUTH_REQUIRED courante pour ce provider, jamais
   *  une connexion REVOKED (l'historique n'est jamais retourné ici). */
  findActiveByOrganizationAndProvider(input: { organizationId: string; provider: ConnectorProvider }): Promise<ExternalConnection | null>;
  listByOrganization(input: { organizationId: string }): Promise<readonly ExternalConnection[]>;
  save(connection: ExternalConnection): Promise<void>;
}

export const EXTERNAL_CONNECTION_REPOSITORY = Symbol("EXTERNAL_CONNECTION_REPOSITORY");
