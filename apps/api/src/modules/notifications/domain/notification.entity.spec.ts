import { describe, expect, it } from "vitest";
import { Notification } from "./notification.entity";

const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("Notification — mission §37/§38", () => {
  it("starts unread", () => {
    const notification = Notification.create({ id: "n-1", organizationId: "org-1", userId: "user-1", type: "SAVED_SEARCH_MATCH", title: "Nouveau marché", occurredAt: NOW });
    expect(notification.isRead).toBe(false);
    expect(notification.readAt).toBeUndefined();
  });

  it("markRead sets readAt and isRead", () => {
    const notification = Notification.create({ id: "n-1", organizationId: "org-1", userId: "user-1", type: "SAVED_SEARCH_MATCH", title: "Nouveau marché", occurredAt: NOW });
    notification.markRead(NOW);
    expect(notification.isRead).toBe(true);
    expect(notification.readAt).toEqual(NOW);
  });
});
