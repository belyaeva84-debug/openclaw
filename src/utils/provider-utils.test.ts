import { describe, expect, it } from "vitest";
import { isReasoningTagProvider } from "./provider-utils.js";

describe("isReasoningTagProvider", () => {
  it("returns false for empty or null providers", () => {
    expect(isReasoningTagProvider(undefined)).toBe(false);
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider("")).toBe(false);
    expect(isReasoningTagProvider("   ")).toBe(false);
  });

  it("returns true for exact matches", () => {
    expect(isReasoningTagProvider("ollama")).toBe(true);
    expect(isReasoningTagProvider("google-gemini-cli")).toBe(true);
    expect(isReasoningTagProvider("google-generative-ai")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isReasoningTagProvider("OLLAMA")).toBe(true);
    expect(isReasoningTagProvider("Google-Gemini-CLI")).toBe(true);
    expect(isReasoningTagProvider("Google-Generative-AI")).toBe(true);
    expect(isReasoningTagProvider("MiNiMaX")).toBe(true);
  });

  it("returns true for providers containing 'google-antigravity'", () => {
    expect(isReasoningTagProvider("google-antigravity")).toBe(true);
    expect(isReasoningTagProvider("google-antigravity/gemini-3")).toBe(true);
    expect(isReasoningTagProvider("prefix-google-antigravity-suffix")).toBe(true);
  });

  it("returns true for providers containing 'minimax'", () => {
    expect(isReasoningTagProvider("minimax")).toBe(true);
    expect(isReasoningTagProvider("minimax-m2.1")).toBe(true);
    expect(isReasoningTagProvider("some-minimax-model")).toBe(true);
  });

  it("returns false for non-matching providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("google")).toBe(false); // Only specific google providers match
    expect(isReasoningTagProvider("gemini")).toBe(false); // Only specific gemini providers match
    expect(isReasoningTagProvider("random-provider")).toBe(false);
  });
});
