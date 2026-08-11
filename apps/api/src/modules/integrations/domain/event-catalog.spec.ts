import { describe, expect, it } from "vitest";
import { extractClientAccountIdHint, extractTenderIdHint, isGovernedWebhookEventType, resolvePublicEventType } from "./event-catalog";

describe("resolvePublicEventType", () => {
  it("maps existing internal PascalCase outbox event types to the public dot-notation catalog", () => {
    expect(resolvePublicEventType("TenderCreated", { tenderId: "t1", clientAccountId: "c1" })).toBe("tender.created");
    expect(resolvePublicEventType("TaskCreated", { tenderId: "t1", title: "x" })).toBe("task.created");
    expect(resolvePublicEventType("TaskCompleted", { tenderId: "t1" })).toBe("task.completed");
  });

  it("disambiguates GoNoGoDecisionRecorded by payload.decision", () => {
    expect(resolvePublicEventType("GoNoGoDecisionRecorded", { decision: "GO" })).toBe("opportunity.go_decided");
    expect(resolvePublicEventType("GoNoGoDecisionRecorded", { decision: "GO_CONDITIONAL" })).toBe("opportunity.go_decided");
    expect(resolvePublicEventType("GoNoGoDecisionRecorded", { decision: "NO_GO" })).toBe("opportunity.no_go_decided");
  });

  it("passes through the new dot-notation producers unchanged", () => {
    expect(resolvePublicEventType("response_package.validated", {})).toBe("response_package.validated");
    expect(resolvePublicEventType("response_package.generated", {})).toBe("response_package.generated");
  });

  it("returns undefined for internal-only events with no public equivalent (mission §26 data minimization)", () => {
    expect(resolvePublicEventType("AiSuggestionAccepted", {})).toBeUndefined();
    expect(resolvePublicEventType("DocumentGenerationCompleted", {})).toBeUndefined();
  });
});

describe("isGovernedWebhookEventType", () => {
  it("accepts only catalog entries, never an arbitrary string (mission §21)", () => {
    expect(isGovernedWebhookEventType("tender.created")).toBe(true);
    expect(isGovernedWebhookEventType("literally.anything")).toBe(false);
  });
});

describe("payload hint extraction", () => {
  it("extracts clientAccountId when present", () => {
    expect(extractClientAccountIdHint({ clientAccountId: "c1" })).toBe("c1");
    expect(extractClientAccountIdHint({})).toBeUndefined();
    expect(extractClientAccountIdHint(null)).toBeUndefined();
  });

  it("extracts tenderId as a fallback hint", () => {
    expect(extractTenderIdHint({ tenderId: "t1" })).toBe("t1");
    expect(extractTenderIdHint("not-an-object")).toBeUndefined();
  });
});
