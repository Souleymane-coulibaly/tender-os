import { getAppOrganizationId, getAppSessionToken } from "../../../../../../lib/app-api-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Sprint 8C.1 — proxy de téléchargement authentifié pour l'aperçu (toujours filigrané, jamais
 *  persisté) de l'Annexe TenderOS DC4 — même motif que documents/[id]/download/route.ts et
 *  administrative-dossier/dume-xml-draft/route.ts : le navigateur ne porte jamais le jeton de
 *  session. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id: subcontractorDeclarationId } = await params;

  const [token, organizationId] = await Promise.all([getAppSessionToken(), getAppOrganizationId()]);
  if (!token || !organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const backendResponse = await fetch(`${API_BASE_URL}/api/v1/administrative-subcontractors/${subcontractorDeclarationId}/official-form/preview`, {
    headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId },
    cache: "no-store",
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response("Preview not available.", { status: backendResponse.status });
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
