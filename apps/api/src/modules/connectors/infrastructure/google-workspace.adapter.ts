import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { getRequiredEnv } from "../../../shared-kernel/env";
import { ConnectorProvider, ProviderErrorCode } from "../domain/enums";
import { RemoteProviderError, UnsupportedRemoteFileTypeError } from "../domain/errors";
import type { ConnectorProviderAdapter, DownloadedFile, OAuthAccountInfo, OAuthTokenResult, RemoteContainer, RemoteFile, RemoteFolderListing } from "../application/ports/connector-provider-adapter";
import { callProviderBinary, callProviderJson } from "./provider-http-client";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_BASE_URL = "https://www.googleapis.com/drive/v3";
/** Checkpoint TENDEROS-2.1-P2.3-E12 — aligné sur `REQUEST_TIMEOUT_MS` de `provider-http-client.ts`
 *  (15 s), la borne déjà appliquée à tous les autres appels provider de ce module. */
const REVOKE_REQUEST_TIMEOUT_MS = 15_000;
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";
const MAX_SIMPLE_UPLOAD_BYTES = 20 * 1024 * 1024;
const PROVIDER_LABEL = "Google API";

/** Mission §13 — least privilege : uniquement Drive + Calendar (Gmail différé, mission §32). */
export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/userinfo.email"] as const;

/** Mission §31 — conversion fiable UNIQUEMENT Docs->DOCX et Sheets->XLSX. Tout autre type natif
 *  Google (Slides, Forms, Drawings, Sites...) est explicitement UNSUPPORTED, jamais une tentative
 *  de conversion non fiable. */
const GOOGLE_NATIVE_EXPORT_MIME_TYPES: Readonly<Record<string, string>> = {
  "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const GOOGLE_NATIVE_TYPE_PREFIX = "application/vnd.google-apps.";

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
});

const UserInfoSchema = z.object({ id: z.string(), email: z.string().optional(), hd: z.string().optional() });

const DriveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.string().optional(),
  modifiedTime: z.string().optional(),
  md5Checksum: z.string().optional(),
  webViewLink: z.string().optional(),
});

/**
 * Mission §27/§56 — couche Google Workspace unique. `listContainers` retourne "Mon Drive" + les
 * Shared Drives accessibles (mission §28 minimum). `downloadFile` distingue les fichiers Google
 * natifs (Docs/Sheets, export forcé DOCX/XLSX, mission §31/§57) des fichiers binaires classiques
 * (téléchargement direct) — jamais le même chemin de code pour les deux. Tous les appels passent
 * par `provider-http-client.ts` (mission §21 — jamais un retry "maison" propre à cet adapter).
 */
@Injectable()
export class GoogleWorkspaceAdapter implements ConnectorProviderAdapter {
  readonly provider = ConnectorProvider.GoogleWorkspace;

  private get clientId(): string {
    return getRequiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  }
  private get clientSecret(): string {
    return getRequiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  }

  buildAuthorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: "code",
      redirect_uri: input.redirectUri,
      scope: GOOGLE_SCOPES.join(" "),
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      // Google ne renvoie un refresh_token qu'au premier consentement — sans ceci, une
      // reconnexion après révocation resterait bloquée sans refresh_token (mission §11).
      access_type: "offline",
      prompt: "consent",
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
    });
    const parsed = await callProviderJson(TOKEN_URL, TokenResponseSchema, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, PROVIDER_LABEL);
    return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token, expiresInSeconds: parsed.expires_in, scopes: parsed.scope?.split(" ") ?? GOOGLE_SCOPES };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const body = new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
    const parsed = await callProviderJson(TOKEN_URL, TokenResponseSchema, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, PROVIDER_LABEL);
    // Google ne renvoie généralement PAS de nouveau refresh_token lors d'un refresh classique —
    // celui existant reste valide et doit être conservé par l'appelant (mission §56, jamais perdu).
    return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token, expiresInSeconds: parsed.expires_in, scopes: parsed.scope?.split(" ") ?? GOOGLE_SCOPES };
  }

  async fetchAccountInfo(accessToken: string): Promise<OAuthAccountInfo> {
    const info = await callProviderJson(USERINFO_URL, UserInfoSchema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);
    return { externalAccountId: info.id, externalAccountLabel: info.email, externalTenantId: info.hd };
  }

  /** Mission §12 — Google expose un vrai endpoint de révocation (contrairement à Microsoft),
   *  appelé en best-effort : un échec ne bloque jamais la déconnexion locale. */
  async revokeToken(refreshToken: string): Promise<void> {
    try {
      // Checkpoint TENDEROS-2.1-P2.3-E12 (P1, mission §50) — SEUL `fetch` sortant du module qui
      // contournait `callProviderJson` et partait donc SANS borne temporelle : un socket semi-ouvert
      // chez Google faisait pendre indéfiniment la requête de déconnexion de l'utilisateur, et le
      // `catch` best-effort ci-dessous ne se déclenche JAMAIS sur un hang (seulement sur un rejet).
      // Même durée que tout appel provider de ce module (`provider-http-client.ts`), jamais une
      // constante concurrente.
      await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, { method: "POST", signal: AbortSignal.timeout(REVOKE_REQUEST_TIMEOUT_MS) });
    } catch {
      // Best-effort (mission §12) — la suppression locale des credentials reste la garantie réelle.
    }
  }

  async listContainers(accessToken: string): Promise<readonly RemoteContainer[]> {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const containers: RemoteContainer[] = [{ id: "root", name: "Mon Drive", kind: "GOOGLE_MY_DRIVE" }];
    try {
      const schema = z.object({ drives: z.array(z.object({ id: z.string(), name: z.string() })).optional() });
      const shared = await callProviderJson(`${DRIVE_BASE_URL}/drives`, schema, { headers }, PROVIDER_LABEL);
      for (const drive of shared.drives ?? []) {
        containers.push({ id: drive.id, name: drive.name, kind: "GOOGLE_SHARED_DRIVE" });
      }
    } catch {
      // Aucun Shared Drive accessible n'empêche jamais l'usage de "Mon Drive" (mission §80).
    }
    return containers;
  }

  async listFolderChildren(accessToken: string, input: { containerId: string; folderId?: string | undefined }): Promise<RemoteFolderListing> {
    const parentId = input.folderId ?? input.containerId;
    const isSharedDrive = input.containerId !== "root";
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      fields: "files(id,name,mimeType,size,modifiedTime,md5Checksum,webViewLink)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (isSharedDrive) {
      params.set("corpora", "drive");
      params.set("driveId", input.containerId);
    }
    const schema = z.object({ files: z.array(DriveFileSchema) });
    const result = await callProviderJson(`${DRIVE_BASE_URL}/files?${params.toString()}`, schema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);

    const folders = result.files.filter((f) => f.mimeType === "application/vnd.google-apps.folder").map((f) => ({ id: f.id, name: f.name }));
    const files = result.files
      .filter((f) => f.mimeType !== "application/vnd.google-apps.folder")
      .map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.size ? Number(f.size) : 0,
        modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : new Date(0),
        eTag: f.md5Checksum,
        webUrl: f.webViewLink,
      }));
    return { folders, files };
  }

  async downloadFile(accessToken: string, input: { containerId: string; fileId: string; mimeType: string }): Promise<DownloadedFile> {
    const metaSchema = DriveFileSchema;
    const meta = await callProviderJson(`${DRIVE_BASE_URL}/files/${input.fileId}?fields=id,name,mimeType&supportsAllDrives=true`, metaSchema, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);

    const isNative = meta.mimeType.startsWith(GOOGLE_NATIVE_TYPE_PREFIX);
    const exportMimeType = GOOGLE_NATIVE_EXPORT_MIME_TYPES[meta.mimeType];
    if (isNative && !exportMimeType) {
      throw new UnsupportedRemoteFileTypeError();
    }

    const url = isNative
      ? `${DRIVE_BASE_URL}/files/${input.fileId}/export?mimeType=${encodeURIComponent(exportMimeType!)}`
      : `${DRIVE_BASE_URL}/files/${input.fileId}?alt=media&supportsAllDrives=true`;

    const buffer = await callProviderBinary(url, { headers: { Authorization: `Bearer ${accessToken}` } }, PROVIDER_LABEL);
    const extension = isNative ? (exportMimeType === GOOGLE_NATIVE_EXPORT_MIME_TYPES["application/vnd.google-apps.document"] ? ".docx" : ".xlsx") : "";
    return { buffer, mimeType: isNative ? exportMimeType! : meta.mimeType, filename: isNative ? `${meta.name}${extension}` : meta.name };
  }

  async uploadFile(accessToken: string, input: { containerId: string; folderId: string; filename: string; content: Buffer; mimeType: string }): Promise<RemoteFile> {
    if (input.content.byteLength > MAX_SIMPLE_UPLOAD_BYTES) {
      throw new RemoteProviderError({
        providerErrorCode: ProviderErrorCode.InvalidRequest,
        retryable: false,
        technicalDetail: "File exceeds the 20MB simple-upload limit — resumable upload sessions are not implemented this sprint (mission §43, documented limitation).",
      });
    }
    const metadata = { name: input.filename, parents: [input.folderId] };
    const boundary = `tenderos-${Date.now()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const schema = DriveFileSchema;
    // Correctif audit Codex (P1-004) — jamais de retry interne du client HTTP sur un échec ambigu :
    // un POST multipart de création de fichier n'est pas idempotent, une seconde tentative
    // automatique ici pourrait dupliquer AVANT même que la réservation applicative
    // (`NEEDS_RECONCILIATION`) ne puisse réagir.
    const created = await callProviderJson(
      `${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,webViewLink`,
      schema,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body },
      PROVIDER_LABEL,
      { retryAmbiguous: false },
    );
    return { id: created.id, name: created.name, mimeType: created.mimeType, sizeBytes: created.size ? Number(created.size) : input.content.byteLength, modifiedAt: created.modifiedTime ? new Date(created.modifiedTime) : new Date(), webUrl: created.webViewLink };
  }

  async createCalendarEvent(accessToken: string, input: { title: string; description: string; startAt: Date; endAt: Date; timezone: string }): Promise<{ externalEventId: string }> {
    const schema = z.object({ id: z.string() });
    // Correctif audit Codex (P1-004) — même motif que `uploadFile` : un POST de création
    // d'événement n'est pas idempotent, jamais de retry interne sur un échec ambigu.
    const created = await callProviderJson(
      `${CALENDAR_BASE_URL}/calendars/primary/events`,
      schema,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: input.title,
          description: input.description,
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
