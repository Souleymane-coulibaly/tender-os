import { Inject, Injectable } from "@nestjs/common";
import { ENTITLEMENT_SERVICE, QuotaType, UNLIMITED, type EntitlementService } from "../billing";
import type { SeatLimitProvider } from "../memberships/application/ports/seat-limit-provider";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1 — implémentation réelle du port `SeatLimitProvider` (possédé par
 * `memberships`), adossée SANS second calcul à `EntitlementService.getEffectiveLimit` (billing, seule
 * autorité de la limite `USERS_MAX`). Vit dans ce module-pont, jamais dans `memberships` lui-même
 * (qui ne doit jamais importer `billing`, voir `membership-seat-limit-bridge.module.ts`).
 */
@Injectable()
export class BillingSeatLimitProvider implements SeatLimitProvider {
  constructor(@Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService) {}

  async getSeatLimit(organizationId: string): Promise<number | "UNLIMITED"> {
    const limit = await this.entitlementService.getEffectiveLimit(organizationId, QuotaType.UsersMax);
    return limit === UNLIMITED ? "UNLIMITED" : limit;
  }
}
