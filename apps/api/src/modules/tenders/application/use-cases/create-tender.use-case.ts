import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderPermission } from "../../domain/tender-permission";
import { Tender } from "../../domain/tender.aggregate";
import { TenderId } from "../../domain/tender-id.value-object";
import { MarketType, parseMarketType } from "../../domain/market-type";
import { TenderCountry, parseTenderCountry } from "../../domain/tender-country";
import { TenderLanguage, parseTenderLanguage } from "../../domain/tender-language";
import { TenderSource, parseTenderSource } from "../../domain/tender-source";
import { BuyerNotFoundError } from "../../domain/errors";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BUYER_REPOSITORY, type BuyerRepository } from "../ports/buyer.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

const DEFAULT_CURRENCY = "EUR";

export type CreateTenderCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId: string;
  candidateCompanyId?: string | undefined;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  buyerId?: string | undefined;
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: string | undefined;
  visitDate?: string | undefined;
  visitMandatory?: boolean | undefined;
  contractDurationMonths?: number | undefined;
  renewalDurationMonths?: number | undefined;
  renewalCount?: number | undefined;
  estimatedStartDate?: string | undefined;
  executionLocation?: string | undefined;
  geographicZone?: string | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: string | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  electronicResponseMandatory?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  country?: string | undefined;
  language?: string | undefined;
  source?: string | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  tags?: string[] | undefined;
  requestId?: string | undefined;
}>;

export type CreateTenderResult = TenderSummary;

@Injectable()
export class CreateTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(BUYER_REPOSITORY) private readonly buyerRepository: BuyerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase,
  ) {}

  async execute(command: CreateTenderCommand): Promise<CreateTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Create);

    // Mission Sprint 5.1 §"Tenders" — un client autorisé est obligatoire : existence + appartenance
    // à l'organisation (`GetClientAccountUseCase`, jamais confiance en un `clientAccountId` fourni
    // par le client), non archivé, puis autorisation spécifique de créer POUR ce client
    // (`ClientPermission.CreateTender`, au-delà du simple droit de lecture déjà vérifié ci-dessus).
    const client = await this.getClientAccountUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    if (client.status === "ARCHIVED") {
      throw new ClientAccountArchivedError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.CreateTender,
    });

    // V2 Sprint 26 (Checkpoint 2.1-A3) — un `candidateCompanyId` FOURNI doit exister, appartenir à
    // l'organisation, et ne pas être archivé — jamais fait confiance directement (même motif que
    // `clientAccountId` ci-dessus). Organization-isolation-only (mission A1 §20) : aucune vérification
    // d'accès supplémentaire au-delà de `TenderPermission.Create` déjà vérifiée ci-dessus.
    if (command.candidateCompanyId !== undefined) {
      const candidateCompany = await this.getCandidateCompanyUseCase.execute({
        organizationId: command.organizationId,
        candidateCompanyId: command.candidateCompanyId,
      });
      if (candidateCompany.status === "ARCHIVED") {
        throw new CandidateCompanyArchivedError();
      }
    }

    // V2 Sprint 3 §5 — un `buyerId` fourni doit exister et appartenir à l'organisation, jamais
    // fait confiance directement (même motif que `clientAccountId` ci-dessus).
    if (command.buyerId !== undefined) {
      const buyer = await this.buyerRepository.findById({ organizationId: command.organizationId, buyerId: command.buyerId });
      if (!buyer) {
        throw new BuyerNotFoundError();
      }
    }

    const occurredAt = this.clock.now();

    // Mission architecture §5 — valeurs par défaut appliquées uniquement à la création (jamais
    // rétroactivement sur les Tenders existants) : PUBLIC/FR/fr/MANUAL/EUR quand rien n'est fourni.
    const tender = Tender.create({
      id: TenderId.from(this.idGenerator.generate()),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      candidateCompanyId: command.candidateCompanyId,
      title: command.title,
      reference: command.reference,
      buyerName: command.buyerName,
      buyerId: command.buyerId,
      description: command.description,
      publicationDate: command.publicationDate ? new Date(command.publicationDate) : undefined,
      submissionDeadline: command.submissionDeadline ? new Date(command.submissionDeadline) : undefined,
      submissionDeadlineTimezone: command.submissionDeadlineTimezone,
      questionsDeadline: command.questionsDeadline ? new Date(command.questionsDeadline) : undefined,
      visitDate: command.visitDate ? new Date(command.visitDate) : undefined,
      visitMandatory: command.visitMandatory,
      contractDurationMonths: command.contractDurationMonths,
      renewalDurationMonths: command.renewalDurationMonths,
      renewalCount: command.renewalCount,
      estimatedStartDate: command.estimatedStartDate ? new Date(command.estimatedStartDate) : undefined,
      executionLocation: command.executionLocation,
      geographicZone: command.geographicZone,
      isFrameworkAgreement: command.isFrameworkAgreement,
      awardType: command.awardType,
      variantsAllowed: command.variantsAllowed,
      pseAllowed: command.pseAllowed,
      electronicResponseMandatory: command.electronicResponseMandatory,
      signatureRequired: command.signatureRequired,
      submissionPlatformUrl: command.submissionPlatformUrl,
      internalNotes: command.internalNotes,
      procedureType: command.procedureType,
      marketType: command.marketType ? parseMarketType(command.marketType) : MarketType.Public,
      country: command.country ? parseTenderCountry(command.country) : TenderCountry.FR,
      language: command.language ? parseTenderLanguage(command.language) : TenderLanguage.Fr,
      source: command.source ? parseTenderSource(command.source) : TenderSource.Manual,
      externalReference: command.externalReference,
      sourceUrl: command.sourceUrl,
      estimatedAmount: command.estimatedAmount,
      minimumAmount: command.minimumAmount,
      maximumAmount: command.maximumAmount,
      currency: command.currency ?? DEFAULT_CURRENCY,
      internalOwnerId: command.internalOwnerId,
      tags: command.tags,
      createdBy: command.actorId,
      occurredAt,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 — la consommation du crédit AO/Pass n'a plus
    // lieu ICI (mission "1 Tender traité = maximum 1 crédit AO", jamais à la création : un Tender
    // créé puis jamais déposé ne doit plus jamais coûter de crédit). Relocalisée vers le premier
    // `TenderSubmission` réellement enregistré (`RecordTenderSubmissionUseCase`), voir
    // `ConsumeAoCreditUseCase`. La transaction ci-dessous reste utile pour Tender + audit + outbox
    // (jamais un Tender créé sans sa trace d'audit), sans lien avec la facturation.
    await this.atomicTransactionRunner.run(async () => {
      await this.tenderRepository.save(tender);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "tender.created",
        resourceType: "tender",
        resourceId: tender.id.value,
        requestId: command.requestId,
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TenderCreated",
            aggregateType: "Tender",
            aggregateId: tender.id.value,
            payload: { tenderId: tender.id.value, clientAccountId: tender.clientAccountId },
            occurredAt,
          },
        ],
      });
    });

    return toTenderSummary(tender);
  }
}
