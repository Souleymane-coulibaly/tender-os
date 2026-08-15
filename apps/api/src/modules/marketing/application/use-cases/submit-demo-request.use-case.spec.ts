import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage, EmailProvider } from "../../../../shared-kernel/email-provider";
import { SubmitDemoRequestUseCase } from "./submit-demo-request.use-case";

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

describe("SubmitDemoRequestUseCase", () => {
  let emailProvider: FakeEmailProvider;
  let useCase: SubmitDemoRequestUseCase;
  const originalNotifyEmail = process.env.DEMO_REQUEST_NOTIFY_EMAIL;

  beforeEach(() => {
    emailProvider = new FakeEmailProvider();
    useCase = new SubmitDemoRequestUseCase(emailProvider);
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = "sales@tenderos.fr";
  });

  afterEach(() => {
    process.env.DEMO_REQUEST_NOTIFY_EMAIL = originalNotifyEmail;
  });

  it("sends an email with the submitted fields to the configured destination", async () => {
    await useCase.execute({ name: "Marie Dupont", email: "marie@example.com", company: "ACME BTP", phone: "0600000000", message: "Intéressée par une démo." });

    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]?.to).toBe("sales@tenderos.fr");
    expect(emailProvider.sent[0]?.html).toContain("Marie Dupont");
    expect(emailProvider.sent[0]?.html).toContain("ACME BTP");
  });

  it("V2 Sprint 23 (landing, anti-spam) — a filled honeypot silently no-ops, never sends an email", async () => {
    await useCase.execute({ name: "Bot", email: "bot@example.com", company: "Spam Inc", honeypot: "http://spam.example" });

    expect(emailProvider.sent).toHaveLength(0);
  });

  it("escapes HTML in submitted fields (never inject raw markup into the notification email)", async () => {
    await useCase.execute({ name: "<script>alert(1)</script>", email: "x@example.com", company: "Acme" });

    expect(emailProvider.sent[0]?.html).not.toContain("<script>");
    expect(emailProvider.sent[0]?.html).toContain("&lt;script&gt;");
  });
});
