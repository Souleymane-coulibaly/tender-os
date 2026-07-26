import type { Metadata } from "next";
import Link from "next/link";
import { appApiFetch } from "../../../../lib/app-api-client";
import {
  DOCUMENT_DOMAIN_LABELS,
  DOCUMENT_ORIGIN_LABELS,
  DOCUMENT_STATUS_LABELS,
  formatFileSize,
  type DocumentDomain,
  type DocumentOrigin,
  type DocumentStatus,
  type DocumentSummary,
  type PageResponse,
} from "../../../../lib/documents-types";
import { ApiErrorState } from "../api-error-state";
import { DocumentFilters } from "./document-filters";

export const metadata: Metadata = { title: "Documents — TenderOS" };

type SearchParams = {
  cursor?: string;
  search?: string;
  status?: string;
  origin?: string;
  domain?: string;
};

export default async function DocumentsLibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams({ limit: "25", sort: "createdAt", sortDirection: "desc" });
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.origin) query.set("origin", params.origin);
  if (params.domain) query.set("domain", params.domain);

  let page: PageResponse<DocumentSummary>;
  try {
    page = await appApiFetch<PageResponse<DocumentSummary>>(`/api/v1/documents?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Documents</h1>
        <Link
          href="/app/documents/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Nouveau document
        </Link>
      </div>

      <DocumentFilters
        values={{
          search: params.search,
          status: params.status as DocumentStatus | undefined,
          origin: params.origin as DocumentOrigin | undefined,
          domain: params.domain as DocumentDomain | undefined,
        }}
      />

      {page.items.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun document a afficher.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2 pr-4">Titre</th>
                <th className="py-2 pr-4">Categorie</th>
                <th className="py-2 pr-4">Domaine</th>
                <th className="py-2 pr-4">Origine</th>
                <th className="py-2 pr-4">Statut</th>
                <th className="py-2 pr-4">Version</th>
                <th className="py-2 pr-4">Taille</th>
                <th className="py-2 pr-4">Modifie le</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((document) => (
                <tr key={document.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-4">
                    <Link href={`/app/documents/${document.id}`} className="font-medium text-neutral-900 hover:underline">
                      {document.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{document.category ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-600">{DOCUMENT_DOMAIN_LABELS[document.domain]}</td>
                  <td className="py-2 pr-4 text-neutral-600">{DOCUMENT_ORIGIN_LABELS[document.origin]}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        document.status === "ARCHIVED" ? "bg-neutral-200 text-neutral-700" : "bg-green-100 text-green-800"
                      }`}
                    >
                      {DOCUMENT_STATUS_LABELS[document.status]}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">v{document.currentVersionNumber}</td>
                  <td className="py-2 pr-4 text-neutral-600">
                    {document.currentVersion ? formatFileSize(document.currentVersion.sizeBytes) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600">{new Date(document.updatedAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Link
          href={`/app/documents?${new URLSearchParams({ ...params, cursor: page.pageInfo.nextCursor }).toString()}`}
          className="self-start text-sm text-neutral-700 hover:underline"
        >
          Page suivante →
        </Link>
      ) : null}
    </div>
  );
}
