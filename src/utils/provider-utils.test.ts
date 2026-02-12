import { describe, expect, it } from "vitest";
import { isReasoningTagProvider } from "./provider-utils.js";

describe("isReasoningTagProvider", () => {
  it("should return false for null, undefined, or empty provider", () => {
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider(undefined)).toBe(false);
    expect(isReasoningTagProvider("")).toBe(false);
    expect(isReasoningTagProvider("   ")).toBe(false);
  });

  it("should return true for exact matches of known reasoning providers", () => {
    expect(isReasoningTagProvider("ollama")).toBe(true);
    expect(isReasoningTagProvider("google-gemini-cli")).toBe(true);
    expect(isReasoningTagProvider("google-generative-ai")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(isReasoningTagProvider("Ollama")).toBe(true);
    expect(isReasoningTagProvider("GOOGLE-GEMINI-CLI")).toBe(true);
    expect(isReasoningTagProvider("Google-Generative-AI")).toBe(true);
  });

  it("should return true for providers containing 'google-antigravity'", () => {
    expect(isReasoningTagProvider("google-antigravity")).toBe(true);
    expect(isReasoningTagProvider("google-antigravity/gemini-3")).toBe(true);
    expect(isReasoningTagProvider("some-google-antigravity-suffix")).toBe(true);
  });

  it("should return true for providers containing 'minimax'", () => {
    expect(isReasoningTagProvider("minimax")).toBe(true);
    expect(isReasoningTagProvider("minimax/abab6.5")).toBe(true);
    expect(isReasoningTagProvider("Minimax-M2.1")).toBe(true);
  });

  it("should return false for unknown providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("some-random-provider")).toBe(false);
  });
});
