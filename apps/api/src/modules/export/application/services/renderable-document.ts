/**
 * Représentation intermédiaire (IR), indépendante du format de sortie — mission Sprint 8A §13
 * "le domaine/l'application ne doit dépendre d'aucune bibliothèque DOCX ou PDF concrète". Les
 * renderers DOCX/PDF (infrastructure) transforment CETTE structure en octets, jamais l'inverse.
 * Utiliser des blocs structurés plutôt qu'une chaîne XML/HTML gabarisée élimine par construction
 * tout risque d'injection XML/HTML (mission §20/§71) : chaque renderer passe ces chaînes à une
 * bibliothèque de construction de document (jamais un template-string assemblé à la main).
 */
/**
 * Mission Sprint 8A.1 §9 — formatage en ligne contrôlé (gras, italique, lien) pour l'éditeur du
 * Mémoire technique : extension ADDITIVE de l'IR existante (jamais une réécriture du moteur DOCX/
 * PDF du Sprint 8A — chaque renderer gagne une branche supplémentaire, l'ancien comportement
 * `text` seul reste inchangé et testé). `href` est validé en amont par le domaine Deliverables
 * (`http(s)://` uniquement, mission "liens contrôlés") — jamais par le renderer lui-même.
 */
export type RichTextRun = Readonly<{ text: string; bold?: boolean | undefined; italic?: boolean | undefined; href?: string | undefined }>;

export type RenderableBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  /** `runs`, si présent, prévaut sur `text` au rendu — `text` reste toujours l'équivalent texte
   *  brut (recherche, comptage de caractères, aperçu sans mise en forme). */
  | { kind: "paragraph"; text: string; runs?: readonly RichTextRun[] | undefined }
  | { kind: "list"; items: readonly string[]; ordered: boolean; itemRuns?: readonly (readonly RichTextRun[])[] | undefined }
  | { kind: "table"; headerRow?: readonly string[] | undefined; rows: readonly (readonly string[])[] }
  | { kind: "pageBreak" }
  /** Bloc visuellement distinct — disclaimer financier, avertissement, mention "coût non
   *  disponible" (mission §17 "jamais afficher 0 € pour un coût inconnu"). */
  | { kind: "notice"; text: string };

export type RenderableSection = Readonly<{
  id: string;
  label: string;
  blocks: readonly RenderableBlock[];
}>;

export type RenderableCoverPage = Readonly<{
  showBuyerName: boolean;
  showClientName: boolean;
  showReference: boolean;
  showTitle: boolean;
  showDate: boolean;
  showVersion: boolean;
  buyerName?: string | undefined;
  clientName?: string | undefined;
  reference?: string | undefined;
  tenderTitle?: string | undefined;
  date: string;
  version: number;
}>;

/**
 * Mission Sprint 8A.2 (correction bugs #7/#8 "thème document pas toujours appliqué") — thème
 * RÉELLEMENT résolu (voir ThemeResolver, TENDER > CLIENT > ORGANIZATION > TENDEROS) au format déjà
 * prêt pour un renderer : `logo` porte les octets déjà chargés depuis le stockage, jamais une
 * clé/URL que le renderer irait résoudre lui-même (même discipline "aucune E/S dans le renderer"
 * que le reste de cette IR).
 */
export type RenderableTheme = Readonly<{
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  logo?: Readonly<{ buffer: Buffer; mimeType: string }> | undefined;
}>;

export type RenderableDocument = Readonly<{
  documentTitle: string;
  coverPage?: RenderableCoverPage | undefined;
  headerText?: string | undefined;
  footerText?: string | undefined;
  showPageNumbers: boolean;
  showTableOfContents: boolean;
  /** "APERÇU" sur un aperçu, absent sur un export final (mission §18/§21). */
  watermarkText?: string | undefined;
  theme?: RenderableTheme | undefined;
  sections: readonly RenderableSection[];
}>;
