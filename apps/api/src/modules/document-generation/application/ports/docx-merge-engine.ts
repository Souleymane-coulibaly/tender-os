import type { DiscoveredPlaceholder } from "../../domain/document-template-version.entity";

/** Port du moteur de fusion DOCX — le domaine/l'application ne dépendent que de cette interface,
 *  jamais de `docxtemplater` concrète (implémentée en infrastructure), même motif que
 *  `DocumentRendererPort` (module Export). Encapsule docxtemplater pour qu'elle reste remplaçable
 *  (mission décision validée : "le domaine ne doit pas dépendre directement de cette bibliothèque"). */
export interface DocxMergeEngine {
  /** Détecte tous les placeholders réellement présents dans le document (fusion des runs Word déjà
   *  gérée par le parseur OOXML sous-jacent — jamais un remplacement de chaîne naïf). Lève
   *  `InvalidTemplateFileError`-compatible si le fichier n'est pas un .docx structurellement valide. */
  scanPlaceholders(templateBuffer: Buffer): readonly DiscoveredPlaceholder[];

  /** Remplit le template avec les valeurs déjà transformées (voir `formatFieldValue`) et retourne
   *  les octets du document généré. Ne modifie jamais `templateBuffer` (mission "copy-then-generate"
   *  — le buffer source reste intact, un nouveau buffer est produit). Un champ absent de `data` est
   *  rendu comme une chaîne vide, jamais une exception (le blocage sur champ requis manquant est
   *  une décision du domaine, prise AVANT l'appel à cette méthode). */
  render(input: { templateBuffer: Buffer; data: Readonly<Record<string, unknown>> }): Buffer;
}

export const DOCX_MERGE_ENGINE = Symbol("DOCX_MERGE_ENGINE");
