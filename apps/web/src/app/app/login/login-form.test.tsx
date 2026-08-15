import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

vi.mock("../actions", () => ({
  loginAction: vi.fn(async (_prevState: unknown, _formData: FormData) => ({
    error: "Identifiants invalides.",
  })),
}));

describe("LoginForm", () => {
  it("renders email and password fields and a submit button", () => {
    render(<LoginForm returnTo="" createAccountHref="/onboarding" />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });

  it("displays the error returned by the action after submission", async () => {
    const user = userEvent.setup();
    render(<LoginForm returnTo="" createAccountHref="/onboarding" />);

    await user.type(screen.getByLabelText("Email"), "wrong@example.com");
    await user.type(screen.getByLabelText("Mot de passe"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Identifiants invalides.");
  });

  it("V2 Sprint 24 (refonte /app/login) — links 'Créer un compte' to /onboarding, preserving plan/billing/offer", () => {
    render(<LoginForm returnTo="" createAccountHref="/onboarding?plan=STARTER&billing=MONTHLY" />);

    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute("href", "/onboarding?plan=STARTER&billing=MONTHLY");
  });

  it("V2 Sprint 24 (refonte /app/login) — real link to /app/forgot-password, never a dead link", () => {
    render(<LoginForm returnTo="" createAccountHref="/onboarding" />);

    expect(screen.getByRole("link", { name: "Mot de passe oublié ?" })).toHaveAttribute("href", "/app/forgot-password");
  });
});
