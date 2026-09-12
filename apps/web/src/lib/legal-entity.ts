/**
 * Identité juridique de l'éditeur — SOURCE UNIQUE pour les pages légales et les mentions de
 * copyright. TenderOS est le produit (service SaaS) ; Digiura.ai est la société qui l'édite et
 * l'exploite.
 *
 * Toute information non fournie par l'éditeur reste `LEGAL_TO_CONFIRM`, jamais une valeur plausible
 * inventée : RCS / ville d'immatriculation, email juridique, contact RGPD / DPO, hébergeurs.
 */
export const LEGAL_TO_CONFIRM = "[À CONFIRMER]";

export const LEGAL_ENTITY = {
  name: "Digiura.ai",
  product: "TenderOS",
  legalForm: "Société par actions simplifiée (SAS)",
  shareCapital: "1 000 euros",
  siren: "103 774 246",
  siretHeadOffice: "103 774 246 00013",
  vatNumber: "FR86103774246",
  nafCode: "5829C — Édition de logiciels applicatifs",
  creationDate: "16 avril 2026",
  headOffice: { street: "200 rue de la Croix Nivert", postalCode: "75015", city: "Paris", country: "France" },
  director: "Souleymane COULIBALY",
  publicationDirector: "Souleymane COULIBALY",
  // Non fournis : à vérifier avant publication, jamais devinés.
  rcs: LEGAL_TO_CONFIRM,
  legalEmail: LEGAL_TO_CONFIRM,
  privacyContact: LEGAL_TO_CONFIRM,
  host: LEGAL_TO_CONFIRM,
} as const;

const { street, postalCode, city, country } = LEGAL_ENTITY.headOffice;

export const HEAD_OFFICE_ADDRESS = `${street}, ${postalCode} ${city}, ${country}`;

/** Présentation de référence de l'éditeur (CGU, mentions légales). */
export const PUBLISHER_STATEMENT = `Le service ${LEGAL_ENTITY.product} est édité et exploité par ${LEGAL_ENTITY.name}, Société par actions simplifiée au capital de ${LEGAL_ENTITY.shareCapital}, dont le siège social est situé ${street}, ${postalCode} ${city}, ${country}, immatriculée sous le numéro SIREN ${LEGAL_ENTITY.siren}.`;
