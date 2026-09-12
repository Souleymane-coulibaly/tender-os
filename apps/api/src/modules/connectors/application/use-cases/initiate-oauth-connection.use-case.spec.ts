import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EntitlementService } from "../../../billing";
import { ConnectionStatus, ConnectorProvider } from "../../domain/enums";
import { ConnectorNotConfiguredError, ExternalConnectionAlreadyExistsError } from "../../domain/errors";
import { ExternalConnection } from "../../domain/external-connection.entity";
import { MicrosoftGraphAdapter } from "../../infrastructure/microsoft-graph.adapter";
import { FixedClock, InMemoryAuditLogWriter, InMemoryExternalConnectionRepository, InMemoryOAuthFlowStateRepository, SequentialIdGenerator } from "../../test-support/fakes";
import type { ConnectorProviderAdapterMap } from "../ports/connector-provider-adapter";
import { OAuthFlowStarterService } from "../services/oauth-flow-starter.service";
import { InitiateOAuthConnectionUseCase } from "./initiate-oauth-connection.use-case";

/** Variables lues par le vrai adapter Microsoft et par `oauthRedirectUri` — le test passe par le
 *  vrai chemin de configuration, jamais par un double qui masquerait une variable manquante. */
const CONFIG_VARIABLES = ["API_BASE_URL", "MICROSOFT_OAUTH_CLIENT_ID", "MICROSOFT_OAUTH_CLIENT_SECRET"] as const;

const command = {
  organizationId: "org-1",
  actorId: "user-1",
  actorRole: "OWNER",
  provider: ConnectorProvider.Microsoft365,
  name: "Microsoft 365 — organisation",
} as const;

function setup() {
  const connections = new InMemoryExternalConnectionRepository();
  const flowStates = new InMemoryOAuthFlowStateRepository();
  const audit = new InMemoryAuditLogWriter();
  const ids = new SequentialIdGenerator();
  const adapters: ConnectorProviderAdapterMap = new Map([[ConnectorProvider.Microsoft365, new MicrosoftGraphAdapter()]]);
  const entitlements = { canUseFeature: async () => true } as unknown as EntitlementService;
  const useCase = new InitiateOAuthConnectionUseCase(connections, audit, new FixedClock(), ids, entitlements, new OAuthFlowStarterService(flowStates, adapters, ids));
  return { useCase, connections, flowStates, audit };
}

function existingConnection(id: string): ExternalConnection {
  return ExternalConnection.initiate({
    id,
    organizationId: command.organizationId,
    provider: command.provider,
    name: "Tentative précédente",
    allowedClientAccountIds: [],
    createdBy: "user-0",
    occurredAt: new Date("2026-08-01T09:00:00Z"),
  });
}

describe("InitiateOAuthConnectionUseCase", () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of CONFIG_VARIABLES) saved.set(name, process.env[name]);
    process.env.API_BASE_URL = "https://api.tenderos.test";
    process.env.MICROSOFT_OAUTH_CLIENT_ID = "client-id-test";
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "client-secret-test";
  });

  afterEach(() => {
    for (const name of CONFIG_VARIABLES) {
      const value = saved.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("crée une connexion PENDING et renvoie l'URL d'autorisation du provider", async () => {
    const { useCase, connections, flowStates, audit } = setup();

    const { authorizationUrl } = await useCase.execute(command);

    expect(authorizationUrl).toContain("login.microsoftonline.com");
    expect(authorizationUrl).toContain("client_id=client-id-test");
    expect(connections.connections.map((c) => c.status)).toEqual([ConnectionStatus.Pending]);
    expect(flowStates.states).toHaveLength(1);
    expect(audit.entries.map((e) => e.action)).toEqual(["connector.connection_initiated"]);
  });

  it.each(CONFIG_VARIABLES)("configuration incomplète (%s absente) : erreur explicite, et rien n'est écrit", async (missing) => {
    delete process.env[missing];
    const { useCase, connections, flowStates, audit } = setup();

    const error = await useCase.execute(command).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConnectorNotConfiguredError);
    expect((error as ConnectorNotConfiguredError).variableName).toBe(missing);
    // Aucune ligne PENDING orpheline : c'est elle qui bloquait ensuite toute nouvelle tentative.
    expect(connections.connections).toHaveLength(0);
    expect(flowStates.states).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  it("une connexion PENDING abandonnée ne bloque plus : elle est révoquée et remplacée", async () => {
    const { useCase, connections, audit } = setup();
    const stale = existingConnection("stale-pending");
    await connections.save(stale);

    await useCase.execute(command);

    expect(stale.status).toBe(ConnectionStatus.Revoked);
    const current = await connections.findActiveByOrganizationAndProvider({ organizationId: command.organizationId, provider: command.provider });
    expect(current?.id).not.toBe("stale-pending");
    expect(current?.status).toBe(ConnectionStatus.Pending);
    expect(current?.name).toBe(command.name);
    expect(audit.entries[0]?.metadata).toEqual({ provider: command.provider, replacedPendingConnectionId: "stale-pending" });
  });

  it("configuration incomplète : la connexion PENDING existante n'est pas touchée", async () => {
    delete process.env.API_BASE_URL;
    const { useCase, connections } = setup();
    const stale = existingConnection("stale-pending");
    await connections.save(stale);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ConnectorNotConfiguredError);

    expect(stale.status).toBe(ConnectionStatus.Pending);
    expect(connections.connections).toHaveLength(1);
  });

  it.each([
    ["ACTIVE", (c: ExternalConnection) => c.recordSuccessfulRefresh({ encryptedAccessToken: "enc:access", expiresAt: undefined, occurredAt: new Date("2026-08-01T10:00:00Z") })],
    ["REAUTH_REQUIRED", (c: ExternalConnection) => c.markReauthRequired({ reason: "token expiré", occurredAt: new Date("2026-08-01T10:00:00Z") })],
  ])("une connexion %s reste un refus (au plus une connexion par provider)", async (_status, toStatus) => {
    const { useCase, connections, flowStates } = setup();
    const current = existingConnection("current");
    toStatus(current);
    await connections.save(current);

    await expect(useCase.execute(command)).rejects.toBeInstanceOf(ExternalConnectionAlreadyExistsError);

    expect(connections.connections).toHaveLength(1);
    expect(flowStates.states).toHaveLength(0);
  });
});
