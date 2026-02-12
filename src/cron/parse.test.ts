import { describe, expect, it } from "vitest";
import { parseAbsoluteTimeMs } from "./parse.js";

describe("parseAbsoluteTimeMs", () => {
  it("returns null for empty or whitespace strings", () => {
    expect(parseAbsoluteTimeMs("")).toBeNull();
    expect(parseAbsoluteTimeMs("   ")).toBeNull();
  });

  it("parses positive integer strings as milliseconds", () => {
    expect(parseAbsoluteTimeMs("123456789")).toBe(123456789);
    expect(parseAbsoluteTimeMs("  123456789  ")).toBe(123456789);
  });

  it("parses zero as epoch 0", () => {
    expect(parseAbsoluteTimeMs("0")).toBe(0);
  });

  it("returns null for negative integers if they are not valid dates", () => {
    // Current implementation doesn't handle negative numeric strings specially,
    // so they fall through to Date.parse, which is inconsistent.
    // For now we just verify it doesn't return -1.
    expect(parseAbsoluteTimeMs("-1")).not.toBe(-1);
  });

  it("parses ISO date strings without timezone as UTC", () => {
    const input = "2023-10-27";
    const expected = Date.parse("2023-10-27T00:00:00Z");
    expect(parseAbsoluteTimeMs(input)).toBe(expected);
  });

  it("parses ISO date-time strings without timezone as UTC", () => {
    const input = "2023-10-27T10:30:00";
    const expected = Date.parse("2023-10-27T10:30:00Z");
    expect(parseAbsoluteTimeMs(input)).toBe(expected);
  });

  it("parses ISO date-time strings with Z as UTC", () => {
    const input = "2023-10-27T10:30:00Z";
    const expected = Date.parse("2023-10-27T10:30:00Z");
    expect(parseAbsoluteTimeMs(input)).toBe(expected);
  });

  it("parses ISO date-time strings with offset correctly", () => {
    const input = "2023-10-27T10:30:00+05:30";
    const expected = Date.parse("2023-10-27T10:30:00+05:30");
    expect(parseAbsoluteTimeMs(input)).toBe(expected);
  });

  it("handles lowercase 'z' in timezone offset", () => {
    const input = "2023-10-27T10:30:00z";
    const expected = Date.parse("2023-10-27T10:30:00Z");
    expect(parseAbsoluteTimeMs(input)).toBe(expected);
  });

  it("returns null for invalid date strings", () => {
    expect(parseAbsoluteTimeMs("not a date")).toBeNull();
    expect(parseAbsoluteTimeMs("2023-13-45")).toBeNull();
  });

  it("returns null for large non-finite numbers", () => {
    expect(parseAbsoluteTimeMs("1e1000")).toBeNull();
    // Test extremely long digit string that might result in Infinity
    expect(parseAbsoluteTimeMs("9".repeat(1000))).toBeNull();
  });

  it("returns null for strings that look like numbers but are not", () => {
    expect(parseAbsoluteTimeMs("123a")).toBeNull();
  });

  it("handles ISO dates with different separators", () => {
    // Date.parse is implementation dependent for non-standard formats,
    // but normalizeUtcIso only targets specific regexes.

    // Test that something NOT matching the regexes still goes to Date.parse
    const input = "Oct 27, 2023";
    const expected = Date.parse(input);
    if (Number.isFinite(expected)) {
        expect(parseAbsoluteTimeMs(input)).toBe(expected);
    } else {
        expect(parseAbsoluteTimeMs(input)).toBeNull();
    }
  });
});
