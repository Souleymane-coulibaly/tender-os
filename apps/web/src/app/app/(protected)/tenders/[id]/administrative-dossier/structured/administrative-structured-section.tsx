"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDc2DeclarationVersionAction,
  createDumeDeclarationVersionAction,
  createSigningPowerAction,
  createSubcontractorDeclarationAction,
  ensureConsortiumAction,
  ensureDc1DeclarationAction,
  ensureDc2DeclarationAction,
  ensureDumeDeclarationAction,
  ensureEngagementActAction,
  freezeEngagementActPricingAction,
  generateDc1DocumentAction,
  generateDc2DocumentAction,
  generateDc4OfficialFormAction,
  generateDumeDocumentAction,
  generateEngagementActDocumentAction,
  generateSubcontractorDeclarationDocumentAction,
  linkSigningPowerProofAction,
  prepareDc4OfficialFormAction,
  saveDc4OfficialFormDraftAction,
  unfreezeEngagementActPricingAction,
  updateConsortiumAction,
  updateDc1DeclarationAction,
  verifySigningPowerAction,
} from "../../../../../administrative-dossier-actions";
import {
  CONSORTIUM_TYPE_LABELS,
  DC1_CANDIDATE_TYPE_LABELS,
  SIGNING_POWER_STATUS_LABELS,
  type AdministrativeDocumentSummary,
  type AdministrativeDossierCapabilities,
  type ConsortiumMember,
  type ConsortiumSummary,
  type Dc1DeclarationSummary,
  type Dc2DeclarationWithVersions,
  type DumeDeclarationWithVersions,
  type EngagementActSummary,
  type OfficialFormPreparationResult,
  type SigningPowerSummary,
  type SubcontractorDeclarationSummary,
  type AdministrativeDocumentListItem,
} from "../../../../../../../lib/administrative-dossier-types";
import { Button } from "../../../../../../../components/ui/button";
import { Input } from "../../../../../../../components/ui/input";
import { Select } from "../../../../../../../components/ui/select";

/** Sprint 8C Phase 3 — lien de téléchargement du PDF généré, réutilise le proxy authentifié déjà
 *  existant pour tout Document (le PDF généré EST un Document réel du module Documents). */
function GeneratedPdfLink({
  document,
  label = "PDF généré — télécharger",
}: {
  document: AdministrativeDocumentSummary;
  label?: string;
}) {
  const latestRevision = document.revisions[document.revisions.length - 1];
  if (!latestRevision?.documentId) return null;
  return (
    <a
      href={`/app/documents/${latestRevision.documentId}/download`}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-success-fg underline"
    >
      {label}
    </a>
  );
}

function ErrorText({ error }: { error: string | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-danger-fg">
      {error}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded border border-tenderos-navy/10 p-3">
      <h2 className="text-sm font-semibold text-tenderos-navy">{title}</h2>
      {children}
    </section>
  );
}

