import { Global, Module } from "@nestjs/common";
import { BillingModule } from "../billing";
import { MembershipsModule } from "../memberships";
import { SEAT_LIMIT_PROVIDER } from "../memberships/application/ports/seat-limit-provider";
import { BillingSeatLimitProvider } from "./billing-seat-limit.provider";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1, mission §15 — pont `@Global()` entre `memberships` (possède le
 * port `SeatLimitProvider`, ne connaît jamais `billing`) et `billing` (autorité réelle de la limite
 * `USERS_MAX`), même motif que `AiSuggestionBridgeModule`/`RoutingPolicyBridgeModule` déjà en place
 * dans ce dépôt : relie deux modules sans jamais faire dépendre l'un de l'autre directement.
 * `billing.module.ts` importe déjà `MembershipsModule` — l'inverse (`memberships` importe `billing`)
 * créerait un cycle direct à 2 nœuds, d'où ce pont tiers plutôt qu'un import croisé.
 *
 * Si ce module n'est pas importé par `AppModule`, `CreateMembershipUseCase` retombe sur son
 * `@Optional()` (aucun contrôle de siège) — aucune régression par omission, mais ce pont DOIT être
 * importé en production (même obligation déjà en vigueur pour les ponts existants).
 */
@Global()
@Module({
  imports: [BillingModule, MembershipsModule],
  providers: [{ provide: SEAT_LIMIT_PROVIDER, useClass: BillingSeatLimitProvider }],
  exports: [SEAT_LIMIT_PROVIDER],
})
export class MembershipSeatLimitBridgeModule {}
