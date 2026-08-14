import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type {
  MembershipPage,
  MembershipRepository,
  OwnershipTransferContext,
} from "../application/ports/membership.repository";
import type { OrganizationMembership } from "../domain/organization-membership.aggregate";
import type { OrganizationRole } from "../domain/organization-role";
import { MembershipStatus } from "../domain/membership-status";
import {
  OrganizationMembershipPersistenceMapper,
  type MembershipRecordWithRole,
} from "./organization-membership.persistence-mapper";

const MEMBERSHIP_INCLUDE = { roles: { include: { role: true } } } as const;

/** Durée large et volontaire (mission P0-2) : la transaction reste ouverte tant que `fn` (fourni
 *  par TransferOrganizationOwnershipUseCase) n'a pas terminé, y compris l'attente d'un éventuel
 *  transfert concurrent déjà en cours sur la même organisation. */
const OWNERSHIP_TRANSFER_TX_OPTIONS = { timeout: 15_000, maxWait: 15_000 } as const;

@Injectable()
export class PrismaMembershipRepository implements MembershipRepository {
  private readonly mapper = new OrganizationMembershipPersistenceMapper();

  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; membershipId: string }): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findFirst({
      where: { id: input.membershipId, organizationId: input.organizationId },
      include: MEMBERSHIP_INCLUDE,
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async findByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMembership | null> {
    const record = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
      include: MEMBERSHIP_INCLUDE,
    });

    return record ? this.mapper.toDomain(record) : null;
  }

  async listByOrganization(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
  }): Promise<MembershipPage> {
    const records = await this.prisma.organizationMembership.findMany({
      where: { organizationId: input.organizationId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    return this.toPage(records, input.limit);
  }

  async listByUser(input: { userId: string; cursor?: string | undefined; limit: number }): Promise<MembershipPage> {
    const records = await this.prisma.organizationMembership.findMany({
      where: { userId: input.userId },
      include: MEMBERSHIP_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    return this.toPage(records, input.limit);
  }

  async countActiveByOrganizationAndRole(input: { organizationId: string; role: OrganizationRole }): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: {
        organizationId: input.organizationId,
        status: MembershipStatus.Active,
        roles: { some: { role: { code: input.role } } },
      },
    });
  }

  async countActiveByOrganization(organizationId: string): Promise<number> {
    return this.prisma.organizationMembership.count({
      where: { organizationId, status: MembershipStatus.Active },
    });
  }

  async listActiveByOrganizationAndRoles(input: { organizationId: string; roles: readonly OrganizationRole[] }): Promise<OrganizationMembership[]> {
    const records = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: input.organizationId,
        status: MembershipStatus.Active,
        roles: { some: { role: { code: { in: [...input.roles] } } } },
      },
      include: MEMBERSHIP_INCLUDE,
    });
    return records.map((record) => this.mapper.toDomain(record));
  }

  async save(membership: OrganizationMembership): Promise<void> {
    const data = this.mapper.toPersistence(membership);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: membership.role } });

    await this.prisma.$transaction([
      this.prisma.organizationMembership.upsert({
        where: { id: data.id },
        create: data,
        update: data,
      }),
      this.prisma.membershipRole.deleteMany({ where: { membershipId: data.id } }),
      this.prisma.membershipRole.create({
        data: { membershipId: data.id, roleId: role.id },
      }),
    ]);
  }

  async runExclusiveForOrganization<T>(input: {
    organizationId: string;
    fn: (context: OwnershipTransferContext) => Promise<T>;
  }): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Verrou consultatif Postgres scopé à l'organisation (BR-ORG-004) : sérialise tout
      // transfert de propriété concurrent pour CETTE organisation uniquement — les transferts
      // d'autres organisations ne sont jamais bloqués. Auto-libéré à la fin de la transaction
      // (variante "xact"), même motif que PrismaTenderLotRepository.createAppendedAtEnd.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.organizationId}))`;

      const context: OwnershipTransferContext = {
        findByOrganizationAndUser: async (findInput) => {
          const record = await tx.organizationMembership.findUnique({
            where: { organizationId_userId: { organizationId: findInput.organizationId, userId: findInput.userId } },
            include: MEMBERSHIP_INCLUDE,
          });
          return record ? this.mapper.toDomain(record) : null;
        },
        findById: async (findInput) => {
          const record = await tx.organizationMembership.findFirst({
            where: { id: findInput.membershipId, organizationId: findInput.organizationId },
            include: MEMBERSHIP_INCLUDE,
          });
          return record ? this.mapper.toDomain(record) : null;
        },
        save: async (saveInput) => {
          const previousData = this.mapper.toPersistence(saveInput.previousOwner);
          const newData = this.mapper.toPersistence(saveInput.newOwner);

          const [previousRole, newRole] = await Promise.all([
            tx.role.findUniqueOrThrow({ where: { code: saveInput.previousOwner.role } }),
            tx.role.findUniqueOrThrow({ where: { code: saveInput.newOwner.role } }),
          ]);

          // Séquence d'awaits sur `tx` (déjà une transaction ouverte) : atomique sans nécessiter
          // un second niveau de `$transaction` (Prisma ne supporte pas les transactions imbriquées).
          await tx.organizationMembership.update({ where: { id: previousData.id }, data: previousData });
          await tx.membershipRole.deleteMany({ where: { membershipId: previousData.id } });
          await tx.membershipRole.create({ data: { membershipId: previousData.id, roleId: previousRole.id } });
          await tx.organizationMembership.update({ where: { id: newData.id }, data: newData });
          await tx.membershipRole.deleteMany({ where: { membershipId: newData.id } });
          await tx.membershipRole.create({ data: { membershipId: newData.id, roleId: newRole.id } });
        },
      };

      return input.fn(context);
    }, OWNERSHIP_TRANSFER_TX_OPTIONS);
  }

  private toPage(records: MembershipRecordWithRole[], limit: number): MembershipPage {
    const hasNextPage = records.length > limit;
    const page = hasNextPage ? records.slice(0, limit) : records;
    const items = page.map((record) => this.mapper.toDomain(record));

    return {
      items,
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
