import type { ApiKeyScope } from "../../domain/enums";
import { ApiKeyScopeMissingError } from "../../domain/errors";
import type { ApiKeyPrincipal } from "../use-cases/authenticate-api-key.use-case";

/** Mission §14/§15/§99 — un scope manquant refuse l'appel MÊME si le client cible est autorisé
 *  (vérifié séparément, voir `assertApiKeyClientAllowed`). */
export function assertApiKeyScope(principal: ApiKeyPrincipal, scope: ApiKeyScope): void {
  if (!principal.scopes.includes(scope)) {
    throw new ApiKeyScopeMissingError(scope);
  }
}

/** Mission §17/§18/§100 — narrowing strict : liste vide = pas de restriction, sinon appartenance
 *  stricte. Le `resourceNotFoundError` factory permet un anti-énumération 404 cohérent avec le
 *  reste de l'API plutôt qu'un 403 qui confirmerait l'existence de la ressource étrangère. */
export function assertApiKeyClientAllowed(principal: ApiKeyPrincipal, clientAccountId: string, resourceNotFoundError: () => Error): void {
  if (principal.allowedClientAccountIds.length === 0) return;
  if (!principal.allowedClientAccountIds.includes(clientAccountId)) {
    throw resourceNotFoundError();
  }
}