function ConsortiumSection({
  tenderId,
  consortium,
  canEdit,
  onChanged,
}: {
  tenderId: string;
  consortium: ConsortiumSummary | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberPercentage, setMemberPercentage] = useState("");

  async function handleEnsure(type: string) {
    setIsPending(true);
    setError(undefined);
    const result = await ensureConsortiumAction(tenderId, type);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleAddMember() {
    if (!consortium || !memberName.trim() || !memberRole.trim()) return;
    setIsPending(true);
    setError(undefined);
    const newMember: ConsortiumMember = {
      memberId: crypto.randomUUID(),
      name: memberName,
      role: memberRole,
      ...(memberPercentage ? { percentage: Number(memberPercentage) } : {}),
    };
    const members = [...consortium.members, newMember];
    const result = await updateConsortiumAction(tenderId, consortium.id, { members });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setMemberName("");
      setMemberRole("");
      setMemberPercentage("");
      onChanged();
    }
  }

  async function handleSetMandataire(memberId: string) {
    if (!consortium) return;
    setIsPending(true);
    setError(undefined);
    const result = await updateConsortiumAction(tenderId, consortium.id, {
      mandataireMemberId: memberId,
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  return (
    <Section title="Groupement (Consortium)">
      {!consortium ? (
        canEdit ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(CONSORTIUM_TYPE_LABELS).map(([type, label]) => (
              <Button
                key={type}
                type="button"
                disabled={isPending}
                onClick={() => handleEnsure(type)}
                variant="primary"
                size="sm"
              >
                Créer — {label}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-tenderos-slate">
            Aucun groupement pour ce marché (candidat individuel).
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tenderos-navy">
            Type :{" "}
            <span className="font-medium">
              {CONSORTIUM_TYPE_LABELS[consortium.type] ?? consortium.type}
            </span>
          </p>
          <ul className="flex flex-col gap-1">
            {consortium.members.map((m) => (
              <li
                key={m.memberId}
                className="flex items-center justify-between gap-2 rounded bg-tenderos-light px-2 py-1 text-xs text-tenderos-navy"
              >
                <span>
                  {m.name} — {m.role} {m.percentage !== undefined ? `(${m.percentage}%)` : ""}{" "}
                  {consortium.mandataireMemberId === m.memberId ? (
                    <strong>· mandataire</strong>
                  ) : null}
                </span>
                {canEdit && consortium.mandataireMemberId !== m.memberId ? (
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSetMandataire(m.memberId)}
                    variant="ghost"
                    size="sm"
                  >
                    Désigner mandataire
                  </Button>
                ) : null}
              </li>
            ))}
            {consortium.members.length === 0 ? (
              <p className="text-xs text-tenderos-slate">Aucun membre déclaré.</p>
            ) : null}
          </ul>
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Nom
                <Input value={memberName} onChange={(e) => setMemberName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Rôle
                <Input value={memberRole} onChange={(e) => setMemberRole(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Pourcentage
                <Input
                  value={memberPercentage}
                  onChange={(e) => setMemberPercentage(e.target.value)}
                  type="number"
                  min={0}
                  max={100}
                  className="w-20"
                />
              </label>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleAddMember}
                variant="primary"
                size="sm"
              >
                Ajouter le membre
              </Button>
            </div>
          ) : null}
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  );
}

function Dc1Section({
  tenderId,
  dc1,
  canEdit,
  onChanged,
}: {
  tenderId: string;
  dc1: Dc1DeclarationSummary | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [signatoryName, setSignatoryName] = useState(dc1?.signatoryName ?? "");
  const [generatedDocument, setGeneratedDocument] = useState<
    AdministrativeDocumentSummary | undefined
  >();

  async function handleEnsure() {
    setIsPending(true);
    setError(undefined);
    const result = await ensureDc1DeclarationAction(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleSaveSignatory() {
    if (!dc1) return;
    setIsPending(true);
    setError(undefined);
    const result = await updateDc1DeclarationAction(tenderId, dc1.id, { signatoryName });
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleGeneratePdf() {
    setIsPending(true);
    setError(undefined);
    const result = await generateDc1DocumentAction(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setGeneratedDocument(result.document);
      onChanged();
    }
  }

  return (
    <Section title="DC1 — Lettre de candidature">
      {!dc1 ? (
        canEdit ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={handleEnsure}
            className="w-fit"
            variant="primary"
            size="sm"
          >
            Créer le DC1
          </Button>
        ) : (
          <p className="text-sm text-tenderos-slate">Aucun DC1 pour ce marché.</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tenderos-navy">
            Type de candidature :{" "}
            <span className="font-medium">
              {DC1_CANDIDATE_TYPE_LABELS[dc1.candidateType] ?? dc1.candidateType}
            </span>
          </p>
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Signataire
                <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} />
              </label>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleSaveSignatory}
                variant="primary"
                size="sm"
              >
                Enregistrer
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleGeneratePdf}
                variant="secondary"
                size="sm"
              >
                Générer le PDF
              </Button>
              {generatedDocument ? <GeneratedPdfLink document={generatedDocument} /> : null}
            </div>
          ) : null}
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  );
}

function StructuredDeclarationSection({
  title,
  tenderId,
  declaration,
  onEnsure,
  onCreateVersion,
  onGeneratePdf,
  xmlDraftHref,
  canEdit,
  onChanged,
}: {
  title: string;
  tenderId: string;
  declaration: Dc2DeclarationWithVersions | DumeDeclarationWithVersions | null;
  onEnsure: (tenderId: string) => Promise<{ error?: string }>;
  onCreateVersion: (
    tenderId: string,
    declarationId: string,
    legalIdentity: string,
  ) => Promise<{ error?: string }>;
  onGeneratePdf: (
    tenderId: string,
  ) => Promise<{ error?: string; document?: AdministrativeDocumentSummary }>;
  /** Présent uniquement pour le DUME — brouillon XML non officiel, jamais persisté. */
  xmlDraftHref?: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [legalIdentity, setLegalIdentity] = useState("");
  const [generatedDocument, setGeneratedDocument] = useState<
    AdministrativeDocumentSummary | undefined
  >();

  async function handleEnsure() {
    setIsPending(true);
    setError(undefined);
    const result = await onEnsure(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleCreateVersion() {
    if (!declaration || !legalIdentity.trim()) return;
    setIsPending(true);
    setError(undefined);
    const result = await onCreateVersion(tenderId, declaration.declaration.id, legalIdentity);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setLegalIdentity("");
      onChanged();
    }
  }

  async function handleGeneratePdf() {
    setIsPending(true);
    setError(undefined);
    const result = await onGeneratePdf(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setGeneratedDocument(result.document);
      onChanged();
    }
  }

  return (
    <Section title={title}>
      {!declaration ? (
        canEdit ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={handleEnsure}
            className="w-fit"
            variant="primary"
            size="sm"
          >
            Créer
          </Button>
        ) : (
          <p className="text-sm text-tenderos-slate">Aucune déclaration pour ce marché.</p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-tenderos-navy">
            Version courante : {declaration.declaration.currentVersionNumber}
          </p>
          <ul className="flex flex-col gap-1">
            {declaration.versions.map((v) => (
              <li
                key={v.id}
                className="rounded bg-tenderos-light px-2 py-1 text-xs text-tenderos-navy"
              >
                v{v.version} — {v.data.legalIdentity ?? "(identité légale non renseignée)"}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Identité légale (nouvelle version)
                <Input value={legalIdentity} onChange={(e) => setLegalIdentity(e.target.value)} />
              </label>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleCreateVersion}
                variant="primary"
                size="sm"
              >
                Créer une nouvelle version
              </Button>
              {declaration.declaration.currentVersionNumber > 0 ? (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleGeneratePdf}
                  variant="secondary"
                  size="sm"
                >
                  Générer le PDF
                </Button>
              ) : null}
              {generatedDocument ? <GeneratedPdfLink document={generatedDocument} /> : null}
              {xmlDraftHref && declaration.declaration.currentVersionNumber > 0 ? (
                <a href={xmlDraftHref} className="text-xs text-tenderos-slate underline">
                  Télécharger le brouillon XML (non officiel)
                </a>
              ) : null}
            </div>
          ) : null}
          {xmlDraftHref ? (
            <p className="text-xs text-tenderos-slate">
              Le brouillon XML ne respecte pas le schéma d&apos;échange officiel ESPD — ne pas le
              déposer tel quel.
            </p>
          ) : null}
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  );
}

/** Sprint 8C.1 — champs du brouillon DC4 éditables côté frontend, doivent rester synchronisés avec
 *  `SaveDc4OfficialFormDraftBodySchema` (API) — les identifiants/montants/déclarations structurés
 *  restent en lecture seule ici, saisis via le formulaire DC4 existant, jamais réinventés dans ce
 *  brouillon (mission "aucune valeur invitée"). */
const DC4_DRAFT_FIELDS: readonly { key: string; label: string }[] = [
  { key: "subcontractorLegalIdentifier", label: "Identifiant légal (SIRET)" },
  { key: "percentageOfTotal", label: "Pourcentage du marché" },
  { key: "paymentTerms", label: "Modalités de paiement" },
  { key: "directPaymentApplicable", label: "Paiement direct applicable (Oui/Non)" },
];

/** Sprint 8C.1 — carte "Formulaire officiel DC4" : télécharge le formulaire officiel intact (jamais
 *  modifié), édite un brouillon LOCAL (jamais écrit sur la déclaration DC4 elle-même), prévisualise
 *  (toujours filigrané) puis génère l'Annexe TenderOS (DOCX réel, jointe à ce formulaire officiel). */
function OfficialFormCard({
  tenderId,
  subcontractorDeclarationId,
  canEdit,
}: {
  tenderId: string;
  subcontractorDeclarationId: string;
  canEdit: boolean;
}) {
  const [state, setState] = useState<OfficialFormPreparationResult | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [generatedDocument, setGeneratedDocument] = useState<
    AdministrativeDocumentSummary | undefined
  >();

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    prepareDc4OfficialFormAction(subcontractorDeclarationId).then((result) => {
      if (cancelled) return;
      setIsLoading(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.result) {
        setState(result.result);
        setDraft(
          Object.fromEntries(
            DC4_DRAFT_FIELDS.map((field) => [
              field.key,
              result.result!.fieldSources[field.key] === "USER_INPUT"
                ? (result.result!.values[field.key] ?? "")
                : "",
            ]),
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [subcontractorDeclarationId]);

  async function handleSaveDraft() {
    setIsPending(true);
    setError(undefined);
    const result = await saveDc4OfficialFormDraftAction(
      tenderId,
      subcontractorDeclarationId,
      draft,
    );
    setIsPending(false);
    if (result.error) setError(result.error);
    else if (result.result) setState(result.result);
  }

  async function handleGenerate() {
    setIsPending(true);
    setError(undefined);
    const result = await generateDc4OfficialFormAction(tenderId, subcontractorDeclarationId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else setGeneratedDocument(result.document);
  }

  if (isLoading) {
    return <p className="text-xs text-tenderos-slate">Chargement du formulaire officiel…</p>;
  }
  if (!state) {
    return <ErrorText error={error} />;
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-tenderos-navy/10 bg-white px-2 py-2 text-xs text-tenderos-navy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Formulaire officiel — DC4</span>
        {state.referenceTemplate ? (
          <a
            href={`/app/documents/${state.referenceTemplate.fileDocumentId}/download`}
            target="_blank"
            rel="noreferrer"
            className="text-success-fg underline"
          >
            Télécharger le formulaire officiel
            {state.referenceTemplate.kind === "BUYER" ? " (modèle acheteur)" : ""}
          </a>
        ) : (
          <span className="text-warning-fg">
            Aucun gabarit officiel configuré pour ce type de formulaire.
          </span>
        )}
      </div>

      {state.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-warning-fg">
          {state.warnings.map((warning) => (
            <li key={warning.fieldPath}>{warning.message}</li>
          ))}
        </ul>
      ) : null}

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          {DC4_DRAFT_FIELDS.map((field) => (
            <label key={field.key} className="flex flex-col gap-1">
              {field.label}
              <Input
                type="text"
                value={draft[field.key] ?? ""}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
              />
            </label>
          ))}
          <Button
            type="button"
            disabled={isPending}
            onClick={handleSaveDraft}
            variant="secondary"
            size="sm"
          >
            Enregistrer le brouillon
          </Button>
          <a
            href={`/app/administrative-subcontractors/${subcontractorDeclarationId}/official-form-preview`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-tenderos-navy/15 px-2 py-1"
          >
            Aperçu (filigrané)
          </a>
          <Button
            type="button"
            disabled={isPending || !state.canGenerate}
            onClick={handleGenerate}
            variant="secondary"
            size="sm"
          >
            Générer l&apos;Annexe TenderOS
          </Button>
          {generatedDocument ? (
            <GeneratedPdfLink
              document={generatedDocument}
              label="Annexe TenderOS générée — télécharger"
            />
          ) : null}
        </div>
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}

function SubcontractorRow({
  tenderId,
  declaration,
  canEdit,
}: {
  tenderId: string;
  declaration: SubcontractorDeclarationSummary;
  canEdit: boolean;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [generatedDocument, setGeneratedDocument] = useState<
    AdministrativeDocumentSummary | undefined
  >();
  const [showOfficialForm, setShowOfficialForm] = useState(false);

  async function handleGeneratePdf() {
    setIsPending(true);
    setError(undefined);
    const result = await generateSubcontractorDeclarationDocumentAction(tenderId, declaration.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else setGeneratedDocument(result.document);
  }

  return (
    <li className="flex flex-col gap-1 rounded bg-tenderos-light px-2 py-1 text-xs text-tenderos-navy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {declaration.subcontractorName} — {declaration.servicesDescription} —{" "}
          {declaration.amountValue} {declaration.amountCurrency}
          {declaration.percentageOfTotal !== undefined
            ? ` (${declaration.percentageOfTotal}%)`
            : ""}
        </span>
        {canEdit ? (
          <span className="flex items-center gap-2">
            <Button
              type="button"
              disabled={isPending}
              onClick={handleGeneratePdf}
              variant="secondary"
              size="sm"
            >
              Générer le PDF
            </Button>
            {generatedDocument ? <GeneratedPdfLink document={generatedDocument} /> : null}
            <Button
              type="button"
              onClick={() => setShowOfficialForm((prev) => !prev)}
              variant="secondary"
              size="sm"
            >
              {showOfficialForm ? "Masquer le formulaire officiel" : "Formulaire officiel"}
            </Button>
          </span>
        ) : null}
      </div>
      <ErrorText error={error} />
      {showOfficialForm ? (
        <OfficialFormCard
          tenderId={tenderId}
          subcontractorDeclarationId={declaration.id}
          canEdit={canEdit}
        />
      ) : null}
    </li>
  );
}

function SubcontractorsSection({
  tenderId,
  subcontractors,
  canEdit,
  onChanged,
}: {
  tenderId: string;
  subcontractors: SubcontractorDeclarationSummary[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  async function handleCreate() {
    if (!name.trim() || !description.trim() || !amount) return;
    setIsPending(true);
    setError(undefined);
    const result = await createSubcontractorDeclarationAction(tenderId, {
      subcontractorName: name,
      servicesDescription: description,
      amountValue: Number(amount),
      amountCurrency: "EUR",
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setName("");
      setDescription("");
      setAmount("");
      onChanged();
    }
  }

  return (
    <Section title="DC4 — Sous-traitance">
      <ul className="flex flex-col gap-1">
        {subcontractors.map((s) => (
          <SubcontractorRow key={s.id} tenderId={tenderId} declaration={s} canEdit={canEdit} />
        ))}
        {subcontractors.length === 0 ? (
          <p className="text-xs text-tenderos-slate">Aucun sous-traitant déclaré.</p>
        ) : null}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Sous-traitant
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Prestations
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Montant (EUR)
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              min={0}
              className="w-28"
            />
          </label>
          <Button
            type="button"
            disabled={isPending}
            onClick={handleCreate}
            variant="primary"
            size="sm"
          >
            Ajouter
          </Button>
        </div>
      ) : null}
      <ErrorText error={error} />
    </Section>
  );
}

function EngagementActSection({
  tenderId,
  act,
  canEdit,
  onChanged,
}: {
  tenderId: string;
  act: EngagementActSummary | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pricingEstimateId, setPricingEstimateId] = useState("");
  const [pricingVersion, setPricingVersion] = useState("1");
  const [generatedDocument, setGeneratedDocument] = useState<
    AdministrativeDocumentSummary | undefined
  >();

  async function handleEnsure() {
    setIsPending(true);
    setError(undefined);
    const result = await ensureEngagementActAction(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleFreeze() {
    if (!act || !pricingEstimateId.trim()) return;
    setIsPending(true);
    setError(undefined);
    const result = await freezeEngagementActPricingAction(tenderId, act.id, {
      pricingEstimateId,
      pricingEstimateVersionNumber: Number(pricingVersion),
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleUnfreeze() {
    if (!act) return;
    setIsPending(true);
    setError(undefined);
    const result = await unfreezeEngagementActPricingAction(tenderId, act.id);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleGeneratePdf() {
    setIsPending(true);
    setError(undefined);
    const result = await generateEngagementActDocumentAction(tenderId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setGeneratedDocument(result.document);
      onChanged();
    }
  }

  return (
    <Section title="Acte d'engagement">
      {!act ? (
        canEdit ? (
          <Button
            type="button"
            disabled={isPending}
            onClick={handleEnsure}
            className="w-fit"
            variant="primary"
            size="sm"
          >
            Créer l&apos;acte d&apos;engagement
          </Button>
        ) : (
          <p className="text-sm text-tenderos-slate">
            Aucun acte d&apos;engagement pour ce marché.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {act.frozenAmountValue !== undefined ? (
            <p className="text-sm text-tenderos-navy">
              Montant gelé : <span className="font-medium">{act.frozenAmountValue}</span>{" "}
              {act.frozenAmountCurrency}{" "}
              {canEdit ? (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleUnfreeze}
                  className="ml-2"
                  variant="ghost"
                  size="sm"
                >
                  Dégeler
                </Button>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-tenderos-slate">
              Aucun montant gelé — sélectionnez une estimation de pricing existante.
            </p>
          )}
          {canEdit && act.frozenAmountValue === undefined ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Id de l&apos;estimation pricing
                <Input
                  value={pricingEstimateId}
                  onChange={(e) => setPricingEstimateId(e.target.value)}
                  className="w-72"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
                Version
                <Input
                  value={pricingVersion}
                  onChange={(e) => setPricingVersion(e.target.value)}
                  type="number"
                  min={1}
                  className="w-20"
                />
              </label>
              <Button
                type="button"
                disabled={isPending}
                onClick={handleFreeze}
                variant="primary"
                size="sm"
              >
                Geler ce montant
              </Button>
            </div>
          ) : null}
          {canEdit && act.frozenAmountValue !== undefined ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={isPending}
                onClick={handleGeneratePdf}
                variant="secondary"
                size="sm"
              >
                Générer le PDF
              </Button>
              {generatedDocument ? <GeneratedPdfLink document={generatedDocument} /> : null}
            </div>
          ) : null}
        </div>
      )}
      <ErrorText error={error} />
    </Section>
  );
}

function SigningPowersSection({
  tenderId,
  signingPowers,
  administrativeDocuments,
  canEdit,
  canValidate,
  onChanged,
}: {
  tenderId: string;
  signingPowers: SigningPowerSummary[];
  administrativeDocuments: AdministrativeDocumentListItem[];
  canEdit: boolean;
  canValidate: boolean;
  onChanged: () => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [holderName, setHolderName] = useState("");
  const [scope, setScope] = useState("");
  const [proofByPowerId, setProofByPowerId] = useState<Record<string, string>>({});

  async function handleCreate() {
    if (!holderName.trim() || !scope.trim()) return;
    setIsPending(true);
    setError(undefined);
    const result = await createSigningPowerAction(tenderId, {
      holderName,
      representedEntityDescription: holderName,
      scope,
    });
    setIsPending(false);
    if (result.error) setError(result.error);
    else {
      setHolderName("");
      setScope("");
      onChanged();
    }
  }

  async function handleLinkProof(powerId: string) {
    const documentId = proofByPowerId[powerId];
    if (!documentId?.trim()) return;
    setIsPending(true);
    setError(undefined);
    const result = await linkSigningPowerProofAction(tenderId, powerId, documentId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  async function handleVerify(powerId: string) {
    setIsPending(true);
    setError(undefined);
    const result = await verifySigningPowerAction(tenderId, powerId);
    setIsPending(false);
    if (result.error) setError(result.error);
    else onChanged();
  }

  return (
    <Section title="Pouvoirs de signature">
      <ul className="flex flex-col gap-2">
        {signingPowers.map((p) => (
          <li
            key={p.id}
            className="flex flex-col gap-1 rounded bg-tenderos-light px-2 py-1.5 text-xs text-tenderos-navy"
          >
            <div className="flex items-center justify-between gap-2">
              <span>
                {p.holderName} — {p.scope}
              </span>
              <span className="rounded bg-tenderos-light px-2 py-0.5 font-medium">
                {SIGNING_POWER_STATUS_LABELS[p.status] ?? p.status}
              </span>
            </div>
            {canValidate && p.status !== "VALID" ? (
              <div className="flex items-center gap-2">
                {!p.administrativeDocumentId ? (
                  <>
                    <Select
                      aria-label="Document preuve du pouvoir"
                      value={proofByPowerId[p.id] ?? ""}
                      onChange={(e) =>
                        setProofByPowerId((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    >
                      <option value="">
                        {administrativeDocuments.length === 0
                          ? "Aucun document administratif sur ce dossier"
                          : "Choisir le document preuve…"}
                      </option>
                      {administrativeDocuments.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.label}
                          {doc.validatedRevisionId ? " (validé)" : ""}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleLinkProof(p.id)}
                      variant="secondary"
                      size="sm"
                    >
                      Attacher la preuve
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleVerify(p.id)}
                    variant="ghost"
                    size="sm"
                  >
                    Vérifier
                  </Button>
                )}
              </div>
            ) : null}
          </li>
        ))}
        {signingPowers.length === 0 ? (
          <p className="text-xs text-tenderos-slate">Aucun pouvoir déclaré.</p>
        ) : null}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Titulaire
            <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tenderos-slate">
            Portée
            <Input value={scope} onChange={(e) => setScope(e.target.value)} />
          </label>
          <Button
            type="button"
            disabled={isPending}
            onClick={handleCreate}
            variant="primary"
            size="sm"
          >
            Ajouter
          </Button>
        </div>
      ) : null}
      <ErrorText error={error} />
    </Section>
  );
}

export function AdministrativeStructuredSection({
  tenderId,
  capabilities,
  consortium,
  dc1,
  dc2,
  dume,
  subcontractors,
  engagementAct,
  signingPowers,
  administrativeDocuments,
}: {
  tenderId: string;
  capabilities: AdministrativeDossierCapabilities;
  consortium: ConsortiumSummary | null;
  dc1: Dc1DeclarationSummary | null;
  dc2: Dc2DeclarationWithVersions | null;
  dume: DumeDeclarationWithVersions | null;
  subcontractors: SubcontractorDeclarationSummary[];
  engagementAct: EngagementActSummary | null;
  signingPowers: SigningPowerSummary[];
  administrativeDocuments: AdministrativeDocumentListItem[];
}) {
  const router = useRouter();
  function onChanged() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {capabilities.signatureSummary.required > 0 ? (
        <p className="text-sm text-tenderos-slate">
          Signatures : {capabilities.signatureSummary.signed}/
          {capabilities.signatureSummary.required} signées, {capabilities.signatureSummary.pending}{" "}
          en attente.
        </p>
      ) : null}
      <ConsortiumSection
        tenderId={tenderId}
        consortium={consortium}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
      />
      <Dc1Section
        tenderId={tenderId}
        dc1={dc1}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
      />
      <StructuredDeclarationSection
        title="DC2 — Déclaration du candidat"
        tenderId={tenderId}
        declaration={dc2}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
        onEnsure={ensureDc2DeclarationAction}
        onCreateVersion={(t, id, legalIdentity) =>
          createDc2DeclarationVersionAction(t, id, { legalIdentity })
        }
        onGeneratePdf={generateDc2DocumentAction}
      />
      <StructuredDeclarationSection
        title="DUME"
        tenderId={tenderId}
        declaration={dume}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
        onEnsure={ensureDumeDeclarationAction}
        onCreateVersion={(t, id, legalIdentity) =>
          createDumeDeclarationVersionAction(t, id, { legalIdentity })
        }
        onGeneratePdf={generateDumeDocumentAction}
        xmlDraftHref={`/app/tenders/${tenderId}/administrative-dossier/dume-xml-draft`}
      />
      <SubcontractorsSection
        tenderId={tenderId}
        subcontractors={subcontractors}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
      />
      <EngagementActSection
        tenderId={tenderId}
        act={engagementAct}
        canEdit={capabilities.canEdit}
        onChanged={onChanged}
      />
      <SigningPowersSection
        tenderId={tenderId}
        signingPowers={signingPowers}
        administrativeDocuments={administrativeDocuments}
        canEdit={capabilities.canEdit}
        canValidate={capabilities.canValidate}
        onChanged={onChanged}
      />
    </div>
  );
}
