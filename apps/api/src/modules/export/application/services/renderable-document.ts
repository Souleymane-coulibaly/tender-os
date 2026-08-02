/**
 * Représentation intermédiaire (IR), indépendante du format de sortie — mission Sprint 8A §13
 * "le domaine/l'application ne doit dépendre d'aucune bibliothèque DOCX ou PDF concrète". Les
 * renderers DOCX/PDF (infrastructure) transforment CETTE structure en octets, jamais l'inverse.
 * Utiliser des blocs structurés plutôt qu'une chaîne XML/HTML gabarisée élimine par construction
 * tout risque d'injection XML/HTML (mission §20/§71) : chaque renderer passe ces chaînes à une
 * bibliothèque de construction de document (jamais un template-string assemblé à la main).
 */
export type RenderableBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: readonly string[]; ordered: boolean }
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

export type RenderableDocument = Readonly<{
  documentTitle: string;
  coverPage?: RenderableCoverPage | undefined;
  headerText?: string | undefined;
  footerText?: string | undefined;
  showPageNumbers: boolean;
  showTableOfContents: boolean;
  /** "APERÇU" sur un aperçu, absent sur un export final (mission §18/§21). */
  watermarkText?: string | undefined;
  sections: readonly RenderableSection[];
}>;
