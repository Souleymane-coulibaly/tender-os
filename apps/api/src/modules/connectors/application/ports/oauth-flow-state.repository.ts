import type { OAuthFlowState } from "../../domain/oauth-flow-state.entity";

export interface OAuthFlowStateRepository {
  save(state: OAuthFlowState): Promise<void>;
  findByState(state: string): Promise<OAuthFlowState | null>;
  /** Mission §55/§102 — consommation ATOMIQUE (UPDATE ... WHERE consumed_at IS NULL AND
   *  expires_at > now, jamais un find-then-save avec une fenêtre de race) : deux requêtes
   *  concurrentes portant le même `state` ne peuvent JAMAIS toutes les deux réussir. `null` = state
   *  inconnu, déjà consommé, ou expiré — jamais distingué côté appelant (anti-énumération). */
  consumeIfValid(state: string, now: Date): Promise<OAuthFlowState | null>;
}

export const OAUTH_FLOW_STATE_REPOSITORY = Symbol("OAUTH_FLOW_STATE_REPOSITORY");
