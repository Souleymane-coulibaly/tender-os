"use client";

import { useState } from "react";
import { Badge, Card } from "../../../../../components/ui";
import type {
  CandidateBankAccount,
  CandidateCertification,
  CandidateDocument,
  CandidateHumanResource,
  CandidateInsurance,
  CandidateMaterialResource,
  CandidateReference,
  CandidateRepresentative,
  TemporalValidityStatus,
} from "../../../../../lib/candidate-capability-types";
import type { CandidateUiCapabilities } from "../../../../../lib/candidate-permissions";
import type { DocumentPickerOption } from "../../../connectors-actions";
import type { CandidateCompanySummary, CandidateEstablishmentSummary } from "../../../../../lib/candidate-company-types";
import { AddEstablishmentForm } from "./add-establishment-form";
import { CandidateBankingSection } from "./candidate-banking-section";
import {
  CandidateCapabilitySection,
  toCertificationRows,
  toHumanResourceRows,
  toInsuranceRows,
  toMaterialResourceRows,
  toReferenceRows,
  toRepresentativeRows,
} from "./candidate-capability-section";
import { CandidateDocumentsSection } from "./candidate-documents-section";
import { CandidateIdentityForm } from "./candidate-identity-form";

export type CandidateCompanyDossier = {
  company: CandidateCompanySummary;
  establishments: CandidateEstablishmentSummary[];
  representatives: CandidateRepresentative[];
  certifications: (CandidateCertification & { temporalStatus?: TemporalValidityStatus })[];
  insurances: (CandidateInsurance & { temporalStatus?: TemporalValidityStatus })[];
  references: CandidateReference[];
  humanResources: CandidateHumanResource[];
  materialResources: CandidateMaterialResource[];
  documents: CandidateDocument[];
  bankAccounts: CandidateBankAccount[];
  /** Bibliotheque documentaire de l'organisation, pour rattacher une piece deja televersee (gap F2). */
  libraryDocuments: DocumentPickerOption[];
};

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — fiche UNIQUE de l'entreprise candidate.
 *
 * Toutes les données proviennent des APIs CandidateCompany V2 (CCV2-C/C.1/D). Aucun composant
 * `company-profile` n'est monté ici, aucune lecture `/clients/:id/*` : la fiche candidate n'a plus
 * aucune dépendance Legacy — c'était l'objet du checkpoint.
 *
 * L'onglet bancaire n'est même pas RENDU si le rôle n'a pas `candidate:read_banking` : la décision
 * est prise côté serveur, avant l'envoi du HTML, donc aucune donnée sensible ne peut apparaître
 * puis disparaître pendant un chargement.
 */
