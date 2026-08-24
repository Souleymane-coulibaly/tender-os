import { Controller, Get, Query, UseFilters, UseGuards } from "@nestjs/common";
import {
  BillingErrorFilter,
  GetAoCreditBalanceUseCase,
  GetOrganizationEntitlementsUseCase,
  GetOrganizationSubscriptionUseCase,
  ListOrganizationAoCreditLedgerUseCase,
  ListPassPurchasesUseCase,
} from "../../../billing";
import { AuthenticatedGuard } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GetOrganizationUsageUseCase } from "../../application/use-cases/get-organization-usage.use-case";
import { presentPassPurchase, presentSubscription } from "./presenters";
import { ListAoCreditLedgerQuerySchema, ListPassPurchasesQuerySchema, type ListAoCreditLedgerQuery, type ListPassPurchasesQuery } from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * V2 Sprint 22 (billing, étape 22D) — écran "Abonnement & utilisation" (mission §50/§51), organisation
 * courante uniquement (`membership.organizationId`, jamais un `organizationId` de route — aucune
 * organisation ne peut lire l'abonnement/l'usage d'une autre, même motif que `CheckoutController`).
 * L'assignation MANUAL/GRANTED reste Platform Admin only (voir `AdminOrganizationBillingController`).
 *
 * Correctif audit Codex 22E (P1-02, round 3, décision utilisateur "GET /billing/usage -> lecture
 * pure uniquement") — ce contrôleur ne déclenche PLUS `CheckQuotaThresholdUseCase` : la vérification
 * de seuil vit désormais dans `billing`, appelée depuis le point d'écriture réel de chaque dimension
 * (`CreateMembershipUseCase`/`SendMessageUseCase`/`AddDocumentVersionUseCase`), jamais depuis une
 * lecture.
 */
@Controller("billing")
@UseFilters(BillingErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SubscriptionUsageController {
  constructor(
    private readonly getOrganizationSubscriptionUseCase: GetOrganizationSubscriptionUseCase,
    private readonly getOrganizationEntitlementsUseCase: GetOrganizationEntitlementsUseCase,
    private readonly listPassPurchasesUseCase: ListPassPurchasesUseCase,
    private readonly getAoCreditBalanceUseCase: GetAoCreditBalanceUseCase,
    private readonly listOrganizationAoCreditLedgerUseCase: ListOrganizationAoCreditLedgerUseCase,
    private readonly getOrganizationUsageUseCase: GetOrganizationUsageUseCase,
  ) {}

  @Get("subscription")
  async getSubscription(@CurrentMembershipContext() membership: MembershipContext) {
    // Correctif (régression réelle trouvée en HTTP réel) — NestJS renvoie un corps VIDE (jamais le
    // JSON littéral `null`) quand un handler retourne `null`/`undefined`, ce qui casse
    // `appApiFetch`/`platformApiFetch` (`response.json()` échoue sur un corps vide). Toujours une
    // enveloppe `{ subscription: ... | null }`, jamais une valeur nue potentiellement `null` au
    // premier niveau de la réponse.
    const subscription = await this.getOrganizationSubscriptionUseCase.execute(membership.organizationId);
    return { subscription: subscription ? presentSubscription(subscription) : null };
  }

  @Get("entitlements")
  async getEntitlements(@CurrentMembershipContext() membership: MembershipContext) {
    return this.getOrganizationEntitlementsUseCase.execute(membership.organizationId);
  }

  @Get("pass-purchases")
  async listPassPurchases(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListPassPurchasesQuerySchema)) query: ListPassPurchasesQuery,
  ) {
    const page = await this.listPassPurchasesUseCase.execute({ organizationId: membership.organizationId, cursor: query.cursor, limit: query.limit });
    return { items: page.items.map(presentPassPurchase), nextCursor: page.nextCursor };
  }

  @Get("ao-credits")
  async getAoCreditBalance(@CurrentMembershipContext() membership: MembershipContext) {
    const balance = await this.getAoCreditBalanceUseCase.execute(membership.organizationId);
    return { balance };
  }

  // Checkpoint TENDEROS-2.1-P2.3-E9 (mission §56) — historique des crédits AO self-service, borné à
  // l'organisation courante (`membership.organizationId`, jamais un `organizationId` de route), même
  // motif que `listPassPurchases` ci-dessous. Distinct de `AoCreditLedgerController` (Platform Admin,
  // toute organisation) : jamais le même contrôleur, jamais la même autorisation.
  @Get("ao-credits/ledger")
  async listAoCreditLedger(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListAoCreditLedgerQuerySchema)) query: ListAoCreditLedgerQuery,
  ) {
    const page = await this.listOrganizationAoCreditLedgerUseCase.execute({ organizationId: membership.organizationId, cursor: query.cursor, limit: query.limit });
    return { items: page.items, nextCursor: page.nextCursor };
  }

  @Get("usage")
  async getUsage(@CurrentMembershipContext() membership: MembershipContext) {
    return this.getOrganizationUsageUseCase.execute({ organizationId: membership.organizationId, now: new Date() });
  }
}
