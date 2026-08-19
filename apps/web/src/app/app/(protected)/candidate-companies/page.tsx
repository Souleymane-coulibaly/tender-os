import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Button, EmptyState, PageHeader, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui";
import { candidateCompanyDisplayName, CANDIDATE_COMPANY_STATUS_LABELS, type CandidateCompanyPage } from "../../../../lib/candidate-company-types";
import { fetchCandidateCompanies } from "../../candidate-company-actions";
import { ApiErrorState } from "../api-error-state";

export const metadata: Metadata = { title: "Entreprises candidates — TenderOS" };

/**
 * Checkpoint 2.1-A5 — première surface dédiée à CandidateCompany (A1-A4), jusqu'ici sans aucune UI.
 * Distinct de /app/clients (ClientAccount = relation commerciale/portefeuille) : une
 * CandidateCompany est l'entité JURIDIQUE qui répond effectivement à un appel d'offres, et une même
 * organisation peut en porter plusieurs simultanément (mission §15 "multi-candidate").
 */
export default async function CandidateCompaniesListPage() {
  let page: CandidateCompanyPage;
  try {
    page = await fetchCandidateCompanies();
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Entreprises candidates" }]}
        title="Entreprises candidates"
        description={`${page.total} entreprise(s) candidate(s) — l'entité juridique qui répond à vos appels d'offres, distincte de vos clients.`}
        actions={
          <Button href="/app/candidate-companies/new" variant="primary">
            Nouvelle entreprise candidate
          </Button>
        }
      />

      {page.items.length === 0 ? (
        <EmptyState
          title="Aucune entreprise candidate"
          description="Créez la fiche de l'entreprise qui répondra effectivement à vos appels d'offres. Elle pourra ensuite être rattachée à un ou plusieurs Tenders/Opportunités."
          actions={
            <Button href="/app/candidate-companies/new" variant="primary">
              Créer la première entreprise candidate
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Nom</TableHeaderCell>
              <TableHeaderCell>Raison sociale</TableHeaderCell>
              <TableHeaderCell>SIREN</TableHeaderCell>
              <TableHeaderCell>Forme juridique</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {page.items.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <Link href={`/app/candidate-companies/${company.id}`} className="font-medium text-tenderos-navy hover:underline">
                    {candidateCompanyDisplayName(company)}
                  </Link>
                </TableCell>
                <TableCell className="text-tenderos-slate">{company.legalName ?? "—"}</TableCell>
                <TableCell className="text-tenderos-slate">{company.siren ?? "—"}</TableCell>
                <TableCell className="text-tenderos-slate">{company.legalForm ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>{CANDIDATE_COMPANY_STATUS_LABELS[company.status]}</Badge>
                </TableCell>
                <TableCell>
                  <Link href={`/app/candidate-companies/${company.id}`} className="text-tenderos-blue hover:underline">
                    Ouvrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
