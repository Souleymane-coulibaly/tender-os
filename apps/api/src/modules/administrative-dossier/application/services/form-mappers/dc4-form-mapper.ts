import type { RenderableDocument } from "../../../../export";
import type { FormFieldIssue } from "../../../domain/form-field-issue";
import { FormFieldSource } from "../../../domain/form-field-source";
import type { SubcontractorDeclaration } from "../../../domain/subcontractor-declaration.aggregate";
import { fieldParagraph, formatMoney, heading, notice } from "../renderable-document-builders/shared";

/** Sprint 8C.1 — clés stables des champs DC4 exposés au brouillon éditable (`AdministrativeFormDraft.data`)
 *  et au frontend — jamais recalculées ailleurs (mission "provenance backend uniquement"). */
export const DC4_FORM_FIELD_KEYS = [
  "subcontractorName",
  "subcontractorLegalIdentifier",
  "servicesDescription",
  "amountValue",
  "amountCurrency",
  "percentageOfTotal",
  "paymentTerms",
  "directPaymentApplicable",
] as const;

export type Dc4FormFieldKey = (typeof DC4_FORM_FIELD_KEYS)[number];

export type AdministrativeFormMapperResult = Readonly<{
  renderable: RenderableDocument;
  values: Record<string, string>;
  fieldSources: Record<string, FormFieldSource>;
  missingFields: readonly FormFieldIssue[];
  warnings: readonly FormFieldIssue[];
}>;

function directPaymentLabel(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value ? "Oui" : "Non";
}

/**
 * Sprint 8C.1 — DC4, une déclaration de sous-traitance -> une "Annexe TenderOS" distincte du
 * formulaire officiel intact (mission "document officiel intact + annexe listée"). Fonction PURE :
 * aucune E/S, aucune valeur financière/juridique inventée — un champ absent de la source ET du
 * brouillon devient `(non renseigné)` à l'affichage et un `warnings`/`missingFields`, jamais une
 * valeur par défaut fabriquée (mission §12/§19).
 */
export function mapDc4Form(input: {
  declaration: SubcontractorDeclaration;
  tenderTitle: string;
  overrides?: Readonly<Record<string, string | undefined>> | undefined;
}): AdministrativeFormMapperResult {
  const { declaration, tenderTitle, overrides } = input;

  const sourceValues: Record<Dc4FormFieldKey, string | undefined> = {
    subcontractorName: declaration.subcontractorName,
    subcontractorLegalIdentifier: declaration.subcontractorLegalIdentifier,
    servicesDescription: declaration.servicesDescription,
    amountValue: formatMoney(declaration.amountValue, declaration.amountCurrency),
    amountCurrency: declaration.amountCurrency,
    percentageOfTotal: declaration.percentageOfTotal !== undefined ? `${declaration.percentageOfTotal}%` : undefined,
    paymentTerms: declaration.paymentTerms,
    directPaymentApplicable: directPaymentLabel(declaration.directPaymentApplicable),
  };

  const values: Record<string, string> = {};
  const fieldSources: Record<string, FormFieldSource> = {};
  for (const key of DC4_FORM_FIELD_KEYS) {
    const overrideValue = overrides?.[key];
    if (overrideValue !== undefined && overrideValue !== "") {
      values[key] = overrideValue;
      fieldSources[key] = FormFieldSource.UserInput;
    } else if (sourceValues[key] !== undefined) {
      values[key] = sourceValues[key] as string;
      fieldSources[key] = FormFieldSource.Subcontractor;
    }
  }

  const missingFields: FormFieldIssue[] = [];
  const warnings: FormFieldIssue[] = [];
  const recommendedButAbsent: readonly { key: Dc4FormFieldKey; label: string }[] = [
    { key: "subcontractorLegalIdentifier", label: "Identifiant légal du sous-traitant" },
    { key: "percentageOfTotal", label: "Pourcentage du marché sous-traité" },
    { key: "paymentTerms", label: "Modalités de paiement" },
    { key: "directPaymentApplicable", label: "Paiement direct applicable" },
  ];
  for (const field of recommendedButAbsent) {
    if (values[field.key] === undefined) {
      warnings.push({
        fieldPath: field.key,
        code: "DC4_FIELD_RECOMMENDED_MISSING",
        message: `${field.label} non renseigné — recommandé pour compléter le DC4 officiel.`,
        severity: "WARNING",
        blocking: false,
      });
    }
  }

  const renderable: RenderableDocument = {
    documentTitle: "Annexe TenderOS — DC4 (Déclaration de sous-traitance)",
    showPageNumbers: true,
    showTableOfContents: false,
    sections: [
      {
        id: "annexe-dc4",
        label: "Annexe TenderOS",
        blocks: [
          heading(1, "Annexe TenderOS — DC4"),
          notice("Informations à reporter dans le formulaire officiel DC4 ci-joint. Ce document ne remplace pas le formulaire officiel et ne doit jamais lui être substitué."),
          fieldParagraph("Marché", tenderTitle),
          fieldParagraph("Sous-traitant", values.subcontractorName),
          fieldParagraph("Identifiant légal", values.subcontractorLegalIdentifier),
          fieldParagraph("Prestations sous-traitées", values.servicesDescription),
          fieldParagraph("Montant", values.amountValue),
          fieldParagraph("Pourcentage du marché", values.percentageOfTotal),
          fieldParagraph("Modalités de paiement", values.paymentTerms),
          fieldParagraph("Paiement direct applicable", values.directPaymentApplicable),
        ],
      },
    ],
  };

  return { renderable, values, fieldSources, missingFields, warnings };
}
