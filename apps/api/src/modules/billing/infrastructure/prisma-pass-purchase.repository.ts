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
    reservedTenderId: row.reservedTenderId ?? undefined,
    reservedAt: row.reservedAt ?? undefined,
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

  async findAssignedToTender(organizationId: string, tenderId: string): Promise<PassPurchase | null> {
    const row = await this.prisma.currentClient().organizationPassPurchase.findFirst({
      where: { organizationId, OR: [{ status: "RESERVED", reservedTenderId: tenderId }, { status: "CONSUMED", consumedTenderId: tenderId }] },
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
    // encore AVAILABLE (legacy, Pass jamais passé par reserveForTender), soit déjà RESERVED pour CE
    // MÊME tenderId (chemin nominal E1.2), soit déjà CONSUMED pour CE MÊME tenderId (idempotence
    // réimport, mission §7). Jamais une lecture-puis-écriture inconditionnelle (même motif que le
    // correctif P1 `reclaimStaleGenerating`, Sprint 21).
    const result = await this.prisma.currentClient().organizationPassPurchase.updateMany({
      where: {
        id: input.passPurchaseId,
        organizationId: input.organizationId,
        OR: [{ status: "AVAILABLE" }, { status: "RESERVED", reservedTenderId: input.tenderId }, { status: "CONSUMED", consumedTenderId: input.tenderId }],
      },
      data: { status: "CONSUMED", consumedTenderId: input.tenderId, consumedAt: input.occurredAt },
    });

    const current = await this.findById(input.organizationId, input.passPurchaseId);
    return { applied: result.count > 0, purchase: current };
  }

  /** Voir le port pour la justification complète de l'atomicité (double garde-fou : compare-and-set
   *  par ligne + index unique partiel sur `(organization_id, reserved_tender_id)`). */
  async reserveForTender(input: { organizationId: string; tenderId: string; now: Date }): Promise<{ applied: boolean; purchase: PassPurchase | null }> {
    const alreadyAssigned = await this.findAssignedToTender(input.organizationId, input.tenderId);
    if (alreadyAssigned) {
      return { applied: true, purchase: alreadyAssigned };
    }

    const candidates = await this.prisma.currentClient().organizationPassPurchase.findMany({
      where: { organizationId: input.organizationId, status: "AVAILABLE", OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }] },
      orderBy: { purchasedAt: "asc" },
    });

    for (const candidate of candidates) {
      try {
        const result = await this.prisma.currentClient().organizationPassPurchase.updateMany({
          where: { id: candidate.id, organizationId: input.organizationId, status: "AVAILABLE" },
          data: { status: "RESERVED", reservedTenderId: input.tenderId, reservedAt: input.now },
        });
        if (result.count > 0) {
          const updated = await this.findById(input.organizationId, candidate.id);
          return { applied: true, purchase: updated };
        }
        // Course perdue sur CETTE ligne précise (un autre Tender l'a réservée entre le SELECT et
        // l'UPDATE) — jamais une erreur, on tente le prochain candidat disponible.
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          // Un appel réellement concurrent pour CE MÊME tenderId a déjà réservé un Pass DIFFÉRENT
          // (index unique partiel) — cette ligne-ci reste AVAILABLE (le seul statement échoue,
          // jamais un état orphelin) ; on relit et renvoie la réservation gagnante.
          const winning = await this.findAssignedToTender(input.organizationId, input.tenderId);
          return { applied: winning !== null, purchase: winning };
        }
        throw error;
      }
    }

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §10 TEST 2 — tous les candidats ont été perdus au
    // compare-and-set (chaque ligne a été prise entre le SELECT et l'UPDATE), MAIS par QUI ? Deux
    // origines distinctes pour cette perte, jamais confondues :
    //   - un AUTRE tenderId a pris le(s) dernier(s) Pass -> rien à réserver ici, `applied: false` ;
    //   - un appel réellement CONCURRENT pour CE MÊME tenderId (mission TEST 2, ex. double-clic ou
    //     deux requêtes HTTP parallèles sur la même première opération) a déjà gagné la course sur
    //     LE MÊME Pass -> cet appel-ci doit reconnaître le succès de son "jumeau", jamais le refuser
    //     à tort (un TenderOperationNotEntitledError immérité serait un P1 : le Tender EST bien
    //     couvert, juste par la réservation gagnante du même tenderId).
    // Relecture finale — idempotente, jamais un troisième mécanisme de concurrence.
    const resolvedByConcurrentSibling = await this.findAssignedToTender(input.organizationId, input.tenderId);
    return { applied: resolvedByConcurrentSibling !== null, purchase: resolvedByConcurrentSibling };
  }

  /** Voir le port pour la justification complète (compare-and-set symétrique de `reserveForTender` —
   *  la clause `WHERE status = 'RESERVED'` rend une libération après CONSUMED structurellement
   *  impossible, jamais seulement conventionnelle). */
  async releaseReservation(input: { organizationId: string; passPurchaseId: string; tenderId: string; occurredAt: Date }): Promise<{ applied: boolean; purchase: PassPurchase | null }> {
    const result = await this.prisma.currentClient().organizationPassPurchase.updateMany({
      where: { id: input.passPurchaseId, organizationId: input.organizationId, status: "RESERVED", reservedTenderId: input.tenderId },
      data: { status: "AVAILABLE", reservedTenderId: null, reservedAt: null },
    });

    const current = await this.findById(input.organizationId, input.passPurchaseId);
    return { applied: result.count > 0, purchase: current };
  }
}
