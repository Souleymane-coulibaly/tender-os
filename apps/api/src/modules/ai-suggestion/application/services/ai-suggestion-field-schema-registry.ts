import { Injectable } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Correctif audit Codex P1-003 — registre CENTRAL de validation par couple
 * (entityType, fieldName), remplaçant le schéma fourni ad hoc par chaque appelant
 * (`CreateAiSuggestionUseCase` acceptait auparavant un `valueSchema` en paramètre direct :
 * deux producteurs auraient alors pu valider différemment le même champ). Un futur module
 * producteur (Sprint 4, 6, 11, 12, 13...) enregistre son schéma UNE SEULE FOIS, typiquement dans
 * son propre `onModuleInit`, en injectant ce registre exporté par `AiSuggestionModule` — jamais en
 * modifiant ce module générique.
 */
@Injectable()
export class AiSuggestionFieldSchemaRegistry {
  private readonly schemasByKey = new Map<string, ZodType>();

  register(entityType: string, fieldName: string, schema: ZodType): void {
    const key = this.keyOf(entityType, fieldName);
    if (this.schemasByKey.has(key)) {
      throw new Error(`A validation schema is already registered for ${entityType}.${fieldName}.`);
    }
    this.schemasByKey.set(key, schema);
  }

  resolve(entityType: string, fieldName: string): ZodType | undefined {
    return this.schemasByKey.get(this.keyOf(entityType, fieldName));
  }

  private keyOf(entityType: string, fieldName: string): string {
    return `${entityType}::${fieldName}`;
  }
}
