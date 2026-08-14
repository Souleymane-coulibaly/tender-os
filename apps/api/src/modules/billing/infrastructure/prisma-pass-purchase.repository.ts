import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { OrganizationPassPurchase as PrismaPassPurchase } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PassPurchase } from "../domain/pass-purchase.aggregate";
import { parsePassPurchaseStatus } from "../domain/pass-purchase-status";
import type { PassPurchasePage, PassPurchaseRepository } from "../application/ports/pass-purchase.repository";
import { PassPurchaseExternalReferenceConflictError } from "../application/ports/pass-purchase.repository";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toDomain(row: PrismaPassPurchase): PassPurchase {
  return PassPurchase.reconstitute({
    id: row.id,
    organizationId: row.organizationId,
    status: parsePassPurchaseStatus(row.status),
    externalReference: row.externalReference,
    priceCents: row.priceCents,
    currency: row.currency,
    purchasedAt: row.purchasedAt,
    expiresAt: row.expiresAt ?? undefined,
    consumedTenderId: row.consumedTenderId ?? undefined,
    consumedAt: row.consumedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** V2 Sprint 22 (billing, étape 22A) — voir `PassPurchaseRepository` (port) pour la justification
 *  du compare-and-set de `consumeForTender` (même motif que le correctif P1
 *  `reclaimStaleGenerating`, Sprint 21). */
@Injectable()
export class PrismaPassPurchaseRepository implements PassPurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<PassPurchase | null> {
    const row = await this.prisma.currentClient().organizationPassPurchase.findFirst({ where: { id, organizationId } });
    return row ? toDomain(row) : null;
  }

  async findByExternalReference(externalReference: string): Promise<PassPurchase | null> {
    const row = await this.prisma.currentClient().organizationPassPurchase.findUnique({ where: { externalReference } });
    return row ? toDomain(row) : null;
  }

  async findByTenderId(organizationId: string, tenderId: string): Promise<PassPurchase | null> {
    const row = await this.prisma.currentClient().organizationPassPurchase.findFirst({
      where: { organizationId, consumedTenderId: tenderId },
    });
    return row ? toDomain(row) : null;
  }

  async existsForOrganization(organizationId: string): Promise<boolean> {
    const count = await this.prisma.currentClient().organizationPassPurchase.count({ where: { organizationId } });
    return count > 0;
  }

  async findFirstAvailable(organizationId: string, now: Date): Promise<PassPurchase | null> {
    const row = await this.prisma.currentClient().organizationPassPurchase.findFirst({
      where: { organizationId, status: "AVAILABLE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { purchasedAt: "asc" },
    });
    return row ? toDomain(row) : null;
  }

  async list(organizationId: string, options: { cursor?: string | undefined; limit: number }): Promise<PassPurchasePage> {
    const rows = await this.prisma.currentClient().organizationPassPurchase.findMany({
      where: { organizationId },
      orderBy: [{ purchasedAt: "desc" }, { id: "desc" }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > options.limit;
    const page = hasNextPage ? rows.slice(0, options.limit) : rows;

    return {
      items: page.map(toDomain),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async create(purchase: PassPurchase): Promise<void> {
    const props = purchase.toProps();
    try {
      await this.prisma.currentClient().organizationPassPurchase.create({
        data: {
          id: props.id,
          organizationId: props.organizationId,
          status: props.status,
          externalReference: props.externalReference,
          priceCents: props.priceCents,
          currency: props.currency,
          purchasedAt: props.purchasedAt,
          expiresAt: props.expiresAt ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new PassPurchaseExternalReferenceConflictError(props.externalReference);
      }
      throw error;
    }
  }

  async consumeForTender(input: {
    organizationId: string;
    passPurchaseId: string;
    tenderId: string;
    occurredAt: Date;
  }): Promise<{ applied: boolean; purchase: PassPurchase | null }> {
    // Compare-and-set : la seule autorité réelle de la transition est la clause WHERE SQL — soit
    // encore AVAILABLE, soit déjà CONSUMED pour CE MÊME tenderId (idempotence réimport, mission
    // §7). Jamais une lecture-puis-écriture inconditionnelle (même motif que le correctif P1
    // `reclaimStaleGenerating`, Sprint 21).
    const result = await this.prisma.currentClient().organizationPassPurchase.updateMany({
      where: {
        id: input.passPurchaseId,
        organizationId: input.organizationId,
        OR: [{ status: "AVAILABLE" }, { status: "CONSUMED", consumedTenderId: input.tenderId }],
      },
      data: { status: "CONSUMED", consumedTenderId: input.tenderId, consumedAt: input.occurredAt },
    });

    const current = await this.findById(input.organizationId, input.passPurchaseId);
    return { applied: result.count > 0, purchase: current };
  }
}
