import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { DocumentTemplateScope } from "../../domain/document-template-scope";

export const IdParamSchema = z.string().uuid();

export const CreateDocumentTemplateBodySchema = z.object({
  scope: z.nativeEnum(DocumentTemplateScope),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});
export type CreateDocumentTemplateBody = z.infer<typeof CreateDocumentTemplateBodySchema>;

/**
 * `multipart/form-data` ne transporte que des champs texte hors fichier — `fieldMappings` arrive
 * comme une chaîne JSON, `allowPartialGeneration` comme "true"/"false" littéral, jamais un objet
 * natif. Validée ici uniquement au niveau TRANSPORT (chaînes) ; la forme métier de chaque mapping
 * (`fieldKey`/`fieldType`/...) est validée séparément par `validateFieldMapping` (domaine) — jamais
 * dupliquée dans ce schéma HTTP.
 */
export const CreateDocumentTemplateVersionBodySchema = z.object({
  fieldMappings: z.string(),
  allowPartialGeneration: z.string().optional(),
});
export type CreateDocumentTemplateVersionBody = z.infer<typeof CreateDocumentTemplateVersionBodySchema>;

export function parseFieldMappingsField(raw: string): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException({ error: { code: "VALIDATION_FAILED", message: "fieldMappings must be a JSON-encoded array." } });
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestException({ error: { code: "VALIDATION_FAILED", message: "fieldMappings must be a JSON-encoded array." } });
  }
  return parsed;
}

/**
 * Correctif audit Codex P1-01 — `provenanceOverrides` (sourceEntityType/sourceEntityId/
 * sourceEntityVersion/valuePath) N'EST JAMAIS accepté depuis l'API publique : un client HTTP
 * pourrait sinon fabriquer une provenance mensongère (ex. prétendre qu'un champ vient d'une
 * source qu'il ne pilote pas), ce qui casserait la garantie de traçabilité que ce mécanisme est
 * censé fournir (groundwork Sprint 11). `z.object` sans `.passthrough()` REJETTE ce champ par
 * construction — même s'il est présent dans le corps de la requête, il n'atteint jamais
 * `GenerateDocumentBody`/`RegenerateDocumentBody`, donc jamais la commande, donc jamais la
 * provenance persistée. Le paramètre `provenanceOverrides` reste disponible au niveau APPLICATION
 * (`DocumentGenerationExecutionService`/commandes des use cases) pour un futur appelant INTERNE
 * contrôlé (ex. un use case Sprint 11 qui résout une provenance réelle côté serveur avant
 * d'appeler `GenerateDocumentUseCase.execute` directement, jamais via HTTP) — jamais pour ce
 * contrôleur.
 */
export const GenerateDocumentBodySchema = z.object({
  documentTemplateId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  data: z.record(z.unknown()),
});
export type GenerateDocumentBody = z.infer<typeof GenerateDocumentBodySchema>;

export const RegenerateDocumentBodySchema = z.object({
  data: z.record(z.unknown()),
});
export type RegenerateDocumentBody = z.infer<typeof RegenerateDocumentBodySchema>;
