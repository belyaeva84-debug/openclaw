import { describe, expect, it } from "vitest";
import { readString, readBool, readNumber } from "./meta.js";

describe("acp meta utilities", () => {
  describe("readString", () => {
    it("should return the value for a valid string key", () => {
      const meta = { foo: "bar" };
      expect(readString(meta, ["foo"])).toBe("bar");
    });

    it("should prioritize the first valid key found", () => {
      const meta = { foo: "bar", baz: "qux" };
      expect(readString(meta, ["foo", "baz"])).toBe("bar");
    });

    it("should skip missing keys and return the first valid one", () => {
      const meta = { baz: "qux" };
      expect(readString(meta, ["foo", "baz"])).toBe("qux");
    });

    it("should return undefined if no keys are found", () => {
      const meta = { foo: "bar" };
      expect(readString(meta, ["baz"])).toBeUndefined();
    });

    it("should return undefined for non-string values", () => {
      const meta = { foo: 123, bar: true, baz: {} };
      expect(readString(meta, ["foo"])).toBeUndefined();
      expect(readString(meta, ["bar"])).toBeUndefined();
      expect(readString(meta, ["baz"])).toBeUndefined();
    });

    it("should return undefined for empty or whitespace-only strings", () => {
      const meta = { empty: "", space: "   " };
      expect(readString(meta, ["empty"])).toBeUndefined();
      expect(readString(meta, ["space"])).toBeUndefined();
    });

    it("should trim the returned string", () => {
      const meta = { foo: "  bar  " };
      expect(readString(meta, ["foo"])).toBe("bar");
    });

    it("should handle null or undefined meta object", () => {
      expect(readString(null, ["foo"])).toBeUndefined();
      expect(readString(undefined, ["foo"])).toBeUndefined();
    });
  });

  describe("readBool", () => {
    it("should return true for a valid boolean true", () => {
      const meta = { foo: true };
      expect(readBool(meta, ["foo"])).toBe(true);
    });

    it("should return false for a valid boolean false", () => {
      const meta = { foo: false };
      expect(readBool(meta, ["foo"])).toBe(false);
    });

    it("should prioritize the first valid key found", () => {
      const meta = { foo: true, baz: false };
      expect(readBool(meta, ["foo", "baz"])).toBe(true);
    });

    it("should skip missing keys and return the first valid one", () => {
      const meta = { baz: false };
      expect(readBool(meta, ["foo", "baz"])).toBe(false);
    });

    it("should return undefined if no keys are found", () => {
      const meta = { foo: true };
      expect(readBool(meta, ["baz"])).toBeUndefined();
    });

    it("should return undefined for non-boolean values", () => {
      const meta = { foo: "true", bar: 1, baz: 0 };
      expect(readBool(meta, ["foo"])).toBeUndefined();
      expect(readBool(meta, ["bar"])).toBeUndefined();
      expect(readBool(meta, ["baz"])).toBeUndefined();
    });

    it("should handle null or undefined meta object", () => {
      expect(readBool(null, ["foo"])).toBeUndefined();
      expect(readBool(undefined, ["foo"])).toBeUndefined();
    });
  });

  describe("readNumber", () => {
    it("should return the value for a valid number key", () => {
      const meta = { foo: 42 };
      expect(readNumber(meta, ["foo"])).toBe(42);
    });

    it("should return the value for a valid float key", () => {
      const meta = { foo: 3.14 };
      expect(readNumber(meta, ["foo"])).toBe(3.14);
    });

    it("should prioritize the first valid key found", () => {
      const meta = { foo: 10, baz: 20 };
      expect(readNumber(meta, ["foo", "baz"])).toBe(10);
    });

    it("should skip missing keys and return the first valid one", () => {
      const meta = { baz: 20 };
      expect(readNumber(meta, ["foo", "baz"])).toBe(20);
    });

    it("should return undefined if no keys are found", () => {
      const meta = { foo: 10 };
      expect(readNumber(meta, ["baz"])).toBeUndefined();
    });

    it("should return undefined for non-number values", () => {
      const meta = { foo: "42", bar: true };
      expect(readNumber(meta, ["foo"])).toBeUndefined();
      expect(readNumber(meta, ["bar"])).toBeUndefined();
    });

    it("should return undefined for NaN and Infinity", () => {
      const meta = { nan: NaN, inf: Infinity, negInf: -Infinity };
      expect(readNumber(meta, ["nan"])).toBeUndefined();
      expect(readNumber(meta, ["inf"])).toBeUndefined();
      expect(readNumber(meta, ["negInf"])).toBeUndefined();
    });

    it("should handle null or undefined meta object", () => {
      expect(readNumber(null, ["foo"])).toBeUndefined();
      expect(readNumber(undefined, ["foo"])).toBeUndefined();
    });
  });
});