export function CandidateCompanyTabs({ dossier, capabilities }: { dossier: CandidateCompanyDossier; capabilities: CandidateUiCapabilities }) {
  const tabs = [
    { key: "overview", label: "Vue d'ensemble" },
    { key: "identity", label: "Identité" },
    { key: "establishments", label: "Établissements" },
    { key: "representatives", label: "Représentants" },
    { key: "certifications", label: "Certifications" },
    { key: "insurances", label: "Assurances" },
    { key: "references", label: "Références" },
    { key: "resources", label: "Moyens" },
    // Checkpoint TENDEROS-2.1-CCV2-I.3 — libelle explicite : cote client la rubrique s'appelle
    // « Documents commerciaux ». Deux onglets nommes « Documents » a deux endroits differents
    // laisseraient croire a la meme surface, ce que la separation documentaire vise justement a
    // dissiper — le vocabulaire porte la frontiere autant que le code.
    { key: "documents", label: "Documents de candidature" },
    ...(capabilities.canReadBanking ? [{ key: "banking", label: "Coordonnées bancaires" }] : []),
  ] as const;

  const [active, setActive] = useState<string>("overview");
  const company = dossier.company;
  const principal = dossier.establishments.find((establishment) => establishment.isPrincipal);
  const expiredCount =
    dossier.certifications.filter((item) => item.temporalStatus === "EXPIRED").length +
    dossier.insurances.filter((item) => item.temporalStatus === "EXPIRED").length +
    dossier.documents.filter((item) => item.temporalStatus === "EXPIRED").length;
  const expiringCount =
    dossier.certifications.filter((item) => item.temporalStatus === "EXPIRING_SOON").length +
    dossier.insurances.filter((item) => item.temporalStatus === "EXPIRING_SOON").length +
    dossier.documents.filter((item) => item.temporalStatus === "EXPIRING_SOON").length;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Sections de l'entreprise candidate" className="flex flex-wrap gap-1 overflow-x-auto border-b border-tenderos-navy/10 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            aria-current={active === tab.key ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
              active === tab.key ? "border-tenderos-blue text-tenderos-navy" : "border-transparent text-tenderos-slate hover:border-tenderos-navy/20 hover:text-tenderos-navy"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {active === "overview" ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Établissements" value={String(dossier.establishments.length)} />
            <SummaryTile label="Certifications" value={String(dossier.certifications.length)} />
            <SummaryTile label="Documents" value={String(dossier.documents.length)} />
            <SummaryTile
              label="Pièces à surveiller"
              value={`${expiredCount} expirée${expiredCount > 1 ? "s" : ""} · ${expiringCount} bientôt`}
              tone={expiredCount > 0 ? "danger" : expiringCount > 0 ? "warning" : "neutral"}
            />
          </div>
          <Card title="Identité de l'entreprise candidate">
            <IdentityList company={company} principal={principal} />
          </Card>
        </div>
      ) : null}

      {active === "identity" ? (
        <Card title="Identité" description="Source de vérité de la personne morale qui candidate.">
          <IdentityList company={company} principal={principal} />
          {capabilities.canEditIdentity ? (
            <CandidateIdentityForm company={company} />
          ) : (
            <p className="mt-4 text-xs text-tenderos-slate">Votre rôle ne permet pas de modifier l&apos;identité de l&apos;entreprise candidate.</p>
          )}
        </Card>
      ) : null}

      {active === "establishments" ? (
        <Card title="Établissements" description="Établissements (SIRET) rattachés à cette entreprise candidate.">
          <div className="flex flex-col gap-4">
            {dossier.establishments.length === 0 ? (
              <p className="text-sm text-tenderos-slate">Aucun établissement pour le moment.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-tenderos-mist rounded-md border border-tenderos-mist">
                {dossier.establishments.map((establishment) => (
                  <li key={establishment.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-tenderos-navy">{establishment.siret}</span>
                        {establishment.isPrincipal ? <Badge tone="success">Principal</Badge> : null}
                      </div>
                      <span className="text-sm text-tenderos-slate">
                        {[establishment.addressLine, establishment.postalCode, establishment.city].filter(Boolean).join(", ") || "Adresse non renseignée"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {capabilities.canEditIdentity ? <AddEstablishmentForm candidateCompanyId={company.id} /> : null}
          </div>
        </Card>
      ) : null}

      {active === "representatives" ? (
        <Card title="Représentants et signataires" description="Ces contacts alimentent les formulaires DC1, DC2, DC4 et l'acte d'engagement.">
          <CandidateCapabilitySection
            candidateCompanyId={company.id}
            family="representatives"
            rows={toRepresentativeRows(dossier.representatives)}
            emptyLabel="Aucun représentant déclaré"
            addLabel="Ajouter un représentant"
            canEdit={capabilities.canEditCapabilities}
          />
        </Card>
      ) : null}

      {active === "certifications" ? (
        <Card title="Certifications" description="Une certification expirée n'est jamais exploitable pour un dossier courant.">
          <CandidateCapabilitySection
            candidateCompanyId={company.id}
            family="certifications"
            rows={toCertificationRows(dossier.certifications)}
            emptyLabel="Aucune certification"
            addLabel="Ajouter une certification"
            canEdit={capabilities.canEditCapabilities}
          />
        </Card>
      ) : null}

      {active === "insurances" ? (
        <Card title="Assurances">
          <CandidateCapabilitySection
            candidateCompanyId={company.id}
            family="insurances"
            rows={toInsuranceRows(dossier.insurances)}
            emptyLabel="Aucune assurance"
            addLabel="Ajouter une assurance"
            canEdit={capabilities.canEditCapabilities}
          />
        </Card>
      ) : null}

      {active === "references" ? (
        <Card title="Références" description="Références projet mobilisables dans un mémoire technique.">
          <CandidateCapabilitySection
            candidateCompanyId={company.id}
            family="references"
            rows={toReferenceRows(dossier.references)}
            emptyLabel="Aucune référence"
            addLabel="Ajouter une référence"
            canEdit={capabilities.canEditCapabilities}
          />
        </Card>
      ) : null}

      {active === "resources" ? (
        <div className="flex flex-col gap-6">
          <Card title="Moyens humains">
            <CandidateCapabilitySection
              candidateCompanyId={company.id}
              family="human-resources"
              rows={toHumanResourceRows(dossier.humanResources)}
              emptyLabel="Aucun moyen humain déclaré"
              addLabel="Ajouter un moyen humain"
              canEdit={capabilities.canEditCapabilities}
            />
          </Card>
          <Card title="Moyens matériels">
            <CandidateCapabilitySection
              candidateCompanyId={company.id}
              family="material-resources"
              rows={toMaterialResourceRows(dossier.materialResources)}
              emptyLabel="Aucun moyen matériel déclaré"
              addLabel="Ajouter un moyen matériel"
              canEdit={capabilities.canEditCapabilities}
            />
          </Card>
        </div>
      ) : null}

      {active === "documents" ? (
        <Card title="Documents d'entreprise" description="Pièces réutilisables pour les réponses aux appels d'offres.">
          <CandidateDocumentsSection
            candidateCompanyId={company.id}
            documents={dossier.documents}
            libraryDocuments={dossier.libraryDocuments}
            canUpload={capabilities.canUploadDocuments}
            canDelete={capabilities.canDeleteDocuments}
          />
        </Card>
      ) : null}

      {active === "banking" && capabilities.canReadBanking ? (
        <Card title="Coordonnées bancaires">
          <CandidateBankingSection candidateCompanyId={company.id} accounts={dossier.bankAccounts} canManage={capabilities.canManageBanking} />
        </Card>
      ) : null}
    </div>
  );
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "text-danger-fg" : tone === "warning" ? "text-warning-fg" : "text-tenderos-navy";
  return (
    <div className="rounded-lg border border-tenderos-mist bg-white p-4">
      <p className="text-xs font-semibold uppercase text-tenderos-slate">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function IdentityList({ company, principal }: { company: CandidateCompanySummary; principal: CandidateEstablishmentSummary | undefined }) {
  const entries: { label: string; value: string }[] = [
    { label: "Nom", value: company.name },
    { label: "Raison sociale", value: company.legalName ?? "Non renseigné" },
    // Checkpoint CCV2-F.2 — la colonne existait depuis CCV2-B et etait backfillee, mais n'etait
    // portee ni par l'agregat ni par le mapper : la donnee etait ecrite puis inaccessible.
    { label: "Nom commercial", value: company.tradeName ?? "Non renseigné" },
    { label: "SIREN", value: company.siren ?? "Non renseigné" },
    { label: "Forme juridique", value: company.legalForm ?? "Non renseigné" },
    { label: "TVA intracommunautaire", value: company.vatNumber ?? "Non renseigné" },
    { label: "SIRET principal", value: principal?.siret ?? "Non renseigné" },
    {
      label: "Adresse principale",
      value: principal ? [principal.addressLine, principal.postalCode, principal.city].filter(Boolean).join(", ") || "Non renseigné" : "Non renseigné",
    },
  ];
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((entry) => (
        <div key={entry.label}>
          <dt className="text-xs font-semibold uppercase text-tenderos-slate">{entry.label}</dt>
          <dd className="text-sm text-tenderos-navy">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}
