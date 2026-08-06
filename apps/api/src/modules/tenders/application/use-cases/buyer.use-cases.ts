import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { BuyerNotFoundError } from "../../domain/errors";
import { Buyer } from "../../domain/buyer.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { toBuyerSummary, type BuyerSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BUYER_REPOSITORY, type BuyerRepository } from "../ports/buyer.repository";

export type BuyerFields = Readonly<{
  name: string;
  legalName?: string | undefined;
  identifier?: string | undefined;
  siret?: string | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  buyerType?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  profileUrl?: string | undefined;
  notes?: string | undefined;
}>;

export type CreateBuyerCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; requestId?: string | undefined }> & BuyerFields;

// exactOptionalPropertyTypes : `Partial<BuyerFields>` transformerait `name` en `name?: string`
// (undefined refusé explicitement), alors que le body Zod `.partial()` produit `name?: string |
// undefined` — même motif que le helper `Patch<T>` déjà établi ailleurs dans ce module.
type BuyerFieldsPatch = { [K in keyof BuyerFields]?: BuyerFields[K] | undefined };

@Injectable()
export class ListBuyersUseCase {
  constructor(@Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository) {}

  async execute(input: { organizationId: string; actorRole: string; search?: string | undefined; includeArchived?: boolean | undefined }): Promise<BuyerSummary[]> {
    assertHasTenderPermission(input.actorRole, TenderPermission.List);
    const buyers = await this.repository.list(input);
    return buyers.map(toBuyerSummary);
  }
}

@Injectable()
export class GetBuyerUseCase {
  constructor(@Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository) {}

  async execute(input: { organizationId: string; buyerId: string; actorRole: string }): Promise<BuyerSummary> {
    assertHasTenderPermission(input.actorRole, TenderPermission.Read);
    const buyer = await this.repository.findById(input);
    if (!buyer) {
      throw new BuyerNotFoundError();
    }
    return toBuyerSummary(buyer);
  }
}

@Injectable()
export class CreateBuyerUseCase {
  constructor(
    @Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateBuyerCommand): Promise<BuyerSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Create);
    const occurredAt = this.clock.now();
    const buyer = Buyer.create({ id: randomUUID(), createdBy: command.actorId, occurredAt, ...command });
    await this.repository.save(buyer);
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "buyer.created",
      resourceType: "buyer",
      resourceId: buyer.id,
      requestId: command.requestId,
    });
    return toBuyerSummary(buyer);
  }
}

@Injectable()
export class UpdateBuyerUseCase {
  constructor(
    @Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: Readonly<{ organizationId: string; buyerId: string; actorId: string; actorRole: string; requestId?: string | undefined }> & BuyerFieldsPatch): Promise<BuyerSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);
    const buyer = await this.repository.findById(command);
    if (!buyer) {
      throw new BuyerNotFoundError();
    }
    buyer.update(command, command.actorId, this.clock.now());
    await this.repository.save(buyer);
    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "buyer.updated",
      resourceType: "buyer",
      resourceId: buyer.id,
      requestId: command.requestId,
    });
    return toBuyerSummary(buyer);
  }
}

@Injectable()
export class ArchiveBuyerUseCase {
  constructor(
    @Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { organizationId: string; buyerId: string; actorId: string; actorRole: string }): Promise<BuyerSummary> {
    assertHasTenderPermission(input.actorRole, TenderPermission.Archive);
    const buyer = await this.repository.findById(input);
    if (!buyer) {
      throw new BuyerNotFoundError();
    }
    buyer.archive(input.actorId, this.clock.now());
    await this.repository.save(buyer);
    await this.auditLogWriter.record({ organizationId: input.organizationId, actorId: input.actorId, action: "buyer.archived", resourceType: "buyer", resourceId: buyer.id });
    return toBuyerSummary(buyer);
  }
}

@Injectable()
export class RestoreBuyerUseCase {
  constructor(
    @Inject(BUYER_REPOSITORY) private readonly repository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { organizationId: string; buyerId: string; actorId: string; actorRole: string }): Promise<BuyerSummary> {
    assertHasTenderPermission(input.actorRole, TenderPermission.Archive);
    const buyer = await this.repository.findById(input);
    if (!buyer) {
      throw new BuyerNotFoundError();
    }
    buyer.restore(input.actorId, this.clock.now());
    await this.repository.save(buyer);
    await this.auditLogWriter.record({ organizationId: input.organizationId, actorId: input.actorId, action: "buyer.restored", resourceType: "buyer", resourceId: buyer.id });
    return toBuyerSummary(buyer);
  }
}
