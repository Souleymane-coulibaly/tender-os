import type { Metadata } from "next";
import { Badge, Card, PageHeader } from "../../../../../components/ui";
import { candidateCompanyDisplayName, CANDIDATE_COMPANY_STATUS_LABELS, type CandidateCompanySummary, type CandidateEstablishmentSummary } from "../../../../../lib/candidate-company-types";
import { fetchCandidateCompany, fetchCandidateEstablishments } from "../../../candidate-company-actions";
import { ApiErrorState } from "../../api-error-state";
import { AddEstablishmentForm } from "./add-establishment-form";

export const metadata: Metadata = { title: "Entreprise candidate — TenderOS" };

/**
 * Checkpoint 2.1-A5 — mission §14 : "N'afficher que ce qui est réellement supporté." Les capacités
 * (représentants/signataires/certifications/assurances/références/moyens) n'ont toujours aucune
 * table satellite propre à CandidateCompany (voir A4/A6.3, `DEFERRED-BE-05` — future consolidation
 * volontairement hors périmètre) : cette section reste donc absente ici, jamais une liste inventée.
 *
 * Checkpoint 2.1-A6.4 (DEFERRED-BE-04, résolu) — le listing des établissements déjà ajoutés, lui,
 * existe désormais côté backend (`GET /candidate-companies/:id/establishments`) et est affiché ici.
 */
export default async function CandidateCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let company: CandidateCompanySummary;
  let establishments: CandidateEstablishmentSummary[];
  try {
    [company, establishments] = await Promise.all([fetchCandidateCompany(id), fetchCandidateEstablishments(id).then((page) => page.items)]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Entreprises candidates", href: "/app/candidate-companies" }, { label: candidateCompanyDisplayName(company) }]}
        title={candidateCompanyDisplayName(company)}
        status={<Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>{CANDIDATE_COMPANY_STATUS_LABELS[company.status]}</Badge>}
      />

      <Card title="Identité">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase text-tenderos-slate">Nom</dt>
            <dd className="text-sm text-tenderos-navy">{company.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-tenderos-slate">Raison sociale</dt>
            <dd className="text-sm text-tenderos-navy">{company.legalName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-tenderos-slate">SIREN</dt>
            <dd className="text-sm text-tenderos-navy">{company.siren ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-tenderos-slate">Forme juridique</dt>
            <dd className="text-sm text-tenderos-navy">{company.legalForm ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase text-tenderos-slate">TVA intracommunautaire</dt>
            <dd className="text-sm text-tenderos-navy">{company.vatNumber ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Établissements" description="Établissements (SIRET) rattachés à cette entreprise candidate.">
        <div className="flex flex-col gap-4">
          {establishments.length === 0 ? (
            <p className="text-sm text-tenderos-slate">Aucun établissement ajouté pour le moment.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-tenderos-mist rounded-md border border-tenderos-mist">
              {establishments.map((establishment) => (
                <li key={establishment.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-tenderos-navy">{establishment.label ?? establishment.siret}</span>
                      {establishment.isPrincipal ? <Badge tone="info">Principal</Badge> : null}
                    </div>
                    <span className="text-xs text-tenderos-slate">
                      SIRET {establishment.siret}
                      {establishment.city ? ` · ${establishment.city}` : ""}
                      {establishment.postalCode ? ` (${establishment.postalCode})` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AddEstablishmentForm candidateCompanyId={company.id} />
        </div>
      </Card>

      <Card title="Capacités (certifications, assurances, références, moyens)" description="Non disponible pour les entreprises candidates aujourd'hui.">
        <p className="text-sm text-tenderos-slate">
          Ces données restent gérées via la fiche entreprise du client tant que la migration backend correspondante n&apos;a pas eu lieu (différée — voir le
          registre des travaux différés, DEFERRED-BE-05).
        </p>
      </Card>
    </div>
  );
}
