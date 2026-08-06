"use client";

import { useState } from "react";
import { CATEGORY_STATUS_LABELS, categoryStatusBadgeClass, type CompanyProfileSummary } from "../../../../../../lib/company-profile-types";
import { BankAccountsSection } from "./bank-accounts-section";
import { CertificationsSection } from "./certifications-section";
import { DocumentsSection } from "./documents-section";
import { InsurancesSection } from "./insurances-section";
import { LegalIdentitySection } from "./legal-identity-section";
import { ReferencesSection } from "./references-section";
import { RepresentativesSection } from "./representatives-section";
import { ResourcesSection } from "./resources-section";

const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "identity", label: "Identité légale" },
  { key: "representatives", label: "Contacts & signataires" },
  { key: "banking", label: "Banque" },
  { key: "insurances", label: "Assurances" },
  { key: "certifications", label: "Certifications" },
  { key: "references", label: "Références" },
  { key: "resources", label: "Moyens humains & matériels" },
  { key: "documents", label: "Documents" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Mission §10 — fiche progressive : chaque section se sauvegarde indépendamment (jamais un
 *  formulaire unique géant), la complétude/onglets manquants sont visibles depuis "Vue
 *  d'ensemble" sans devoir naviguer section par section. */
export function CompanyProfileTabs({ clientId, profile }: { clientId: string; profile: CompanyProfileSummary }) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t px-3 py-2 text-sm font-medium ${
              activeTab === tab.key ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(Object.entries(profile.completeness) as [keyof CompanyProfileSummary["completeness"], CompanyProfileSummary["completeness"][keyof CompanyProfileSummary["completeness"]]][]).map(
            ([category, status]) => (
              <div key={category} className="rounded border border-neutral-200 p-3">
                <p className="text-xs uppercase tracking-wide text-neutral-500">{CATEGORY_LABELS[category]}</p>
                <span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${categoryStatusBadgeClass(status)}`}>{CATEGORY_STATUS_LABELS[status]}</span>
              </div>
            ),
          )}
        </div>
      ) : null}

      {activeTab === "identity" ? <LegalIdentitySection clientId={clientId} legalIdentity={profile.legalIdentity} /> : null}
      {activeTab === "representatives" ? <RepresentativesSection clientId={clientId} representatives={profile.representatives} /> : null}
      {activeTab === "banking" ? <BankAccountsSection clientId={clientId} bankAccounts={profile.bankAccounts} /> : null}
      {activeTab === "insurances" ? <InsurancesSection clientId={clientId} insurances={profile.insurances} /> : null}
      {activeTab === "certifications" ? <CertificationsSection clientId={clientId} certifications={profile.certifications} /> : null}
      {activeTab === "references" ? <ReferencesSection clientId={clientId} references={profile.references} /> : null}
      {activeTab === "resources" ? (
        <ResourcesSection clientId={clientId} humanResources={profile.humanResources} materialResources={profile.materialResources} />
      ) : null}
      {activeTab === "documents" ? <DocumentsSection clientId={clientId} documents={profile.documents} /> : null}
    </div>
  );
}

const CATEGORY_LABELS: Record<keyof CompanyProfileSummary["completeness"], string> = {
  identity: "Identité légale",
  banking: "Comptes bancaires",
  insurances: "Assurances",
  certifications: "Certifications",
  references: "Références",
  resources: "Moyens",
  documents: "Documents",
};
