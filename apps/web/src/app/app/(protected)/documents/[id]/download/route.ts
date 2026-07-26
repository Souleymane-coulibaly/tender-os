import type { NextRequest } from "next/server";
import { getAppOrganizationId, getAppSessionToken } from "../../../../../../lib/app-api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/**
 * Proxy de telechargement authentifie : le navigateur ne porte jamais le jeton de session
 * (cookie httpOnly serveur uniquement, voir app-api-client.ts), donc un lien direct vers l'API
 * ne peut pas s'authentifier lui-meme. Cette route relaie la requete cote serveur avec les
 * bons en-tetes, puis retransmet le flux binaire tel quel (jamais bufferise en memoire).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const versionId = request.nextUrl.searchParams.get("versionId");

  const [token, organizationId] = await Promise.all([getAppSessionToken(), getAppOrganizationId()]);
  if (!token || !organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const path = versionId
    ? `/api/v1/documents/${id}/versions/${versionId}/download`
    : `/api/v1/documents/${id}/download`;

  const backendResponse = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId },
    cache: "no-store",
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response("Document not found.", { status: backendResponse.status });
  }

  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  const contentDisposition = backendResponse.headers.get("content-disposition");
  const contentLength = backendResponse.headers.get("content-length");
  if (contentType) headers.set("Content-Type", contentType);
  if (contentDisposition) headers.set("Content-Disposition", contentDisposition);
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(backendResponse.body, { status: 200, headers });
}
