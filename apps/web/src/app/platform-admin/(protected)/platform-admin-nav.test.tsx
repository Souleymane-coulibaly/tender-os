import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformAdminNav } from "./platform-admin-nav";

let pathname = "/platform-admin";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

function current(): string[] {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent ?? "");
}

describe("PlatformAdminNav", () => {
  beforeEach(() => {
    pathname = "/platform-admin";
  });

  it("affiche les quatre rubriques du back-office", () => {
    render(<PlatformAdminNav />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/platform-admin",
      "/platform-admin/organizations",
      "/platform-admin/users",
      "/platform-admin/audit-logs",
    ]);
  });

  it("le tableau de bord n'est actif que sur lui-même", () => {
    render(<PlatformAdminNav />);
    expect(current()).toEqual(["Tableau de bord"]);
  });

  it("une fiche organisation active la rubrique « Organisations », et elle seule", () => {
    pathname = "/platform-admin/organizations/0b6e0a4e-1c1f-4c55-9d0a-1f7a2a7c9e11";
    render(<PlatformAdminNav />);
    expect(current()).toEqual(["Organisations"]);
  });

  it("une page hors navigation n'active aucune rubrique", () => {
    pathname = "/platform-admin/login";
    render(<PlatformAdminNav />);
    expect(current()).toEqual([]);
  });
});
