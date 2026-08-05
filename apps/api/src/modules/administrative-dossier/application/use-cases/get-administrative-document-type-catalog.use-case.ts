import { Injectable } from "@nestjs/common";
import { ADMINISTRATIVE_DOCUMENT_TYPE_METADATA, type AdministrativeDocumentTypeMetadata } from "../../domain/administrative-document-type";

/**
 * Correctif audit Codex — mission §7 "le frontend ne doit pas maintenir une liste divergente codée
 * en dur" : catalogue canonique exposé ici, jamais recopié côté client. Données statiques de
 * référence (pas de scoping tenant/Tender) — l'authentification/appartenance organisation reste
 * exigée par les guards du contrôleur, mais aucune vérification `ClientPermission` n'est nécessaire
 * pour de la simple donnée de catalogue.
 */
@Injectable()
export class GetAdministrativeDocumentTypeCatalogUseCase {
  execute(): readonly AdministrativeDocumentTypeMetadata[] {
    return Object.values(ADMINISTRATIVE_DOCUMENT_TYPE_METADATA);
  }
}
