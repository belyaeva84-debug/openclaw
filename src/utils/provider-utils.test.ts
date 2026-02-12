import { describe, expect, it } from "vitest";
import { isReasoningTagProvider } from "./provider-utils";
import { isReasoningTagProvider } from "./provider-utils.js";

describe("isReasoningTagProvider", () => {
  it("should return false for null, undefined, or empty provider", () => {
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider(undefined)).toBe(false);
import { isReasoningTagProvider } from "./provider-utils";

describe("isReasoningTagProvider", () => {
  it("should return false for null, undefined, or empty string", () => {
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider(undefined)).toBe(false);
import { isReasoningTagProvider } from "./provider-utils.js";

describe("isReasoningTagProvider", () => {
  it("returns false for empty or null providers", () => {
    expect(isReasoningTagProvider(undefined)).toBe(false);
    expect(isReasoningTagProvider(null)).toBe(false);
    expect(isReasoningTagProvider("")).toBe(false);
    expect(isReasoningTagProvider("   ")).toBe(false);
  });

  it("should return true for known reasoning providers (case-insensitive)", () => {
    expect(isReasoningTagProvider("ollama")).toBe(true);
    expect(isReasoningTagProvider("Ollama")).toBe(true);
    expect(isReasoningTagProvider("google-gemini-cli")).toBe(true);
    expect(isReasoningTagProvider("GOOGLE-GEMINI-CLI")).toBe(true);
    expect(isReasoningTagProvider("google-generative-ai")).toBe(true);
  it("should return true for exact matches of known reasoning providers", () => {
  it("should return true for exact matches of known providers", () => {
  it("returns true for exact matches", () => {
    expect(isReasoningTagProvider("ollama")).toBe(true);
    expect(isReasoningTagProvider("google-gemini-cli")).toBe(true);
    expect(isReasoningTagProvider("google-generative-ai")).toBe(true);
  });

  it("should be case-insensitive", () => {
    expect(isReasoningTagProvider("Ollama")).toBe(true);
    expect(isReasoningTagProvider("GOOGLE-GEMINI-CLI")).toBe(true);
    expect(isReasoningTagProvider("Google-Generative-AI")).toBe(true);
    expect(isReasoningTagProvider("GoOgLe-GeNeRaTiVe-Ai")).toBe(true);
  });

  it("should return true for providers containing 'google-antigravity'", () => {
    expect(isReasoningTagProvider("google-antigravity")).toBe(true);
    expect(isReasoningTagProvider("google-antigravity/gemini-3")).toBe(true);
    expect(isReasoningTagProvider("GOOGLE-ANTIGRAVITY")).toBe(true);
    expect(isReasoningTagProvider("some-google-antigravity-suffix")).toBe(true);
  });

  it("should return true for providers containing 'minimax'", () => {
    expect(isReasoningTagProvider("minimax")).toBe(true);
    expect(isReasoningTagProvider("minimax/abab6.5")).toBe(true);
    expect(isReasoningTagProvider("MiniMax")).toBe(true);
    expect(isReasoningTagProvider("Minimax-M2.1")).toBe(true);
  });

  it("should return false for unknown providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("some-random-provider")).toBe(false);
    expect(isReasoningTagProvider("google-antigravity-plus")).toBe(true);
  });

  it("should return true for providers containing 'minimax'", () => {
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

  it("should return false for other providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("azure-openai")).toBe(false);
    expect(isReasoningTagProvider("mistral")).toBe(false);
    expect(isReasoningTagProvider("vertex")).toBe(false); // Unless it includes google-antigravity or minimax
  it("returns false for non-matching providers", () => {
    expect(isReasoningTagProvider("openai")).toBe(false);
    expect(isReasoningTagProvider("anthropic")).toBe(false);
    expect(isReasoningTagProvider("google")).toBe(false); // Only specific google providers match
    expect(isReasoningTagProvider("gemini")).toBe(false); // Only specific gemini providers match
    expect(isReasoningTagProvider("random-provider")).toBe(false);
  });
});
