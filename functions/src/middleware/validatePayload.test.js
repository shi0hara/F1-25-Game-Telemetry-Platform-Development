import { describe, it, expect } from "vitest";
import { validateGenerationPayload } from "./validatePayload.js";

describe("validateGenerationPayload", () => {
  const validBody = {
    base64Photo: "data:image/jpeg;base64,/9j/4AAQ...",
    teamKey: "ferrari",
    teamColours: {
      primary: "#E10600",
      secondary: "#FFFFFF",
      accent: "#FFEB3B",
    },
  };

  it("returns valid: true for a complete valid payload", () => {
    const result = validateGenerationPayload(validBody);
    expect(result).toEqual({ valid: true });
  });

  it("reports missing base64Photo when undefined", () => {
    const body = { ...validBody, base64Photo: undefined };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("base64Photo");
  });

  it("reports missing base64Photo when empty string", () => {
    const body = { ...validBody, base64Photo: "   " };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("base64Photo");
  });

  it("reports missing teamKey when null", () => {
    const body = { ...validBody, teamKey: null };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("teamKey");
  });

  it("reports missing teamKey when not a string", () => {
    const body = { ...validBody, teamKey: 123 };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("teamKey");
  });

  it("reports all three colour fields when teamColours is undefined", () => {
    const body = { ...validBody, teamColours: undefined };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("teamColours.primary");
    expect(result.fields).toContain("teamColours.secondary");
    expect(result.fields).toContain("teamColours.accent");
  });

  it("reports all three colour fields when teamColours is null", () => {
    const body = { ...validBody, teamColours: null };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("teamColours.primary");
    expect(result.fields).toContain("teamColours.secondary");
    expect(result.fields).toContain("teamColours.accent");
  });

  it("reports all three colour fields when teamColours is not an object", () => {
    const body = { ...validBody, teamColours: "red" };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).toContain("teamColours.primary");
    expect(result.fields).toContain("teamColours.secondary");
    expect(result.fields).toContain("teamColours.accent");
  });

  it("reports individual missing colour fields", () => {
    const body = {
      ...validBody,
      teamColours: { primary: "#E10600", secondary: "", accent: null },
    };
    const result = validateGenerationPayload(body);
    expect(result.valid).toBe(false);
    expect(result.fields).not.toContain("teamColours.primary");
    expect(result.fields).toContain("teamColours.secondary");
    expect(result.fields).toContain("teamColours.accent");
  });

  it("reports all missing fields at once", () => {
    const result = validateGenerationPayload({});
    expect(result.valid).toBe(false);
    expect(result.fields).toEqual([
      "base64Photo",
      "teamKey",
      "teamColours.primary",
      "teamColours.secondary",
      "teamColours.accent",
    ]);
  });

  it("handles body being undefined gracefully", () => {
    const result = validateGenerationPayload(undefined);
    expect(result.valid).toBe(false);
    expect(result.fields.length).toBe(5);
  });

  it("handles body being null gracefully", () => {
    const result = validateGenerationPayload(null);
    expect(result.valid).toBe(false);
    expect(result.fields.length).toBe(5);
  });
});
