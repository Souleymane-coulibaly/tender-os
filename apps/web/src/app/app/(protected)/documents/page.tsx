import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
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
      <PageHeader
        breadcrumb={[{ label: "Documents" }]}
        title="Documents"
        actions={
          <Button href="/app/documents/new" variant="primary">
            Nouveau document
          </Button>
        }
      />

      <DocumentFilters
        values={{
          search: params.search,
          status: params.status as DocumentStatus | undefined,
          origin: params.origin as DocumentOrigin | undefined,
          domain: params.domain as DocumentDomain | undefined,
        }}
      />

      {page.items.length === 0 ? (
        <EmptyState title="Aucun document a afficher." />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Titre</TableHeaderCell>
              <TableHeaderCell>Catégorie</TableHeaderCell>
              <TableHeaderCell>Domaine</TableHeaderCell>
              <TableHeaderCell>Origine</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Version</TableHeaderCell>
              <TableHeaderCell>Taille</TableHeaderCell>
              <TableHeaderCell>Modifié le</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((document) => (
              <TableRow key={document.id}>
                <TableCell>
                  <Link href={`/app/documents/${document.id}`} className="font-medium text-tenderos-navy hover:underline">
                    {document.title}
                  </Link>
                </TableCell>
                <TableCell className="text-tenderos-slate">{document.category ?? "—"}</TableCell>
                <TableCell className="text-tenderos-slate">{DOCUMENT_DOMAIN_LABELS[document.domain]}</TableCell>
                <TableCell className="text-tenderos-slate">{DOCUMENT_ORIGIN_LABELS[document.origin]}</TableCell>
                <TableCell>
                  <Badge tone={document.status === "ARCHIVED" ? "neutral" : "success"}>{DOCUMENT_STATUS_LABELS[document.status]}</Badge>
                </TableCell>
                <TableCell className="text-tenderos-slate">v{document.currentVersionNumber}</TableCell>
                <TableCell className="text-tenderos-slate">
                  {document.currentVersion ? formatFileSize(document.currentVersion.sizeBytes) : "—"}
                </TableCell>
                <TableCell className="text-tenderos-slate">{new Date(document.updatedAt).toLocaleDateString("fr-FR")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {page.pageInfo.hasNextPage && page.pageInfo.nextCursor ? (
        <Button
          variant="link"
          href={`/app/documents?${new URLSearchParams({ ...params, cursor: page.pageInfo.nextCursor }).toString()}`}
          className="self-start"
        >
          Page suivante →
        </Button>
      ) : null}
    </div>
  );
}
