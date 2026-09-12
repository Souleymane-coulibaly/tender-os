import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";

/**
 * TENDEROS-2.1 (guides de page) — preuve bout-en-bout de `GET /auth/me/page-guides` et
 * `POST /auth/me/page-guides/:guideKey`, réel HTTP + PostgreSQL : contrat JSON exact (dates absentes
 * omises), validation 400, 401 sans jeton, et isolation stricte entre utilisateurs.
 * Deux comptes seulement (4 appels register/login) : bien sous le seau "auth" partagé (10/60 s).
 */
describe("Identity — page guides, real HTTP + PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  const userIds: string[] = [];

  let userIdA: string;
  let tokenA: string;
  let tokenB: string;

  type Item = { guideKey: string; completedAt?: string; dismissedAt?: string };

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Page Guides HTTP Test", termsAccepted: true }),
    });
    expect(registerRes.status).toBe(201);
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(loginRes.status).toBe(200);
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  function headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  function record(token: string, guideKey: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/auth/me/page-guides/${guideKey}`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(body),
    });
  }

  async function list(token: string): Promise<Item[]> {
    const res = await fetch(`${baseUrl}/api/v1/auth/me/page-guides`, { headers: headers(token) });
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: Item[] }).items;
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

    const a = await registerAndLogin(`page-guides-a-${randomUUID()}@smoke.test`);
    const b = await registerAndLogin(`page-guides-b-${randomUUID()}@smoke.test`);
    userIds.push(a.userId, b.userId);
    userIdA = a.userId;
    tokenA = a.token;
    tokenB = b.token;
  }, 60000);

  afterAll(async () => {
    await prisma.userPageGuideState.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  }, 30000);

  it("returns an empty list before any interaction", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/me/page-guides`, { headers: headers(tokenA) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  it("COMPLETE returns 200 with the item, absent dismissedAt omitted (never null)", async () => {
    const res = await record(tokenA, "tenders", { action: "COMPLETE" });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["completedAt", "guideKey"]);
    expect(body.guideKey).toBe("tenders");
    expect(new Date(body.completedAt as string).toISOString()).toBe(body.completedAt);
  });

  it("DISMISS after COMPLETE keeps completedAt and adds dismissedAt; repeating is idempotent", async () => {
    const [before] = await list(tokenA);

    const first = await record(tokenA, "tenders", { action: "DISMISS" });
    const second = await record(tokenA, "tenders", { action: "DISMISS" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const body = (await second.json()) as Item;
    expect(body.completedAt).toBe(before?.completedAt);
    expect(body.dismissedAt).toBeDefined();
    expect(await list(tokenA)).toEqual([body]);
    expect(await prisma.userPageGuideState.count({ where: { userId: userIdA } })).toBe(1);
  });

  it("accepts any well-formed key (no closed list) and lists them in key order", async () => {
    const res = await record(tokenA, "a-brand-new-screen-2", { action: "DISMISS" });
    expect(res.status).toBe(200);

    const items = await list(tokenA);
    expect(items.map((item) => item.guideKey)).toEqual(["a-brand-new-screen-2", "tenders"]);
    expect(items[0]).not.toHaveProperty("completedAt");
  });

  it("isolates users: B never sees A's rows, and B's actions never touch A's", async () => {
    expect(await list(tokenB)).toEqual([]);

    const res = await record(tokenB, "tenders", { action: "COMPLETE" });
    expect(res.status).toBe(200);

    const itemsB = await list(tokenB);
    expect(itemsB).toHaveLength(1);
    expect(itemsB[0]).not.toHaveProperty("dismissedAt");

    const itemsA = await list(tokenA);
    expect(itemsA.map((item) => item.guideKey)).toEqual(["a-brand-new-screen-2", "tenders"]);
    expect(itemsA.find((item) => item.guideKey === "tenders")?.completedAt).not.toBe(itemsB[0]?.completedAt);
  });

  it.each([
    ["uppercase", "Tenders"],
    ["underscore", "tender_detail"],
    ["too long (65)", "x".repeat(65)],
    ["encoded slash", "tender%2Fdetail"],
  ])("rejects an invalid guide key (%s) with 400 VALIDATION_FAILED", async (_label, guideKey) => {
    const res = await record(tokenA, guideKey, { action: "COMPLETE" });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it.each([
    ["unknown action", { action: "START" }],
    ["missing action", {}],
    ["extra field", { action: "COMPLETE", userId: randomUUID() }],
  ])("rejects an invalid body (%s) with 400 VALIDATION_FAILED", async (_label, body) => {
    const res = await record(tokenA, "tenders", body);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects unauthenticated calls with 401", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/auth/me/page-guides`);
    const recordRes = await fetch(`${baseUrl}/api/v1/auth/me/page-guides/tenders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "COMPLETE" }),
    });
    const badTokenRes = await fetch(`${baseUrl}/api/v1/auth/me/page-guides`, { headers: headers("not-a-token") });

    expect(listRes.status).toBe(401);
    expect(recordRes.status).toBe(401);
    expect(badTokenRes.status).toBe(401);
  });
});
