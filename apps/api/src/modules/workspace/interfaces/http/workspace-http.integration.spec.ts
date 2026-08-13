import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OutboxPublisherWorker } from "../../../outbox/infrastructure/outbox-publisher.worker";

/**
 * V2 Sprint 7 (Workspace collaboratif) — preuve réelle contre HTTP + PostgreSQL (NestJS) : flux
 * principal, isolation multi-tenant, ClientAccess AU SEIN de la MÊME organisation (mission §63,
 * scénario "Alice/Karim" — test explicitement critique), anti-IDOR sur chaque UUID enfant, et
 * concurrence (double approbation).
 */
describe("Workspace collaboratif — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let outboxWorker: OutboxPublisherWorker;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenKarim: string;
  let ownerAUserId: string;
  let ownerBUserId: string;
  let karimUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Workspace HTTP Test" }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Workspace ${suffix}`, nameNormalized: `client workspace ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Workspace HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  /** V2 Sprint 18 — cible immuable la plus simple à fabriquer directement (pas de Document/
   *  DocumentVersion source requis, contrairement à PricingScheduleVersion). `status` par défaut
   *  DRAFT (mission §25 "jamais latest/modifiable" — les tests ci-dessous vérifient explicitement
   *  qu'une demande de validation est refusée tant que ce n'est pas VALIDATED). */
  async function createResponsePackageVersion(input: { organizationId: string; tenderId: string; clientAccountId: string; userId: string; status?: "DRAFT" | "VALIDATED"; versionNumber?: number }) {
    const pkg = await prisma.responsePackage.create({
      data: { id: randomUUID(), organizationId: input.organizationId, tenderId: input.tenderId, clientAccountId: input.clientAccountId, status: "DRAFT", createdBy: input.userId },
    });
    const version = await prisma.responsePackageVersion.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        responsePackageId: pkg.id,
        versionNumber: input.versionNumber ?? 1,
        status: input.status ?? "DRAFT",
        createdBy: input.userId,
        validatedBy: input.status === "VALIDATED" ? input.userId : null,
        validatedAt: input.status === "VALIDATED" ? new Date() : null,
      },
    });
    return { responsePackageId: pkg.id, versionId: version.id };
  }

  /** Correctif audit — CHAQUE fichier d'intégration de ce dépôt boote son propre `AppModule` complet
   *  via `Test.createTestingModule`, donc son propre `OutboxPublisherWorker` avec un vrai minuteur
   *  périodique (`onModuleInit`, jamais désactivé en test). Quand plusieurs fichiers tournent en
   *  parallèle (comportement par défaut de vitest), ces workers indépendants se disputent les MÊMES
   *  lignes `outbox_events` via `FOR UPDATE SKIP LOCKED` : un `.tick()` isolé peut légitimement
   *  "sauter" un événement qu'un AUTRE worker a déjà verrouillé au même instant, sans que sa
   *  transaction n'ait encore committé. Un seul tick + assertion immédiate est donc intrinsèquement
   *  fragile sous exécution concurrente (déjà vrai avant ce sprint, aggravé par le nombre de tests
   *  qui vérifient maintenant des effets Notification précis) — on retente donc plusieurs tick()
   *  espacés avant d'échouer, jamais une seule tentative sèche. */
  async function waitForNotification(predicate: () => Promise<boolean>, timeoutMs = 10000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await outboxWorker.tick();
      if (await predicate()) return;
      if (Date.now() >= deadline) {
        throw new Error(`waitForNotification: condition not met within ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);
    outboxWorker = moduleRef.get(OutboxPublisherWorker);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Workspace Org A HTTP", slug: `workspace-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Workspace Org B HTTP", slug: `workspace-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01) — les circuits de validation
    // (APPROVAL_WORKFLOWS) sont désormais Business/Enterprise uniquement : ce test exerce le
    // module Sprint 18 (Approvals) lui-même, jamais le gating par plan.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "BUSINESS", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
        { id: randomUUID(), organizationId: orgBId, planTier: "BUSINESS", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
      ],
    });

    const ownerA = await registerAndLogin(`workspace-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`workspace-owner-b-${randomUUID()}@smoke.test`);
    const karim = await registerAndLogin(`workspace-karim-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, karim.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenKarim = karim.token;
    ownerAUserId = ownerA.userId;
    ownerBUserId = ownerB.userId;
    karimUserId = karim.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    // Karim est membre de l'organisation A (BID_MANAGER, palier organisation large — la vraie
    // restriction vit au palier client, voir Alice/Karim ci-dessous).
    await addMembership({ organizationId: orgAId, userId: karim.userId, role: OrganizationRole.BidManager });
  }, 60000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackageVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.mention.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.comment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.approvalRequest.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderActivity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.task.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderParticipant.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("main flow: add participant, create+assign+complete a task, comment with a mention, request+approve a validation, activity feed reflects it all", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: ownerAUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });

    const addParticipantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: karimUserId, role: "TECHNICAL_WRITER" }),
    });
    expect(addParticipantRes.status).toBe(201);
    const participant = (await addParticipantRes.json()) as { id: string; userId: string; role: string };
    expect(participant.role).toBe("TECHNICAL_WRITER");

    // Alice (Owner) doit elle-même être participante pour pouvoir être désignée reviewer (Décision
    // 2 du plan : TenderParticipant est la source unique de vérité pour "qui peut être reviewer").
    const addSelfParticipantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }),
    });
    expect(addSelfParticipantRes.status).toBe(201);

    const createTaskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Récupérer l'attestation fiscale", priority: "HIGH", assigneeId: karimUserId }),
    });
    expect(createTaskRes.status).toBe(201);
    const task = (await createTaskRes.json()) as { id: string; status: string; assigneeId: string };
    expect(task.status).toBe("TODO");
    expect(task.assigneeId).toBe(karimUserId);

    const commentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "TASK", entityId: task.id, body: "Karim, merci de traiter en priorité.", mentionedUserIds: [karimUserId] }),
    });
    expect(commentRes.status).toBe(201);
    const comment = (await commentRes.json()) as { id: string; mentionedUserIds: string[] };
    expect(comment.mentionedUserIds).toEqual([karimUserId]);

    const completeRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks/${task.id}/complete`, { method: "POST", headers: authHeaders(tokenKarim, orgAId) });
    expect(completeRes.status).toBe(200);
    const completed = (await completeRes.json()) as { status: string; completedBy: string };
    expect(completed.status).toBe("DONE");
    expect(completed.completedBy).toBe(karimUserId);

    // Karim (CONTRIBUTOR côté client) demande une validation à Alice (CLIENT_MANAGER, ValidateWorkspace).
    const requestApprovalRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenKarim, orgAId),
      body: JSON.stringify({ entityType: "TASK", entityId: task.id, reviewerId: ownerAUserId, comment: "Prêt pour relecture." }),
    });
    expect(requestApprovalRes.status).toBe(201);
    const approval = (await requestApprovalRes.json()) as { id: string; status: string };
    expect(approval.status).toBe("PENDING");

    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ comment: "Conforme." }),
    });
    expect(approveRes.status).toBe(200);
    expect(((await approveRes.json()) as { status: string }).status).toBe("APPROVED");

    const activityRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/activity`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(activityRes.status).toBe(200);
    const activity = (await activityRes.json()) as { items: { type: string }[] };
    const activityTypes = activity.items.map((item) => item.type);
    expect(activityTypes).toEqual(
      expect.arrayContaining(["TENDER_PARTICIPANT_ADDED", "TASK_CREATED", "TASK_ASSIGNED", "COMMENT_ADDED", "USER_MENTIONED", "TASK_COMPLETED", "APPROVAL_REQUESTED", "APPROVAL_APPROVED"]),
    );
  });

  it("workspace-members: a BID_MANAGER/CONTRIBUTOR without the org-admin MemberList permission can still list members to populate participant/assignee/mention dropdowns (regression — was 403 via /organization-memberships)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    // Preuve du bug corrigé : Karim (BID_MANAGER) n'a AUCUNE permission organization:member:list
    // (réservée OWNER/ORGANIZATION_ADMIN) — l'ancien chemin via /organization-memberships le
    // bloquait (403) rien que pour ouvrir l'onglet Workspace.
    const orgAdminRoute = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(orgAdminRoute.status).toBe(403);

    const membersRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/workspace-members`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(membersRes.status).toBe(200);
    const members = (await membersRes.json()) as { userId: string; email: string; displayName: string }[];
    expect(members.map((m) => m.userId)).toEqual(expect.arrayContaining([ownerAUserId, karimUserId]));

    // Toujours gouverné par ReadWorkspace (accès Tender/Client réel), jamais un accès sans borne :
    // org B ne voit rien de ce Tender via cette même route.
    const crossOrgRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/workspace-members`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgRes.status).toBe(404);
  });

  it("workspace-members: NEVER leaks a member of a DIFFERENT client of the SAME organization (audit Codex P1-01 — same-org cross-client isolation applies to the directory too)", async () => {
    const clientA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const jean = await registerAndLogin(`workspace-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    // Jean n'a d'accès QU'au Client B — jamais au Client A dont relève le Tender interrogé ci-dessous.
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    await assignClient({ organizationId: orgAId, clientAccountId: clientA.clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const membersRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/workspace-members`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(membersRes.status).toBe(200);
    const members = (await membersRes.json()) as { userId: string; email: string; displayName: string }[];

    expect(members.map((m) => m.userId)).toContain(karimUserId);
    expect(members.map((m) => m.userId)).not.toContain(jean.userId);
  });

  it("cross-tenant: organization B can neither see nor act on organization A's workspace (404, never leaking existence)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const listParticipantsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(listParticipantsRes.status).toBe(404);

    const workspaceMembersRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/workspace-members`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(workspaceMembersRes.status).toBe(404);

    const addParticipantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ userId: ownerBUserId, role: "VIEWER" }),
    });
    expect(addParticipantRes.status).toBe(404);

    const listTasksRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(listTasksRes.status).toBe(404);

    const createTaskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId), body: JSON.stringify({ title: "x" }) });
    expect(createTaskRes.status).toBe(404);

    const commentsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/comments`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(commentsRes.status).toBe(404);

    const approvalsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(approvalsRes.status).toBe(404);

    const activityRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/activity`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(activityRes.status).toBe(404);

    const myTasksRes = await fetch(`${baseUrl}/api/v1/me/tasks`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(myTasksRes.status).toBe(200);
    expect((await myTasksRes.json()) as unknown[]).toHaveLength(0);
  });

  it("ClientAccess WITHIN THE SAME organization (mission §63, critical): Karim assigned to Client A1 cannot see or touch the workspace of a Tender belonging to Client A2", async () => {
    const clientA1 = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientA2 = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId: clientA1.clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    // Karim n'a AUCUNE affectation sur clientA2 — même organisation, même token, même rôle
    // d'organisation (BID_MANAGER), mais aucun accès client réel sur ce Tender précis.

    const listParticipantsRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA2.tenderId}/participants`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(listParticipantsRes.status).toBe(404);

    const workspaceMembersRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA2.tenderId}/workspace-members`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(workspaceMembersRes.status).toBe(404);

    const listTasksRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA2.tenderId}/tasks`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(listTasksRes.status).toBe(404);

    const createTaskRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA2.tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({ title: "x" }) });
    expect(createTaskRes.status).toBe(404);

    const activityRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA2.tenderId}/activity`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(activityRes.status).toBe(404);

    // Preuve inverse : Karim PEUT bien agir sur clientA1, où il a une affectation réelle — la
    // restriction ci-dessus n'est pas un bug d'authentification générale.
    const okRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA1.tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({ title: "Tâche autorisée" }) });
    expect(okRes.status).toBe(201);
  });

  it("anti-IDOR: a participantId/taskId/commentId/approvalId that belongs to a DIFFERENT Tender of the SAME organization is rejected", async () => {
    const tenderA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const tenderB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId: tenderA.clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const participantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA.tenderId}/participants`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: karimUserId, role: "VIEWER" }),
    });
    expect(participantRes.status).toBe(201);
    const participant = (await participantRes.json()) as { id: string };

    const taskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA.tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Tâche A" }) });
    expect(taskRes.status).toBe(201);
    const task = (await taskRes.json()) as { id: string };

    // participantId/taskId réels, mais rattachés au Tender A — jamais acceptés via l'URL du Tender B.
    const crossTenderParticipantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderB.tenderId}/participants/${participant.id}`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(crossTenderParticipantRes.status).toBe(404);

    const crossTenderTaskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderB.tenderId}/tasks/${task.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(crossTenderTaskRes.status).toBe(404);

    const crossTenderCommentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderB.tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "TASK", entityId: task.id, body: "x" }),
    });
    expect(crossTenderCommentRes.status).toBe(404);
  });

  it("BLOQUANT — audit fix: GET .../comments?entityType=&entityId= never leaks comments of an entity belonging to a DIFFERENT Tender of the SAME organization", async () => {
    const tenderA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const tenderB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId: tenderB.clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderB.tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "VIEWER" }) });

    const taskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA.tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Tâche confidentielle A" }) });
    const task = (await taskRes.json()) as { id: string };
    const commentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA.tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "TASK", entityId: task.id, body: "Contenu confidentiel du Tender A" }),
    });
    expect(commentRes.status).toBe(201);

    // Karim a un accès réel au Tender B (jamais au Tender A) — il connaît/devine l'UUID de la tâche A
    // et tente de lire ses commentaires via l'URL du Tender B auquel il a accès. Avant le correctif,
    // `listByEntity` filtrait seulement organizationId+entityType+entityId (jamais tenderId) :
    // le commentaire du Tender A était renvoyé.
    const leakRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderB.tenderId}/comments?entityType=TASK&entityId=${task.id}`, { headers: authHeaders(tokenKarim, orgAId) });
    expect(leakRes.status).toBe(200);
    const leaked = (await leakRes.json()) as unknown[];
    expect(leaked).toHaveLength(0);
  });

  it("never mentions a user without access to this Tender, even when explicitly requested — the WHOLE comment is refused (mission §23/§47)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "TENDER", entityId: tenderId, body: "x", mentionedUserIds: [karimUserId] }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("INVALID_MENTION_TARGET");

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/comments`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await listRes.json()) as unknown[]).toHaveLength(0);
  });

  it("concurrency: two concurrent approve requests on the same ApprovalRequest — only one succeeds, the other fails cleanly (mission §48)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    // CLIENT_MANAGER, jamais CONTRIBUTOR : ValidateWorkspace est réservé au palier "règle stricte" (mission §29).
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    const addParticipantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }),
    });
    expect(addParticipantRes.status).toBe(201);

    const taskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Tâche à valider" }) });
    expect(taskRes.status).toBe(201);
    const task = (await taskRes.json()) as { id: string };

    const approvalRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "TASK", entityId: task.id, reviewerId: karimUserId }),
    });
    expect(approvalRes.status).toBe(201);
    const approval = (await approvalRes.json()) as { id: string };

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) }),
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  // ---- V2 Sprint 18 (Collaboration avancée & validations finales) ----

  it("BLOQUANT — mission §25/§46: an ApprovalRequest on RESPONSE_PACKAGE_VERSION is refused while the version is not yet VALIDATED", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { versionId: draftVersionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "DRAFT" });

    const blockedRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: draftVersionId, reviewerId: karimUserId }),
    });
    expect(blockedRes.status).toBe(422);
    expect(((await blockedRes.json()) as { error: { code: string } }).error.code).toBe("APPROVAL_TARGET_NOT_IMMUTABLE");
  });

  it("BLOQUANT — mission §26/§31/§50: full flow on RESPONSE_PACKAGE_VERSION once VALIDATED — reviewer authority reuses ValidateResponsePackage, both request and decision create real Notification rows, activity reflects it", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: ownerAUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { versionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED" });

    const requestRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: versionId, reviewerId: karimUserId, comment: "Merci de valider avant dépôt." }),
    });
    expect(requestRes.status).toBe(201);
    const approval = (await requestRes.json()) as { id: string; status: string };
    expect(approval.status).toBe("PENDING");

    // Mission §50 "Demande créée → approver notifié" — vraie ligne Notification, pas seulement un
    // événement Outbox non consommé (le bug corrigé lors de l'audit Sprint 18). `karimUserId` est
    // réutilisé par d'autres tests de ce fichier : on cherche la notification qui référence CETTE
    // approbation précise, jamais `[0]`.
    await waitForNotification(async () => {
      const rows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: karimUserId, type: "WORKSPACE_APPROVAL_REQUESTED" } });
      return rows.some((n) => n.targetUrl?.includes(approval.id));
    });

    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, {
      method: "POST",
      headers: authHeaders(tokenKarim, orgAId),
      body: JSON.stringify({ comment: "Dossier conforme, approuvé." }),
    });
    expect(approveRes.status).toBe(200);
    expect(((await approveRes.json()) as { status: string }).status).toBe("APPROVED");

    // Mission §50 "Approved/Rejected → requester notified".
    await waitForNotification(async () => {
      const rows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: ownerAUserId, type: "WORKSPACE_APPROVAL_APPROVED" } });
      return rows.some((n) => n.targetUrl?.includes(approval.id));
    });

    const activityRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/activity`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const activity = (await activityRes.json()) as { items: { type: string }[] };
    expect(activity.items.map((item) => item.type)).toEqual(expect.arrayContaining(["APPROVAL_REQUESTED", "APPROVAL_APPROVED"]));
  });

  it("BLOQUANT — mission §27/§34/§48: reject() requires a non-empty reason, transitions to REJECTED, notifies the requester, and a second decision is refused", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { versionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED" });
    const requestRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: versionId, reviewerId: karimUserId }),
    });
    const approval = (await requestRes.json()) as { id: string };

    const emptyReasonRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/reject`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({ reason: "" }) });
    expect(emptyReasonRes.status).toBe(400);

    const rejectRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/reject`, {
      method: "POST",
      headers: authHeaders(tokenKarim, orgAId),
      body: JSON.stringify({ reason: "Pièce financière manquante." }),
    });
    expect(rejectRes.status).toBe(200);
    const rejected = (await rejectRes.json()) as { status: string; comment: string };
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.comment).toBe("Pièce financière manquante.");

    await waitForNotification(async () => {
      const rows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: ownerAUserId, type: "WORKSPACE_APPROVAL_REJECTED" } });
      return rows.some((n) => n.targetUrl?.includes(approval.id));
    });

    const secondDecisionRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) });
    expect(secondDecisionRes.status).toBe(409);
  });

  it("BLOQUANT — mission §82/§83: authority downgraded between request and decision blocks approval, even for the exact designated reviewer", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const assignment = await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId },
    });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { versionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED" });
    const requestRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: versionId, reviewerId: karimUserId }),
    });
    const approval = (await requestRes.json()) as { id: string };

    // Downgrade CLIENT_MANAGER -> CONTRIBUTOR : garde ReadWorkspace/ManageWorkspace (le premier
    // palier de `ApproveApprovalUseCase` passe toujours) mais PERD ValidateResponsePackage — preuve
    // ciblée que le correctif Sprint 18 revérifie l'autorité PRÉCISE en direct, pas seulement
    // l'accès de base.
    await prisma.clientAssignment.update({ where: { id: assignment.id }, data: { role: "CONTRIBUTOR" } });

    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) });
    expect(approveRes.status).toBe(403);
    expect(((await approveRes.json()) as { error: { code: string } }).error.code).toBe("APPROVAL_REVIEWER_NOT_AUTHORIZED");

    // Preuve complémentaire : un accès entièrement révoqué (aucune affectation) retombe sur la
    // convention anti-énumération 404 déjà établie (ReadWorkspace lui-même échoue), jamais 403.
    await prisma.clientAssignment.delete({ where: { id: assignment.id } });
    const noAccessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) });
    expect(noAccessRes.status).toBe(404);
  });

  it("mass assignment: forged status/requestedBy/id fields in the request body have no effect — the backend is the source of truth", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { versionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED" });

    const forgedRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        entityType: "RESPONSE_PACKAGE_VERSION",
        entityId: versionId,
        reviewerId: karimUserId,
        // Champs forgés — aucun n'existe dans RequestApprovalBodySchema, donc silencieusement
        // dépouillés par Zod avant que le contrôleur ne construise la commande explicitement.
        status: "APPROVED",
        id: randomUUID(),
        organizationId: orgBId,
        requestedBy: karimUserId,
        approvedAt: new Date().toISOString(),
      }),
    });
    expect(forgedRes.status).toBe(201);
    const approval = (await forgedRes.json()) as { status: string; organizationId?: string };
    expect(approval.status).toBe("PENDING");

    const stored = await prisma.approvalRequest.findFirst({ where: { entityId: versionId, organizationId: orgAId } });
    expect(stored?.requestedBy).toBe(ownerAUserId);
    expect(stored?.organizationId).toBe(orgAId);
  });

  it("cross-tenant: organization B cannot request an approval on organization A's RESPONSE_PACKAGE_VERSION (404, never leaking existence)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const { versionId } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED" });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: versionId, reviewerId: ownerBUserId }),
    });
    expect(res.status).toBe(404);
  });

  it("mission §116 version pinning: approving version V1 never affects a LATER version V2 of the same package", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CLIENT_MANAGER", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: ownerAUserId, role: "TENDER_MANAGER" }) });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "REVIEWER" }) });

    const { responsePackageId, versionId: v1Id } = await createResponsePackageVersion({ organizationId: orgAId, tenderId, clientAccountId, userId: ownerAUserId, status: "VALIDATED", versionNumber: 1 });

    const requestRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "RESPONSE_PACKAGE_VERSION", entityId: v1Id, reviewerId: karimUserId }),
    });
    const approval = (await requestRes.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals/${approval.id}/approve`, { method: "POST", headers: authHeaders(tokenKarim, orgAId), body: JSON.stringify({}) });

    // V2 créée APRÈS l'approbation de V1 — jamais héritée (mission §38/§39 "stale approval").
    const v2 = await prisma.responsePackageVersion.create({
      data: { id: randomUUID(), organizationId: orgAId, responsePackageId, versionNumber: 2, status: "DRAFT", createdBy: ownerAUserId },
    });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/approvals`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const approvals = (await listRes.json()) as { id: string; entityId: string; status: string }[];
    const pinned = approvals.find((a) => a.id === approval.id);
    expect(pinned?.entityId).toBe(v1Id);
    expect(pinned?.entityId).not.toBe(v2.id);
    expect(pinned?.status).toBe("APPROVED");
  });

  it("mission §7: a comment can target a LOT, scoped to the same Tender", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const lot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "1", title: "Lot 1 — Travaux" } });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "LOT", entityId: lot.id, body: "Question sur le périmètre du lot." }),
    });
    expect(res.status).toBe(201);
    const comment = (await res.json()) as { entityType: string; entityId: string };
    expect(comment.entityType).toBe("LOT");
    expect(comment.entityId).toBe(lot.id);

    // Un lot d'un AUTRE Tender est refusé (même discipline que Task/ChecklistItem, mission §20).
    const otherTender = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const crossLotRes = await fetch(`${baseUrl}/api/v1/tenders/${otherTender.tenderId}/comments`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ entityType: "LOT", entityId: lot.id, body: "x" }),
    });
    expect(crossLotRes.status).toBe(404);
  });

  it("mission §21/§110 task assignment notification: assigning a task creates a real Notification row for the assignee", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: karimUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/participants`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ userId: karimUserId, role: "TECHNICAL_WRITER" }) });

    const taskRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/tasks`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Fournir le mémoire technique", assigneeId: karimUserId }),
    });
    expect(taskRes.status).toBe(201);

    // `tenderId` est frais (créé au début de ce test) — suffisant pour désambiguïser sans dépendre
    // de la forme exacte du JSON `metadata` stocké.
    await waitForNotification(async () => {
      const rows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: karimUserId, type: "WORKSPACE_TASK_ASSIGNED" } });
      return rows.some((n) => n.targetUrl?.includes(tenderId));
    });
  });
});
