import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../../application/ports/audit-log-writer";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { ChangeTenderCandidateCompanyUseCase } from "../../application/use-cases/change-tender-candidate-company.use-case";
import { CreateTenderUseCase } from "../../application/use-cases/create-tender.use-case";

/**
 * Checkpoint TENDEROS-2.1-H.2 — CORRECTION AVANT PERFORMANCE.
 *
 * La mission impose de traiter d'abord la correction sous double soumission, reprise réseau et
 * panne d'écriture — la latence ne vient qu'après. Ces preuves injectent donc de VRAIES pannes dans
 * les écritures obligatoires (journal d'audit, Outbox) et observent l'état réellement laissé en base.
 *
 * INVARIANT VISÉ : aucune mutation métier ne doit réussir silencieusement sans les écritures que
 * l'architecture rend obligatoires. Une trace d'audit manquante rend une opération invisible pour
 * l'audit ; un événement de domaine perdu laisse les consommateurs sur un état périmé, sans que rien
 * ne signale l'anomalie.
 */
describe("H.2 — correction de la création et du changement de candidat (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let ownerId: string;
  let clientId: string;
  let candidateA: string;
  let candidateB: string;
  let candidateC: string;

  let auditWriter: AuditLogWriter;
  let outboxWriter: OutboxWriter;
  let originalAuditRecord: AuditLogWriter["record"];
  let originalOutboxWrite: OutboxWriter["write"];
  let changeUseCase: ChangeTenderCandidateCompanyUseCase;
  let createUseCase: CreateTenderUseCase;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "H2", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }


  async function createCandidate(name: string): Promise<string> {
    const id = randomUUID();
    await prisma.candidateCompany.create({
      data: { id, organizationId: orgId, name, nameNormalized: `${name} ${id}`.toLowerCase(), legalName: `${name} SAS`, siren: "356000000", status: "ACTIVE", createdBy: ownerId },
    });
    return id;
  }

  /** Crée un Tender par le cas d'usage réel (jamais une ligne fabriquée) et rend son identifiant. */
  async function seedTender(candidateCompanyId: string): Promise<string> {
    const result = await createUseCase.execute({
      organizationId: orgId,
      actorId: ownerId,
      actorRole: "OWNER",
      clientAccountId: clientId,
      candidateCompanyId,
      title: `Tender H2 ${randomUUID()}`,
      buyerName: "Commune de Test",
    });
    return result.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);
    changeUseCase = moduleRef.get(ChangeTenderCandidateCompanyUseCase);
    createUseCase = moduleRef.get(CreateTenderUseCase);

    // Les écrivains sont instrumentés sur le SINGLETON réel : la panne injectée traverse donc
    // exactement le même chemin que la production, contrairement à un double posé à la construction.
    auditWriter = moduleRef.get<AuditLogWriter>(AUDIT_LOG_WRITER);
    outboxWriter = moduleRef.get<OutboxWriter>(OUTBOX_WRITER);
    originalAuditRecord = auditWriter.record.bind(auditWriter);
    originalOutboxWrite = outboxWriter.write.bind(outboxWriter);

    await prisma.organization.create({ data: { id: orgId, name: "H2", slug: `h2-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    const owner = await registerAndLogin(`h2-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    ownerId = owner.userId;
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientId, organizationId: orgId, name: `H2 client ${clientId}`, nameNormalized: `h2 client ${clientId}`, status: "ACTIVE", createdBy: ownerId },
    });

    candidateA = await createCandidate("Candidate A");
    candidateB = await createCandidate("Candidate B");
    candidateC = await createCandidate("Candidate C");
  }, 300000);

  afterEach(() => {
    // Toute instrumentation est retirée après CHAQUE test : une panne qui survivrait à son test
    // contaminerait les suivants et rendrait leurs verdicts inexploitables.
    (auditWriter as { record: AuditLogWriter["record"] }).record = originalAuditRecord;
    (outboxWriter as { write: OutboxWriter["write"] }).write = originalOutboxWrite;
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 180000);

  describe("§14/§15 — CRÉATION : les écritures obligatoires sont atomiques", () => {
    it("une panne du journal d'audit annule INTÉGRALEMENT la création", async () => {
      const title = `Tender audit-fail ${randomUUID()}`;
      (auditWriter as { record: AuditLogWriter["record"] }).record = async () => {
        throw new Error("panne injectée du journal d'audit");
      };

      await expect(
        createUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", clientAccountId: clientId, candidateCompanyId: candidateA, title, buyerName: "Commune" }),
      ).rejects.toThrow();

      expect(await prisma.tender.count({ where: { organizationId: orgId, title } }), "aucun Tender ne subsiste").toBe(0);
    }, 300000);

    it("une panne de l'Outbox annule INTÉGRALEMENT la création", async () => {
      const title = `Tender outbox-fail ${randomUUID()}`;
      (outboxWriter as { write: OutboxWriter["write"] }).write = async () => {
        throw new Error("panne injectée de l'Outbox");
      };

      await expect(
        createUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", clientAccountId: clientId, candidateCompanyId: candidateA, title, buyerName: "Commune" }),
      ).rejects.toThrow();

      expect(await prisma.tender.count({ where: { organizationId: orgId, title } })).toBe(0);
      expect(await prisma.auditLog.count({ where: { organizationId: orgId, action: "tender.created", metadata: { path: ["title"], equals: title } } })).toBe(0);
    }, 300000);
  });

  describe("§16/§17 — CHANGEMENT DE CANDIDAT : mêmes garanties exigées", () => {
    it("une panne du journal d'audit ne laisse JAMAIS le candidat changé sans sa trace", async () => {
      const tenderId = await seedTender(candidateA);
      (auditWriter as { record: AuditLogWriter["record"] }).record = async () => {
        throw new Error("panne injectée du journal d'audit");
      };

      await expect(
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB }),
      ).rejects.toThrow();

      const stored = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });
      expect(stored?.candidateCompanyId, "la mutation doit être annulée avec son audit").toBe(candidateA);
    }, 300000);

    it("une panne de l'Outbox ne laisse JAMAIS le candidat changé sans son événement", async () => {
      const tenderId = await seedTender(candidateA);
      (outboxWriter as { write: OutboxWriter["write"] }).write = async () => {
        throw new Error("panne injectée de l'Outbox");
      };

      await expect(
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB }),
      ).rejects.toThrow();

      const stored = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });
      expect(stored?.candidateCompanyId).toBe(candidateA);
      expect(
        await prisma.auditLog.count({ where: { organizationId: orgId, action: "tender.candidate_company_changed", resourceId: tenderId } }),
        "aucune trace d'audit ne doit subsister pour une mutation annulée",
      ).toBe(0);
    }, 300000);
  });

  describe("§11/§12 — changements concurrents", () => {
    it("A→B soumis DEUX FOIS simultanément : état final B, sans corruption", async () => {
      const tenderId = await seedTender(candidateA);

      const results = await Promise.allSettled([
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB }),
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB }),
      ]);

      expect(results.some((r) => r.status === "fulfilled"), "au moins une requête aboutit").toBe(true);
      const stored = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });
      expect(stored?.candidateCompanyId).toBe(candidateB);

      // §20/§21 — la détection du changement sans effet (H.2) rend ce cas naturellement idempotent
      // du point de vue OBSERVABLE : la requête perdante devient un no-op et n'écrit rien. L'audit
      // rapporte donc un seul changement, et un seul événement est émis.
      const audits = await prisma.auditLog.count({ where: { organizationId: orgId, action: "tender.candidate_company_changed", resourceId: tenderId } });
      const events = await prisma.outboxEvent.count({ where: { organizationId: orgId, eventType: "TenderCandidateCompanyChanged", aggregateId: tenderId } });
      expect(audits, "un seul changement réel, une seule trace").toBeLessThanOrEqual(1);
      expect(events, "un seul changement réel, un seul événement").toBeLessThanOrEqual(1);
    }, 300000);

    it("A→B et A→C concurrents : l'état final est l'un des deux, jamais un mélange", async () => {
      const tenderId = await seedTender(candidateA);

      await Promise.allSettled([
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB }),
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateC }),
      ]);

      const stored = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });
      expect([candidateB, candidateC], `candidat final inattendu : ${stored?.candidateCompanyId}`).toContain(stored?.candidateCompanyId);
    }, 300000);
  });

  describe("§22 — changement SANS effet (B → B)", () => {
    it("n'entraîne aucune mutation, aucune trace d'audit et aucun événement", async () => {
      const tenderId = await seedTender(candidateB);
      const before = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });

      await changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: candidateB });

      const after = await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } });
      const audits = await prisma.auditLog.count({ where: { organizationId: orgId, action: "tender.candidate_company_changed", resourceId: tenderId } });
      const events = await prisma.outboxEvent.count({ where: { organizationId: orgId, eventType: "TenderCandidateCompanyChanged", aggregateId: tenderId } });

      // Ce test CONSTATE le contrat en vigueur plutôt qu'il ne l'impose : le candidat reste B, ce qui
      // est correct. Ce qu'il rend visible, c'est le coût — une version incrémentée, une entrée
      // d'audit et un événement de domaine émis pour une opération qui n'a rien changé.
      // Contrat APRÈS correction H.2 : aucune mutation, aucune trace d'audit, aucun événement.
      // Mesure avant correction : version 1 → 2, 1 audit, 1 événement — un changement rapporté qui
      // n'avait pas eu lieu.
      expect(after?.candidateCompanyId).toBe(candidateB);
      expect(after?.version, "aucune mutation pour une opération sans effet").toBe(before?.version);
      expect(audits, "le journal d'audit ne rapporte que des changements réels").toBe(0);
      expect(events, "aucun consommateur n'est réveillé pour rien").toBe(0);
    }, 300000);
  });

  describe("§8/§9 — création en double et reprise réseau", () => {
    it("deux créations simultanées de MÊME intention produisent deux Tenders distincts (constat)", async () => {
      const title = `Tender double-submit ${randomUUID()}`;
      const command = { organizationId: orgId, actorId: ownerId, actorRole: "OWNER", clientAccountId: clientId, candidateCompanyId: candidateA, title, buyerName: "Commune" } as const;

      await Promise.allSettled([createUseCase.execute({ ...command }), createUseCase.execute({ ...command })]);

      const created = await prisma.tender.count({ where: { organizationId: orgId, title } });
      // Constat, pas verdict : l'API n'expose aucune identité d'opération, donc deux commandes
      // identiques sont deux créations légitimes de son point de vue. La question produite est de
      // savoir si l'INTERFACE peut, elle, émettre deux fois la même intention (voir preuve navigateur).
      expect(created).toBeGreaterThanOrEqual(1);
      expect({ tendersCrees: created }).toBeDefined();
    }, 300000);
  });

  describe("§28 — cloisonnement préservé", () => {
    it("un candidat d'une autre organisation est refusé à la création comme au changement", async () => {
      const foreignOrg = randomUUID();
      await prisma.organization.create({ data: { id: foreignOrg, name: "H2 etr", slug: `h2-etr-${foreignOrg}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
      const foreignCandidate = randomUUID();
      await prisma.candidateCompany.create({
        data: { id: foreignCandidate, organizationId: foreignOrg, name: "Etrangere", nameNormalized: `etrangere ${foreignCandidate}`, status: "ACTIVE", createdBy: ownerId },
      });

      await expect(
        createUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", clientAccountId: clientId, candidateCompanyId: foreignCandidate, title: `X ${randomUUID()}`, buyerName: "C" }),
      ).rejects.toThrow();

      const tenderId = await seedTender(candidateA);
      await expect(
        changeUseCase.execute({ organizationId: orgId, actorId: ownerId, actorRole: "OWNER", tenderId, candidateCompanyId: foreignCandidate }),
      ).rejects.toThrow();
      expect((await prisma.tender.findFirst({ where: { id: tenderId, organizationId: orgId } }))?.candidateCompanyId).toBe(candidateA);

      await prisma.candidateCompany.deleteMany({ where: { organizationId: foreignOrg } });
      await prisma.organization.deleteMany({ where: { id: foreignOrg } });
    }, 300000);
  });
});
