import { describe, expect, it } from "vitest";
import { isReasoningTagProvider } from "./provider-utils";

describe("isReasoningTagProvider", () => {
  it("should return false for null, undefined, or empty string", () => {
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider(undefined)).toBe(false);
    expect(isReasoningTagProvider("")).toBe(false);
    expect(isReasoningTagProvider("   ")).toBe(false);
  });

  it("should return true for exact matches of known providers", () => {
    expect(isReasoningTagProvider("ollama")).toBe(true);
    expect(isReasoningTagProvider("google-gemini-cli")).toBe(true);
    expect(isReasoningTagProvider("google-generative-ai")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(isReasoningTagProvider("Ollama")).toBe(true);
    expect(isReasoningTagProvider("GOOGLE-GEMINI-CLI")).toBe(true);
    expect(isReasoningTagProvider("GoOgLe-GeNeRaTiVe-Ai")).toBe(true);
  });

  it("should return true for providers containing 'google-antigravity'", () => {
    expect(isReasoningTagProvider("google-antigravity")).toBe(true);
    expect(isReasoningTagProvider("google-antigravity/gemini-3")).toBe(true);
    expect(isReasoningTagProvider("google-antigravity-plus")).toBe(true);
  });

  it("should return true for providers containing 'minimax'", () => {
    expect(isReasoningTagProvider("minimax")).toBe(true);
    expect(isReasoningTagProvider("minimax-m2.1")).toBe(true);
    expect(isReasoningTagProvider("some-minimax-model")).toBe(true);
  });

  it("should return false for other providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("vertex")).toBe(false); // Unless it includes google-antigravity or minimax
    expect(isReasoningTagProvider("random-provider")).toBe(false);
  });
});
