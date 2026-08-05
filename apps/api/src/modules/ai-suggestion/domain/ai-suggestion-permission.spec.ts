import { describe, expect, it } from "vitest";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "./ai-suggestion-permission";

describe("roleHasAiSuggestionPermission", () => {
  it.each(["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"])("allows %s to read and decide", (role) => {
    expect(roleHasAiSuggestionPermission(role, AiSuggestionPermission.Read)).toBe(true);
    expect(roleHasAiSuggestionPermission(role, AiSuggestionPermission.Decide)).toBe(true);
  });

  it.each(["REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"])("allows %s to read but never decide", (role) => {
    expect(roleHasAiSuggestionPermission(role, AiSuggestionPermission.Read)).toBe(true);
    expect(roleHasAiSuggestionPermission(role, AiSuggestionPermission.Decide)).toBe(false);
  });

  it("denies an unknown role by default (fail closed)", () => {
    expect(roleHasAiSuggestionPermission("SOMETHING_UNEXPECTED", AiSuggestionPermission.Read)).toBe(false);
  });
});
