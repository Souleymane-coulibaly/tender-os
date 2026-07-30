import { describe, expect, it } from "vitest";
import { AiSchemaValidationFailedError } from "../../domain/errors";
import { parseAnalysisOutput } from "./analysis-output.schema";

describe("parseAnalysisOutput", () => {
  it("accepts a valid technical output", () => {
    const parsed = parseAnalysisOutput('{"output":{"summary":"pipeline ok"}}');
    expect(parsed.output.summary).toBe("pipeline ok");
  });

  it("rejects content that is not valid JSON", () => {
    expect(() => parseAnalysisOutput("not json")).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects JSON that does not match the schema", () => {
    expect(() => parseAnalysisOutput('{"foo":"bar"}')).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an empty summary", () => {
    expect(() => parseAnalysisOutput('{"output":{"summary":""}}')).toThrow(AiSchemaValidationFailedError);
  });
});
