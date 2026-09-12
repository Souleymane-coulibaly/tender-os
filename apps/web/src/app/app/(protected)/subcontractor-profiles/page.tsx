import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { appApiFetch } from "../../../../lib/app-api-client";
import { SUBCONTRACTOR_PROFILE_STATUSES, SUBCONTRACTOR_PROFILE_STATUS_LABELS, SUBCONTRACTOR_PROFILE_STATUS_TONE, type SubcontractorProfile } from "../../../../lib/subcontractor-types";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Sous-traitants — TenderOS" };

type SearchParams = { search?: string; status?: string };

/**
 * Mission V2 Sprint 2 §6/§10 — répertoire ORGANISATIONNEL, réutilisable par plusieurs entreprises
 * candidates et Tenders. Explicitement hors périmètre ce sprint : sélection sur un Tender,
 * lot/montant/paiement direct (DC4).
 */
export default async function SubcontractorProfilesListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);

  let profiles: SubcontractorProfile[];
  try {
    profiles = await appApiFetch<SubcontractorProfile[]>(`/api/v1/subcontractor-profiles?${query.toString()}`);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        guideKey="subcontractors"
        breadcrumb={[{ label: "Sous-traitants" }]}
        title="Sous-traitants"
        description={<>{profiles.length} sous-traitant(s) — répertoire de l&apos;organisation, réutilisable pour tous vos appels d&apos;offres.</>}
        actions={
          <div data-tour="guide-subcontractors-create" className="flex">
            <Button href="/app/subcontractor-profiles/new" variant="primary">
              Nouveau sous-traitant
            </Button>
          </div>
        }
      />

      <div data-tour="guide-subcontractors-filters">
        <Card padding="tight">
          <form className="flex flex-wrap items-end gap-3" action="/app/subcontractor-profiles">
            <Input
              label="Recherche"
              id="search"
              name="search"
              defaultValue={params.search}
              placeholder="Raison sociale..."
              wrapperClassName="min-w-[12rem] flex-1 sm:max-w-xs"
            />
            <Select label="Statut" id="status" name="status" defaultValue={params.status ?? ""} wrapperClassName="basis-40">
              <option value="">Tous</option>
              {SUBCONTRACTOR_PROFILE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {SUBCONTRACTOR_PROFILE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <Button type="submit">Filtrer</Button>
          </form>
        </Card>
      </div>

      <div data-tour="guide-subcontractors-list">
        {profiles.length === 0 ? (
          <EmptyState title="Aucun sous-traitant ne correspond à ces critères." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Raison sociale</TableHeaderCell>
                <TableHeaderCell>SIRET</TableHeaderCell>
                <TableHeaderCell>Domaines</TableHeaderCell>
                <TableHeaderCell>Statut</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <Link href={`/app/subcontractor-profiles/${profile.id}`} className="font-medium text-tenderos-navy hover:underline">
                      {profile.legalName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-tenderos-slate">{profile.siret ?? "—"}</TableCell>
                  <TableCell className="text-tenderos-slate">{profile.domains ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone={SUBCONTRACTOR_PROFILE_STATUS_TONE[profile.status] ?? "neutral"}>{SUBCONTRACTOR_PROFILE_STATUS_LABELS[profile.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/app/subcontractor-profiles/${profile.id}`} className="text-tenderos-blue hover:underline">
                      Ouvrir
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
