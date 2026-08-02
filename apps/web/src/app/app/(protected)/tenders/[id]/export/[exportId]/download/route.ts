import { getAppOrganizationId, getAppSessionToken } from "../../../../../../../../lib/app-api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Proxy de téléchargement authentifié — même motif que documents/[id]/download/route.ts : le
 *  navigateur ne porte jamais le jeton de session, la requête est relayée côté serveur puis le
 *  flux binaire retransmis tel quel. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; exportId: string }> }): Promise<Response> {
  const { exportId } = await params;

  const [token, organizationId] = await Promise.all([getAppSessionToken(), getAppOrganizationId()]);
  if (!token || !organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const backendResponse = await fetch(`${API_BASE_URL}/api/v1/exports/${exportId}/download`, {
    headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId },
    cache: "no-store",
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response("Export not found.", { status: backendResponse.status });
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
