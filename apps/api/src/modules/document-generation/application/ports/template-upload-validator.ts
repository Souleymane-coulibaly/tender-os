/**
 * Port de validation de sécurité d'un fichier .docx uploadé comme source de template — mission
 * §"sécurité upload de template" : extension/MIME/structure ZIP/taille, défenses zip-bomb/
 * path-traversal/XXE, rejet des macros (.docm). Exécutée AVANT tout stockage (mission "jamais un
 * fichier dangereux même transitoirement persisté") et avant tout appel au moteur de fusion.
 * Ne renvoie rien en cas de succès ; lève une erreur de domaine (`InvalidTemplateFileError`,
 * construite par l'implémentation) en cas d'échec — jamais un booléen silencieux.
 */
export interface TemplateUploadValidator {
  validate(input: { buffer: Buffer; originalFilename: string; mimeType: string }): Promise<void>;
}

export const TEMPLATE_UPLOAD_VALIDATOR = Symbol("TEMPLATE_UPLOAD_VALIDATOR");
