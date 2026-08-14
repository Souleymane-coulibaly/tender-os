import { describe, expect, it, vi } from "vitest";
import type { OutboxEventToDispatch } from "../../../outbox";
import {
  ChatMessageSentQuotaCheckOutboxHandler,
  DocumentVersionAddedQuotaCheckOutboxHandler,
  MembershipCreatedQuotaCheckOutboxHandler,
  SubscriptionPlanChangedQuotaRecheckOutboxHandler,
} from "./quota-threshold-event.outbox-handlers";

function fakeEvent(overrides: Partial<OutboxEventToDispatch> = {}): OutboxEventToDispatch {
  return {
    id: "event-1",
    organizationId: "org-1",
    eventType: "Test",
    eventVersion: 1,
    aggregateType: "Test",
    aggregateId: "aggregate-1",
    payload: {},
    occurredAt: new Date("2026-08-14T10:00:00Z"),
    correlationId: null,
    ...overrides,
  };
}

describe("MembershipCreatedQuotaCheckOutboxHandler", () => {
  it("recounts active members and forwards them to CheckQuotaThresholdUseCase as USERS_MAX", async () => {
    const countActiveMembersUseCase = { execute: vi.fn(async () => 7) };
    const checkQuotaThresholdUseCase = { execute: vi.fn(async () => {}) };
    const handler = new MembershipCreatedQuotaCheckOutboxHandler(countActiveMembersUseCase as never, checkQuotaThresholdUseCase as never);

    await handler.handle(fakeEvent({ eventType: "MembershipCreated" }));

    expect(countActiveMembersUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "USERS_MAX", used: 7, now: new Date("2026-08-14T10:00:00Z") });
  });
});

describe("ChatMessageSentQuotaCheckOutboxHandler", () => {
  it("recounts today's Chat IA usage (from the start of the event's day) and forwards it as CHAT_AI_DAILY_MAX", async () => {
    const countTodayChatUsageForOrganizationUseCase = { execute: vi.fn(async () => 3) };
    const checkQuotaThresholdUseCase = { execute: vi.fn(async () => {}) };
    const handler = new ChatMessageSentQuotaCheckOutboxHandler(countTodayChatUsageForOrganizationUseCase as never, checkQuotaThresholdUseCase as never);

    await handler.handle(fakeEvent({ eventType: "ChatMessageSent", occurredAt: new Date("2026-08-14T15:30:00Z") }));

    expect(countTodayChatUsageForOrganizationUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", since: new Date("2026-08-14T00:00:00.000Z") });
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 3, now: new Date("2026-08-14T15:30:00Z") });
  });
});

describe("DocumentVersionAddedQuotaCheckOutboxHandler", () => {
  it("converts raw bytes to Go before forwarding as STORAGE_GB_MAX (jamais des octets bruts)", async () => {
    const getOrganizationStorageUsageUseCase = { execute: vi.fn(async () => 5 * 1024 * 1024 * 1024) };
    const checkQuotaThresholdUseCase = { execute: vi.fn(async () => {}) };
    const handler = new DocumentVersionAddedQuotaCheckOutboxHandler(getOrganizationStorageUsageUseCase as never, checkQuotaThresholdUseCase as never);

    await handler.handle(fakeEvent({ eventType: "DocumentVersionAdded" }));

    expect(getOrganizationStorageUsageUseCase.execute).toHaveBeenCalledWith("org-1");
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "STORAGE_GB_MAX", used: 5, now: new Date("2026-08-14T10:00:00Z") });
  });
});

describe("SubscriptionPlanChangedQuotaRecheckOutboxHandler", () => {
  it("re-checks all 3 quota dimensions (a plan change moves the LIMIT, never the usage itself)", async () => {
    const countActiveMembersUseCase = { execute: vi.fn(async () => 12) };
    const countTodayChatUsageForOrganizationUseCase = { execute: vi.fn(async () => 4) };
    const getOrganizationStorageUsageUseCase = { execute: vi.fn(async () => 2 * 1024 * 1024 * 1024) };
    const checkQuotaThresholdUseCase = { execute: vi.fn(async () => {}) };
    const handler = new SubscriptionPlanChangedQuotaRecheckOutboxHandler(
      countActiveMembersUseCase as never,
      countTodayChatUsageForOrganizationUseCase as never,
      getOrganizationStorageUsageUseCase as never,
      checkQuotaThresholdUseCase as never,
    );

    await handler.handle(fakeEvent({ eventType: "SubscriptionPlanChangedQuotaRecheck" }));

    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledTimes(3);
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "USERS_MAX", used: 12, now: new Date("2026-08-14T10:00:00Z") });
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 4, now: new Date("2026-08-14T10:00:00Z") });
    expect(checkQuotaThresholdUseCase.execute).toHaveBeenCalledWith({ organizationId: "org-1", quotaType: "STORAGE_GB_MAX", used: 2, now: new Date("2026-08-14T10:00:00Z") });
  });
});
