import { Inject, Injectable } from "@nestjs/common";
import { assertHasConnectorPermission, ConnectorPermission, roleHasConnectorPermission } from "../../domain/connector-permission";
import { ExternalConnectionClientNotAllowedError, ExternalConnectionNotFoundError } from "../../domain/errors";
import type { RemoteContainer, RemoteFolderListing } from "../ports/connector-provider-adapter";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";
import { callWithReactiveReauth } from "../services/call-with-reactive-reauth";
import { EnsureFreshAccessTokenService } from "../services/ensure-fresh-access-token.service";
import { getAdapter } from "../services/get-adapter";

export type BrowseRemoteFolderQuery = Readonly<{ organizationId: string; actorRole: string; connectionId: string; containerId?: string | undefined; folderId?: string | undefined; clientAccountId?: string | undefined }>;
export type BrowseRemoteFolderResult = Readonly<{ containers?: readonly RemoteContainer[] | undefined; listing?: RemoteFolderListing | undefined }>;

/**
 * Mission §71 — navigateur de fichiers simple (containers -> dossiers/fichiers), jamais l'UI
 * SharePoint/Drive recréée. Accessible dès `DocumentImport` OU `DocumentExport` (mission §48 —
 * naviguer est un préalable aux deux, jamais restreint à `Manage`/OWNER-ADMIN, sans quoi un
 * CONTRIBUTOR ne pourrait même pas voir ce qu'il pourrait importer).
 *
 * Correctif audit (P2) — le narrowing `allowedClientAccountIds` (mission §49/§52) était jusqu'ici
 * vérifié uniquement à l'import/export, jamais à la navigation elle-même : un acteur "use tier"
 * (Contributor/BidManager, sans `Manage`) pouvait lister les noms de fichiers d'une connexion
 * restreinte à un AUTRE client que ceux qu'il gère, avant même toute tentative d'import/export —
 * une fuite d'information mineure mais réelle. `Manage` (OWNER/ORGANIZATION_ADMIN, déjà seuls
 * habilités à configurer cette restriction) garde un accès complet, cohérent avec le motif déjà
 * établi ailleurs (OWNER/ADMIN superset des restrictions posées pour les paliers inférieurs) — la
 * vérification ne s'applique qu'aux acteurs "use tier".
 */
@Injectable()
export class BrowseRemoteFolderUseCase {
  constructor(
    @Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    private readonly ensureFreshAccessToken: EnsureFreshAccessTokenService,
  ) {}

  async execute(query: BrowseRemoteFolderQuery): Promise<BrowseRemoteFolderResult> {
    if (!roleHasConnectorPermission(query.actorRole, ConnectorPermission.DocumentImport) && !roleHasConnectorPermission(query.actorRole, ConnectorPermission.DocumentExport)) {
      assertHasConnectorPermission(query.actorRole, ConnectorPermission.DocumentImport);
    }

    const connection = await this.connectionRepository.findById({ organizationId: query.organizationId, connectionId: query.connectionId });
    if (!connection) {
      throw new ExternalConnectionNotFoundError();
    }

    const isManager = roleHasConnectorPermission(query.actorRole, ConnectorPermission.Manage);
    if (!isManager && !connection.isClientAllowed(query.clientAccountId)) {
      throw new ExternalConnectionClientNotAllowedError();
    }

    const adapter = getAdapter(this.adapters, connection.provider);

    return callWithReactiveReauth({
      connection,
      ensureFreshAccessToken: this.ensureFreshAccessToken,
      operation: async (accessToken) => {
        if (query.containerId === undefined) {
          return { containers: await adapter.listContainers(accessToken) };
        }
        return { listing: await adapter.listFolderChildren(accessToken, { containerId: query.containerId, folderId: query.folderId }) };
      },
    });
  }
}
