import { randomUUID } from "node:crypto";
import type { ConnectorProvider } from "../domain/enums";
import { UnsupportedRemoteFileTypeError } from "../domain/errors";
import type { ConnectorProviderAdapter, DownloadedFile, OAuthAccountInfo, OAuthTokenResult, RemoteContainer, RemoteFile, RemoteFolderListing } from "../application/ports/connector-provider-adapter";

/**
 * Mission §81/§104 — "adapter de test réaliste si credentials live absents", distinct de "OAuth
 * contract tested" (couvert par les tests unitaires des adapters réels contre des réponses HTTP
 * mockées) vs "live tenant tested" (hors de portée sans un vrai tenant M365/Google, jamais simulé
 * comme tel). Implémente le MÊME port que les adapters réels — un test contre ce fake ne prouve
 * jamais la conformité au protocole Graph/Google réel, seulement le comportement TenderOS
 * (autorisation, chiffrement, création de Document, etc.) une fois les tokens/fichiers obtenus.
 */
export class FakeConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly remoteFolders = new Map<string, RemoteFolderListing>();
  readonly downloadedContent = new Map<string, DownloadedFile>();
  readonly uploadedFiles: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }[] = [];
  readonly createdEvents: { title: string; description: string; startAt: Date; endAt: Date }[] = [];
  revokedTokens: string[] = [];
  shouldFailRefresh = false;

  constructor(readonly provider: ConnectorProvider) {}

  buildAuthorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    return `https://fake-${this.provider.toLowerCase()}.example.test/authorize?state=${encodeURIComponent(input.state)}&code_challenge=${encodeURIComponent(input.codeChallenge)}&redirect_uri=${encodeURIComponent(input.redirectUri)}`;
  }

  async exchangeCodeForTokens(input: { code: string }): Promise<OAuthTokenResult> {
    return Promise.resolve({ accessToken: `fake-access-${input.code}`, refreshToken: `fake-refresh-${input.code}`, expiresInSeconds: 3600, scopes: ["fake.scope"] });
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    if (this.shouldFailRefresh) {
      throw new Error("fake refresh failure — simulates a revoked/expired refresh token");
    }
    return Promise.resolve({ accessToken: `fake-access-refreshed-${refreshToken}`, refreshToken, expiresInSeconds: 3600, scopes: ["fake.scope"] });
  }

  async fetchAccountInfo(): Promise<OAuthAccountInfo> {
    return Promise.resolve({ externalAccountId: `fake-account-${randomUUID()}`, externalTenantId: "fake-tenant", externalAccountLabel: "fake.user@example.test" });
  }

  async revokeToken(refreshToken: string): Promise<void> {
    this.revokedTokens.push(refreshToken);
    return Promise.resolve();
  }

  async listContainers(): Promise<readonly RemoteContainer[]> {
    return Promise.resolve([{ id: "fake-container", name: "Fake container", kind: "FAKE" }]);
  }

  async listFolderChildren(_accessToken: string, input: { containerId: string; folderId?: string | undefined }): Promise<RemoteFolderListing> {
    const key = `${input.containerId}:${input.folderId ?? "root"}`;
    return Promise.resolve(this.remoteFolders.get(key) ?? { folders: [], files: [] });
  }

  async downloadFile(_accessToken: string, input: { fileId: string; mimeType: string }): Promise<DownloadedFile> {
    const found = this.downloadedContent.get(input.fileId);
    if (!found) {
      throw new Error(`FakeConnectorProviderAdapter: no fixture registered for fileId=${input.fileId}`);
    }
    if (found.mimeType === "application/vnd.google-apps.presentation") {
      throw new UnsupportedRemoteFileTypeError();
    }
    return Promise.resolve(found);
  }

  async uploadFile(_accessToken: string, input: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }): Promise<RemoteFile> {
    this.uploadedFiles.push(input);
    return Promise.resolve({ id: randomUUID(), name: input.filename, mimeType: input.mimeType, sizeBytes: input.content.byteLength, modifiedAt: new Date() });
  }

  async createCalendarEvent(_accessToken: string, input: { title: string; description: string; startAt: Date; endAt: Date }): Promise<{ externalEventId: string }> {
    this.createdEvents.push(input);
    return Promise.resolve({ externalEventId: randomUUID() });
  }
}
