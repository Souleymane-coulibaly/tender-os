import { Inject, Injectable } from "@nestjs/common";
import { assertHasConnectorPermission, ConnectorPermission } from "../../domain/connector-permission";
import { toExternalConnectionSummary, type ExternalConnectionSummary } from "../dtos";
import { EXTERNAL_CONNECTION_REPOSITORY, type ExternalConnectionRepository } from "../ports/external-connection.repository";

export type ListExternalConnectionsQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListExternalConnectionsUseCase {
  constructor(@Inject(EXTERNAL_CONNECTION_REPOSITORY) private readonly connectionRepository: ExternalConnectionRepository) {}

  async execute(query: ListExternalConnectionsQuery): Promise<ExternalConnectionSummary[]> {
    assertHasConnectorPermission(query.actorRole, ConnectorPermission.Read);
    const connections = await this.connectionRepository.listByOrganization({ organizationId: query.organizationId });
    return connections.map(toExternalConnectionSummary);
  }
}
