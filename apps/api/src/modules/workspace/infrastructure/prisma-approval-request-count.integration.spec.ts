import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaApprovalRequestRepository } from "./prisma-approval-request.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.2 (§11) — preuve PostgreSQL RÉELLE que `countByReviewer`
 * (introduit en E12.1 pour le KPI Dashboard "Validations en attente") est rigoureusement équivalent
 * à `listByReviewer(...).length` sur TOUTES les dimensions du périmètre : organisation, reviewer,
 * statut, ClientAccess.
 *
 * L'enjeu est précis : la tentation évidente était de borner `listByReviewer` avec un `take`, ce qui
 * aurait rendu le KPI silencieusement FAUX au-delà de la borne. Ce test verrouille l'invariant
 * inverse — le compteur ne peut JAMAIS diverger de la liste, quel que soit le volume — et échouerait
 * immédiatement si quelqu'un ajoutait plus tard une borne à l'une des deux méthodes.
 */
describe("ApprovalRequest — countByReviewer ≡ listByReviewer (Checkpoint TENDEROS-2.1-P2.3-E12.2) — PostgreSQL réel", () => {
  let prisma: PrismaService;
  let repository: PrismaApprovalRequestRepository;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const reviewerId = randomUUID();
  const otherReviewerId = randomUUID();
  const requesterId = randomUUID();
  const clientVisibleId = randomUUID();
  const clientHiddenId = randomUUID();
  const tenderVisibleId = randomUUID();
  const tenderHiddenId = randomUUID();
  const tenderOrgBId = randomUUID();
  const clientOrgBId = randomUUID();

  /** Volume délibérément supérieur à toute borne d'affichage plausible : une troncature silencieuse
   *  se verrait immédiatement. */
  const PENDING_VISIBLE = 120;
  const PENDING_HIDDEN = 40;
  const APPROVED_VISIBLE = 25;
  const OTHER_REVIEWER = 17;
  const ORG_B = 13;

  async function seedApprovals(input: { count: number; organizationId: string; tenderId: string; reviewerId: string; status: string }): Promise<void> {
    await prisma.approvalRequest.createMany({
      data: Array.from({ length: input.count }, () => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        entityType: "TASK",
        entityId: randomUUID(),
        requestedBy: requesterId,
        reviewerId: input.reviewerId,
        status: input.status,
      })),
    });
  }

  beforeAll(async () => {
    prisma = new PrismaClient() as unknown as PrismaService;
    // `currentClient()` est une MÉTHODE sur PrismaService (jamais un accesseur — voir la note Proxy
    // dans prisma.service.ts) : le repository l'appelle, on la fournit donc explicitement ici.
    (prisma as unknown as { currentClient: () => unknown }).currentClient = () => prisma;
    repository = new PrismaApprovalRequestRepository(prisma);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Approval Count Org A", slug: `approval-count-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Approval Count Org B", slug: `approval-count-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.createMany({
      data: [
        { id: clientVisibleId, organizationId: orgAId, name: "Client visible", nameNormalized: "client visible", status: "ACTIVE", createdBy: requesterId },
        { id: clientHiddenId, organizationId: orgAId, name: "Client hors perimetre", nameNormalized: "client hors perimetre", status: "ACTIVE", createdBy: requesterId },
        { id: clientOrgBId, organizationId: orgBId, name: "Client Org B", nameNormalized: "client org b", status: "ACTIVE", createdBy: requesterId },
      ],
    });
    await prisma.tender.createMany({
      data: [
        { id: tenderVisibleId, organizationId: orgAId, clientAccountId: clientVisibleId, title: "Tender visible", status: "IN_ANALYSIS", tags: [], createdBy: requesterId },
        { id: tenderHiddenId, organizationId: orgAId, clientAccountId: clientHiddenId, title: "Tender hors perimetre", status: "IN_ANALYSIS", tags: [], createdBy: requesterId },
        { id: tenderOrgBId, organizationId: orgBId, clientAccountId: clientOrgBId, title: "Tender Org B", status: "IN_ANALYSIS", tags: [], createdBy: requesterId },
      ],
    });

    await Promise.all([
      seedApprovals({ count: PENDING_VISIBLE, organizationId: orgAId, tenderId: tenderVisibleId, reviewerId, status: "PENDING" }),
      seedApprovals({ count: PENDING_HIDDEN, organizationId: orgAId, tenderId: tenderHiddenId, reviewerId, status: "PENDING" }),
      seedApprovals({ count: APPROVED_VISIBLE, organizationId: orgAId, tenderId: tenderVisibleId, reviewerId, status: "APPROVED" }),
      seedApprovals({ count: OTHER_REVIEWER, organizationId: orgAId, tenderId: tenderVisibleId, reviewerId: otherReviewerId, status: "PENDING" }),
      seedApprovals({ count: ORG_B, organizationId: orgBId, tenderId: tenderOrgBId, reviewerId, status: "PENDING" }),
    ]);
  }, 120000);

  afterAll(async () => {
    await prisma.approvalRequest.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  }, 60000);

  const scenarios = [
    { label: "organisation + reviewer, tous statuts, accès total", input: { organizationId: orgAId, reviewerId }, expected: PENDING_VISIBLE + PENDING_HIDDEN + APPROVED_VISIBLE },
    { label: "filtre de STATUT (PENDING) — le KPI Dashboard exact", input: { organizationId: orgAId, reviewerId, status: "PENDING" }, expected: PENDING_VISIBLE + PENDING_HIDDEN },
    { label: "ClientAccess restreint à un seul client", input: { organizationId: orgAId, reviewerId, status: "PENDING", restrictToClientAccountIds: [clientVisibleId] }, expected: PENDING_VISIBLE },
    { label: "ClientAccess vide = AUCUN accès (jamais un accès par défaut)", input: { organizationId: orgAId, reviewerId, status: "PENDING", restrictToClientAccountIds: [] }, expected: 0 },
    { label: "isolation tenant — Org B ne voit que ses propres demandes", input: { organizationId: orgBId, reviewerId, status: "PENDING" }, expected: ORG_B },
    { label: "scope reviewer — jamais les demandes d'un autre relecteur", input: { organizationId: orgAId, reviewerId: otherReviewerId, status: "PENDING" }, expected: OTHER_REVIEWER },
  ] as const;

  it.each(scenarios)("BLOQUANT — $label : COUNT(*) == longueur de la liste complète, et == la vérité terrain", async ({ input, expected }) => {
    const [list, count] = await Promise.all([repository.listByReviewer({ ...input }), repository.countByReviewer({ ...input })]);

    // 1) Le compteur ne diverge jamais de la liste réellement renvoyée.
    expect(count).toBe(list.length);
    // 2) ...et les deux correspondent au volume réellement semé — ce qui exclut qu'une borne
    //    silencieuse (un `take`) se soit glissée dans l'une OU l'autre des deux méthodes.
    expect(count).toBe(expected);
  });

  it("BLOQUANT — aucune borne cachée : la liste complète dépasse largement toute limite d'affichage plausible", async () => {
    const list = await repository.listByReviewer({ organizationId: orgAId, reviewerId, status: "PENDING" });
    expect(list.length).toBe(PENDING_VISIBLE + PENDING_HIDDEN);
    expect(list.length).toBeGreaterThan(100);
  });
});
