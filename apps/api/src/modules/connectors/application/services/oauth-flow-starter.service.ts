import { Inject, Injectable } from "@nestjs/common";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import type { ConnectorProvider } from "../../domain/enums";
import { OAuthFlowState } from "../../domain/oauth-flow-state.entity";
import { CONNECTOR_PROVIDER_ADAPTERS, type ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { OAUTH_FLOW_STATE_REPOSITORY, type OAuthFlowStateRepository } from "../ports/oauth-flow-state.repository";
import { getAdapter } from "./get-adapter";
import { derivePkceCodeChallenge, generateOAuthState, generatePkceCodeVerifier, OAUTH_FLOW_STATE_TTL_MS } from "./pkce";
import { oauthRedirectUri } from "./redirect-uri";

/** Point unique de démarrage d'un flow OAuth (state + PKCE + persistance + URL d'autorisation) —
 *  partagé entre "nouvelle connexion" et "réautorisation d'une connexion existante" (mission §6/
 *  §11), jamais deux implémentations divergentes du même protocole. */
@Injectable()
export class OAuthFlowStarterService {
  constructor(
    @Inject(OAUTH_FLOW_STATE_REPOSITORY) private readonly flowStateRepository: OAuthFlowStateRepository,
    @Inject(CONNECTOR_PROVIDER_ADAPTERS) private readonly adapters: ConnectorProviderAdapterMap,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async start(input: { organizationId: string; userId: string; provider: ConnectorProvider; connectionId: string | undefined; occurredAt: Date }): Promise<string> {
    const state = generateOAuthState();
    const codeVerifier = generatePkceCodeVerifier();
    const codeChallenge = derivePkceCodeChallenge(codeVerifier);

    const flowState = OAuthFlowState.initiate({
      id: this.idGenerator.generate(),
      state,
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      connectionId: input.connectionId,
      codeVerifier,
      occurredAt: input.occurredAt,
      ttlMs: OAUTH_FLOW_STATE_TTL_MS,
    });
    await this.flowStateRepository.save(flowState);

    const adapter = getAdapter(this.adapters, input.provider);
    return adapter.buildAuthorizationUrl({ state, codeChallenge, redirectUri: oauthRedirectUri(input.provider) });
  }
}
