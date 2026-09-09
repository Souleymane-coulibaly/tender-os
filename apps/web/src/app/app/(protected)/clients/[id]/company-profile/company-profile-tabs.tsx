"use client";

import { useState } from "react";
import { RetiredBidderNotice } from "./retired-bidder-notice";
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
  { key: "identity", label: "Identité légale (historique)" },
  { key: "representatives", label: "Contacts" },
  { key: "banking", label: "Banque" },
  { key: "insurances", label: "Assurances" },
  { key: "certifications", label: "Certifications" },
  { key: "references", label: "Références" },
  { key: "resources", label: "Moyens humains & matériels" },
  { key: "documents", label: "Documents commerciaux" },
] as const;

type TabKey = (typeof TABS)[number]["key"];


/**
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — rubrique de CANDIDATURE consultable mais non modifiable ici.
 *
 * `fieldset disabled` desactive NATIVEMENT tous les controles descendants : ce n'est ni un masquage
 * CSS ni une reecriture des sections en vue lecture seule. Les donnees historiques restent
 * entierement visibles, et aucune action vouee a echouer (409 `CLIENT_BIDDER_WRITE_RETIRED`) n'est
 * proposee. L'autorite reste evidemment le backend, qui refuse quoi qu'affiche l'interface.
 */
function RetiredBidderSection({ domainLabel, isEmpty = false, children }: { domainLabel: string; isEmpty?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Checkpoint TENDEROS-2.1-CCV2-I.2 — apres migration, la lecture client est bornee aux lignes
          purement historiques : une rubrique dont toutes les donnees ont acquis leur proprietaire
          candidate devient VIDE. Continuer d'annoncer « les donnees ci-dessous » serait alors faux,
          et laisserait croire a une perte. L'avertissement dit donc ce qui s'est reellement passe. */}
      <RetiredBidderNotice domainLabel={domainLabel} isEmpty={isEmpty} />
      <fieldset disabled className="min-w-0 border-0 p-0 opacity-70">
        {children}
      </fieldset>
    </div>
  );
}

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

      {activeTab === "identity" ? (
        <RetiredBidderSection domainLabel="L'identité juridique (raison sociale, SIREN, SIRET, forme juridique, adresse)" isEmpty={profile.legalIdentity === null}><LegalIdentitySection legalIdentity={profile.legalIdentity} /></RetiredBidderSection>
      ) : null}
      {activeTab === "representatives" ? <RepresentativesSection clientId={clientId} representatives={profile.representatives} /> : null}
      {activeTab === "banking" ? (
        <RetiredBidderSection domainLabel="Les coordonnées bancaires de candidature" isEmpty={profile.bankAccounts.length === 0}><BankAccountsSection clientId={clientId} bankAccounts={profile.bankAccounts} /></RetiredBidderSection>
      ) : null}
      {activeTab === "insurances" ? (
        <RetiredBidderSection domainLabel="Les assurances" isEmpty={profile.insurances.length === 0}><InsurancesSection clientId={clientId} insurances={profile.insurances} /></RetiredBidderSection>
      ) : null}
      {activeTab === "certifications" ? (
        <RetiredBidderSection domainLabel="Les certifications" isEmpty={profile.certifications.length === 0}><CertificationsSection clientId={clientId} certifications={profile.certifications} /></RetiredBidderSection>
      ) : null}
      {activeTab === "references" ? (
        <RetiredBidderSection domainLabel="Les références professionnelles" isEmpty={profile.references.length === 0}><ReferencesSection clientId={clientId} references={profile.references} /></RetiredBidderSection>
      ) : null}
      {activeTab === "resources" ? (
        <RetiredBidderSection domainLabel="Les moyens humains et matériels" isEmpty={profile.humanResources.length === 0 && profile.materialResources.length === 0}>
        <ResourcesSection clientId={clientId} humanResources={profile.humanResources} materialResources={profile.materialResources} />
        </RetiredBidderSection>
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
