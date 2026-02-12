import { describe, expect, it } from "vitest";
import { normalizeAccountId } from "./account-id.js";

describe("normalizeAccountId", () => {
  it("should return trimmed string when value is a valid string", () => {
    expect(normalizeAccountId("account-123")).toBe("account-123");
    expect(normalizeAccountId("  account-123  ")).toBe("account-123");
    expect(normalizeAccountId("\tuser@example.com\n")).toBe("user@example.com");
  });

  it("should return undefined when value is an empty string or whitespace only", () => {
    expect(normalizeAccountId("")).toBeUndefined();
    expect(normalizeAccountId("   ")).toBeUndefined();
    expect(normalizeAccountId("\t\n")).toBeUndefined();
  });

  it("should return undefined when value is undefined", () => {
    expect(normalizeAccountId(undefined)).toBeUndefined();
  });

  it("should return undefined when value is not a string (runtime safety)", () => {
    // @ts-expect-error Testing runtime behavior for invalid types
    expect(normalizeAccountId(123)).toBeUndefined();
    // @ts-expect-error Testing runtime behavior for invalid types
    expect(normalizeAccountId(null)).toBeUndefined();
    // @ts-expect-error Testing runtime behavior for invalid types
    expect(normalizeAccountId({})).toBeUndefined();
    // @ts-expect-error Testing runtime behavior for invalid types
    expect(normalizeAccountId(true)).toBeUndefined();
  });
});
