import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { requireConnectorEnv } from "../application/services/connector-env";
import { ConnectorProvider, ProviderErrorCode } from "../domain/enums";
import { RemoteProviderError } from "../domain/errors";
import type { ConnectorProviderAdapter, DownloadedFile, OAuthAccountInfo, OAuthTokenResult, RemoteContainer, RemoteFile, RemoteFolderListing } from "../application/ports/connector-provider-adapter";
import { callProviderBinary, callProviderJson } from "./provider-http-client";

const AUTHORIZE_URL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const MAX_SIMPLE_UPLOAD_BYTES = 20 * 1024 * 1024;
const PROVIDER_LABEL = "Microsoft Graph";

/** Mission §13 — least privilege : uniquement ce que Sprint 19 utilise réellement (SharePoint,
 *  OneDrive, Calendar). Jamais `Mail.*`/`Chat.*` (Outlook/Teams différés, mission §22/§26). */
export const MICROSOFT_SCOPES = ["offline_access", "User.Read", "Sites.ReadWrite.All", "Files.ReadWrite.All", "Calendars.ReadWrite"] as const;

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
});

const MeResponseSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
  userPrincipalName: z.string().optional(),
  mail: z.string().nullable().optional(),
});

const DriveItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  folder: z.object({}).optional(),
  file: z.object({ mimeType: z.string().optional() }).optional(),
  size: z.number().optional(),
  lastModifiedDateTime: z.string().optional(),
  eTag: z.string().optional(),
  webUrl: z.string().optional(),
});

/** L'access token Microsoft (endpoint v2.0) est lui-même un JWT contenant `tid` (tenant id), pas
 *  seulement l'id_token OpenID (qu'on ne demande pas — aucun scope `openid` dans
 *  `MICROSOFT_SCOPES`, mission §13 least privilege). Décoder l'access token déjà reçu évite
 *  d'ajouter un scope supplémentaire uniquement pour ce champ d'affichage (mission §15). Le token
 *  vient directement de la réponse HTTPS de Microsoft (canal déjà authentifié côté serveur) — un
 *  décodage sans vérification de signature est acceptable ici uniquement pour lire `tid` à titre
 *  d'affichage, jamais pour une décision d'autorisation. */
function decodeTenantIdFromJwt(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { tid?: string };
    return parsed.tid;
  } catch {
    return undefined;
  }
}

/**
 * Mission §14/§53 — couche Microsoft Graph unique. `listContainers` retourne le OneDrive de
 * l'utilisateur connecté + les bibliothèques SharePoint accessibles (mission §16/§18 — minimum
 * "lister les sites, sélectionner une bibliothèque"), toutes deux modélisées comme des "drives"
 * Graph, jamais deux chemins de code distincts pour SharePoint vs OneDrive côté navigation/download/
 * upload (même API Graph sous-jacente). Tous les appels passent par `provider-http-client.ts`
 * (mission §21 — jamais un retry "maison" propre à cet adapter).
 */
@Injectable()
export class MicrosoftGraphAdapter implements ConnectorProviderAdapter {
  readonly provider = ConnectorProvider.Microsoft365;

  private get clientId(): string {
    return requireConnectorEnv("MICROSOFT_OAUTH_CLIENT_ID");
  }
  private get clientSecret(): string {
    return requireConnectorEnv("MICROSOFT_OAUTH_CLIENT_SECRET");
  }

  buildAuthorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    // Le secret n'entre pas dans l'URL, mais sans lui l'échange du code échouerait APRÈS le
    // consentement de l'utilisateur chez Microsoft : sa présence est vérifiée dès l'initiation.
    requireConnectorEnv("MICROSOFT_OAUTH_CLIENT_SECRET");
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: input.redirectUri,
      scope: MICROSOFT_SCOPES.join(" "),
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      response_mode: "query",
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      scope: MICROSOFT_SCOPES.join(" "),
    });
    const parsed = await callProviderJson(TOKEN_URL, TokenResponseSchema, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, PROVIDER_LABEL);
    return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token, expiresInSeconds: parsed.expires_in, scopes: parsed.scope?.split(" ") ?? MICROSOFT_SCOPES };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: MICROSOFT_SCOPES.join(" "),
    });
    const parsed = await callProviderJson(TOKEN_URL, TokenResponseSchema, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, PROVIDER_LABEL);
    return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token, expiresInSeconds: parsed.expires_in, scopes: parsed.scope?.split(" ") ?? MICROSOFT_SCOPES };
  }

  async fetchAccountInfo(accessToken: string): Promise<OAuthAccountInfo> {
    const me = await callProviderJson(`${GRAPH_BASE_URL}/me`, MeResponseSchema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);
    return { externalAccountId: me.id, externalAccountLabel: me.mail ?? me.userPrincipalName, externalTenantId: decodeTenantIdFromJwt(accessToken) };
  }

  /** Mission §12 — best-effort, ne lève jamais : Microsoft n'expose pas d'endpoint de révocation de
   *  refresh token dédié (contrairement à Google) — l'invalidation réelle se fait par suppression
   *  du consentement côté admin tenant, hors de portée de TenderOS. La suppression locale des
   *  credentials chiffrés (`ExternalConnection.revoke`) reste la garantie effective côté TenderOS. */
  async revokeToken(): Promise<void> {
    return Promise.resolve();
  }

  async listContainers(accessToken: string): Promise<readonly RemoteContainer[]> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const OneDriveSchema = z.object({ id: z.string(), name: z.string().optional() });
    const SitesSchema = z.object({ value: z.array(z.object({ id: z.string(), displayName: z.string().optional(), name: z.string().optional() })) });

    const containers: RemoteContainer[] = [];
    try {
      const oneDrive = await callProviderJson(`${GRAPH_BASE_URL}/me/drive`, OneDriveSchema, { headers }, PROVIDER_LABEL);
      containers.push({ id: oneDrive.id, name: oneDrive.name ?? "OneDrive", kind: "ONEDRIVE" });
    } catch {
      // OneDrive peut être absent pour ce compte — jamais bloquant pour le reste (mission §80).
    }
    try {
      const sites = await callProviderJson(`${GRAPH_BASE_URL}/sites?search=*`, SitesSchema, { headers }, PROVIDER_LABEL);
      for (const site of sites.value) {
        const drivesSchema = z.object({ value: z.array(z.object({ id: z.string(), name: z.string().optional() })) });
        const drives = await callProviderJson(`${GRAPH_BASE_URL}/sites/${site.id}/drives`, drivesSchema, { headers }, PROVIDER_LABEL);
        for (const drive of drives.value) {
          containers.push({ id: drive.id, name: `${site.displayName ?? site.name ?? "Site"} — ${drive.name ?? "Documents"}`, kind: "SHAREPOINT_LIBRARY" });
        }
      }
    } catch {
      // Idem — absence de sites accessibles n'empêche pas l'usage d'OneDrive seul.
    }
    return containers;
  }

  async listFolderChildren(accessToken: string, input: { containerId: string; folderId?: string | undefined }): Promise<RemoteFolderListing> {
    const path = input.folderId ? `items/${input.folderId}` : "root";
    const url = `${GRAPH_BASE_URL}/drives/${input.containerId}/${path}/children`;
    const schema = z.object({ value: z.array(DriveItemSchema) });
    const result = await callProviderJson(url, schema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);

    const folders = result.value.filter((item) => item.folder !== undefined).map((item) => ({ id: item.id, name: item.name }));
    const files = result.value
      .filter((item) => item.folder === undefined)
      .map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.file?.mimeType ?? "application/octet-stream",
        sizeBytes: item.size ?? 0,
        modifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : new Date(0),
        eTag: item.eTag,
        webUrl: item.webUrl,
      }));
    return { folders, files };
  }

  async downloadFile(accessToken: string, input: { containerId: string; fileId: string; mimeType: string }): Promise<DownloadedFile> {
    const metaUrl = `${GRAPH_BASE_URL}/drives/${input.containerId}/items/${input.fileId}`;
    const meta = await callProviderJson(metaUrl, DriveItemSchema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);

    const buffer = await callProviderBinary(`${GRAPH_BASE_URL}/drives/${input.containerId}/items/${input.fileId}/content`, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);
    return { buffer, mimeType: meta.file?.mimeType ?? "application/octet-stream", filename: meta.name };
  }

  async uploadFile(accessToken: string, input: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }): Promise<RemoteFile> {
    if (input.content.byteLength > MAX_SIMPLE_UPLOAD_BYTES) {
      throw new RemoteProviderError({
        providerErrorCode: ProviderErrorCode.InvalidRequest,
        retryable: false,
        technicalDetail: "File exceeds the 20MB simple-upload limit — chunked upload sessions are not implemented this sprint (mission §43, documented limitation).",
      });
    }
    const url = `${GRAPH_BASE_URL}/drives/${input.containerId}/items/${input.folderId}:/${encodeURIComponent(input.filename)}:/content`;
    // Correctif audit Codex (P1-004) — jamais de retry interne du client HTTP sur un échec ambigu :
    // un PUT de création de fichier n'est pas idempotent, une seconde tentative automatique ici
    // pourrait dupliquer AVANT même que la réservation applicative (`NEEDS_RECONCILIATION`) ne
    // puisse réagir.
    const item = await callProviderJson(
      url,
      DriveItemSchema,
      { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": input.mimeType }, body: input.content },
      PROVIDER_LABEL,
      { retryAmbiguous: false },
    );
    return {
      id: item.id,
      name: item.name,
      mimeType: item.file?.mimeType ?? input.mimeType,
      sizeBytes: item.size ?? input.content.byteLength,
      modifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : new Date(),
      eTag: item.eTag,
      webUrl: item.webUrl,
    };
  }

  async createCalendarEvent(accessToken: string, input: { title: string; description: string; startAt: Date; endAt: Date; timezone: string }): Promise<{ externalEventId: string }> {
    const schema = z.object({ id: z.string() });
    // Correctif audit Codex (P1-004) — même motif que `uploadFile` : un POST de création
    // d'événement n'est pas idempotent, jamais de retry interne sur un échec ambigu.
    const created = await callProviderJson(
      `${GRAPH_BASE_URL}/me/events`,
      schema,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: input.title,
          body: { contentType: "text", content: input.description },
          start: { dateTime: input.startAt.toISOString(), timeZone: input.timezone },
          end: { dateTime: input.endAt.toISOString(), timeZone: input.timezone },
        }),
      },
      PROVIDER_LABEL,
      { retryAmbiguous: false },
    );
    return { externalEventId: created.id };
  }
}
