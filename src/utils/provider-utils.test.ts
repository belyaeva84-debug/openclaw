import { describe, expect, it } from "vitest";
import { isReasoningTagProvider } from "./provider-utils.js";

describe("isReasoningTagProvider", () => {
  it.each([
    [undefined],
    [null],
    [""],
    ["   "],
  ])("returns false for empty or null providers (%s)", (provider) => {
    expect(isReasoningTagProvider(provider)).toBe(false);
  });

  describe("exact match providers", () => {
    it.each([
      ["ollama"],
      ["Ollama"],
      ["OLLAMA"],
      ["google-gemini-cli"],
      ["GOOGLE-GEMINI-CLI"],
      ["google-generative-ai"],
      ["GOOGLE-GENERATIVE-AI"],
    ])("returns true for %s", (provider) => {
      expect(isReasoningTagProvider(provider)).toBe(true);
    });
  });

  describe("partial match providers", () => {
    it.each([
      ["google-antigravity"],
      ["google-antigravity/gemini-3"],
      ["GOOGLE-ANTIGRAVITY"],
      ["some-google-antigravity-suffix"],
      ["minimax"],
      ["minimax/abab6.5"],
      ["MiniMax"],
      ["Minimax-M2.1"],
    ])("returns true for providers containing %s", (provider) => {
      expect(isReasoningTagProvider(provider)).toBe(true);
    });
  });

  it.each([
    ["openai"],
    ["anthropic"],
    ["some-random-provider"],
    ["azure-openai"],
    ["mistral"],
    ["vertex"],
    ["google"],
    ["gemini"],
  ])("returns false for unknown providers (%s)", (provider) => {
    expect(isReasoningTagProvider(provider)).toBe(false);
  });
});
