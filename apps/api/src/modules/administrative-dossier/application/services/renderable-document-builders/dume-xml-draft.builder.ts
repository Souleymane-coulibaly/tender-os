import type { StructuredCapacityStatement } from "../../../domain/structured-capacity-statement";

/**
 * Sprint 8C Phase 3 — mission : le DUME européen a un format d'échange officiel (ESPD) normalisé
 * par un schéma XML de la Commission européenne. CE FICHIER NE L'IMPLÉMENTE PAS — décision
 * explicite de l'utilisateur (voir plan Phase 3) : produire un XML "brouillon" de la structure
 * interne, CLAIREMENT étiqueté comme non officiel, jamais à déposer tel quel sur une plateforme de
 * dématérialisation. Racine `<DumeBrouillonNonOfficiel>` (jamais un nom qui suggérerait une
 * conformité ESPD), avertissement répété en tête du document. Sérialisation manuelle (structure
 * trop simple pour justifier une nouvelle dépendance npm) — tout texte est échappé via `escapeXml`.
 */
function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function textElement(tag: string, value: string | number | undefined): string {
  if (value === undefined || value === "") return `  <${tag}/>`;
  return `  <${tag}>${escapeXml(String(value))}</${tag}>`;
}

export function buildDumeXmlDraft(input: { data: StructuredCapacityStatement; version: number; tenderId: string; tenderTitle: string; generatedAt: Date }): string {
  const { data, version, tenderId, tenderTitle, generatedAt } = input;

  const revenueLines =
    data.revenueByYear && data.revenueByYear.length > 0
      ? data.revenueByYear
          .map(
            (r) =>
              `    <Exercice annee="${r.year}">\n      <Montant devise="${escapeXml(r.amountCurrency)}">${r.amountValue}</Montant>\n    </Exercice>`,
          )
          .join("\n")
      : "    <!-- Aucune donnée de chiffre d'affaires renseignée -->";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!--",
    "  AVERTISSEMENT : ce document est un BROUILLON NON OFFICIEL généré par TenderOS.",
    "  Il ne respecte PAS le schéma XML officiel ESPD (Espace économique européen, DUME).",
    "  Il ne doit JAMAIS être déposé tel quel sur une plateforme de dématérialisation.",
    "  Il sert uniquement de relecture/export interne des données structurées déjà saisies.",
    "-->",
    "<DumeBrouillonNonOfficiel>",
    "  <AvertissementNonOfficiel>Brouillon non officiel — ne respecte pas le schéma ESPD — ne pas déposer tel quel.</AvertissementNonOfficiel>",
    textElement("MarcheId", tenderId),
    textElement("MarcheIntitule", tenderTitle),
    `  <Version>${version}</Version>`,
    `  <GenereLe>${generatedAt.toISOString()}</GenereLe>`,
    "  <IdentiteLegale>",
    textElement("IdentiteLegale", data.legalIdentity),
    "  </IdentiteLegale>",
    "  <ChiffreAffaires>",
    revenueLines,
    "  </ChiffreAffaires>",
    "  <Capacites>",
    textElement("CapaciteFinanciere", data.financialCapacity),
    textElement("CapaciteTechnique", data.technicalCapacity),
    textElement("MoyensHumains", data.humanResources),
    textElement("MoyensTechniques", data.technicalResources),
    textElement("Assurances", data.insurances),
    textElement("Certifications", data.certifications),
    "  </Capacites>",
    textElement("InformationsComplementaires", data.additionalInfo),
    "</DumeBrouillonNonOfficiel>",
    "",
  ].join("\n");
}
