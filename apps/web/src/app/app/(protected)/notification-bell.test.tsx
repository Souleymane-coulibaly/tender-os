import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./notification-bell";
import type { NotificationSummary } from "../../../lib/market-watch-types";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

const markNotificationReadAction = vi.fn(async (_notificationId: string) => ({}));
const markAllNotificationsReadAction = vi.fn(async () => ({}));
const fetchUnreadNotificationCount = vi.fn(async () => 0);
const fetchNotifications = vi.fn(async () => ({ items: [] as NotificationSummary[], nextCursor: null }));

vi.mock("../notifications-actions", () => ({
  markNotificationReadAction: (notificationId: string) => markNotificationReadAction(notificationId),
  markAllNotificationsReadAction: () => markAllNotificationsReadAction(),
  fetchUnreadNotificationCount: () => fetchUnreadNotificationCount(),
  fetchNotifications: () => fetchNotifications(),
}));

function buildNotification(overrides: Partial<NotificationSummary> = {}): NotificationSummary {
  return { id: "n-1", type: "WORKSPACE_MENTION", title: "Ahmed vous a mentionné", createdAt: new Date().toISOString(), ...overrides };
}

describe("NotificationBell", () => {
  it("BLOQUANT — shows no badge when there are zero unread notifications", () => {
    render(<NotificationBell initialNotifications={[]} initialUnreadCount={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("BLOQUANT — shows a real unread badge, capped at 99+", () => {
    render(<NotificationBell initialNotifications={[]} initialUnreadCount={150} />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("opens the dropdown and lists recent notifications on click", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialNotifications={[buildNotification()]} initialUnreadCount={1} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Ahmed vous a mentionné")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir toutes les notifications" })).toHaveAttribute("href", "/app/notifications");
  });

  it("BLOQUANT — clicking an unread notification marks it read and navigates to its targetUrl", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialNotifications={[buildNotification({ targetUrl: "/app/market-watch/ext-1" })]} initialUnreadCount={1} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(screen.getByText("Ahmed vous a mentionné"));

    await waitFor(() => expect(markNotificationReadAction).toHaveBeenCalledWith("n-1"));
    expect(pushMock).toHaveBeenCalledWith("/app/market-watch/ext-1");
  });

  it("BLOQUANT — mark-all-read is only offered when something is unread, and triggers the backend action", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialNotifications={[buildNotification()]} initialUnreadCount={1} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("Tout marquer lu")).toBeInTheDocument();

    await user.click(screen.getByText("Tout marquer lu"));
    await waitFor(() => expect(markAllNotificationsReadAction).toHaveBeenCalled());
  });

  it("never offers mark-all-read when there is nothing unread", async () => {
    const user = userEvent.setup();
    render(<NotificationBell initialNotifications={[buildNotification({ readAt: new Date().toISOString() })]} initialUnreadCount={0} />);

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.queryByText("Tout marquer lu")).not.toBeInTheDocument();
  });
});
