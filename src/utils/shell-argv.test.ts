import { describe, expect, it } from "vitest";
import { splitShellArgs } from "./shell-argv.js";

describe("splitShellArgs", () => {
  it("splits simple space-separated arguments", () => {
    expect(splitShellArgs("foo bar baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("handles multiple spaces between arguments", () => {
    expect(splitShellArgs("foo   bar  baz")).toEqual(["foo", "bar", "baz"]);
  });

  it("handles leading and trailing spaces", () => {
    expect(splitShellArgs("  foo bar  ")).toEqual(["foo", "bar"]);
  });

  it("handles single quotes preserving content literally", () => {
    expect(splitShellArgs("'foo bar' baz")).toEqual(["foo bar", "baz"]);
    expect(splitShellArgs("'foo\\bar'")).toEqual(["foo\\bar"]);
    expect(splitShellArgs("'foo\"bar'")).toEqual(["foo\"bar"]);
  });

  it("handles double quotes preserving content literally", () => {
    expect(splitShellArgs('"foo bar" baz')).toEqual(["foo bar", "baz"]);
    expect(splitShellArgs('"foo\\bar"')).toEqual(["foo\\bar"]);
    expect(splitShellArgs('"foo\'bar"')).toEqual(["foo'bar"]);
  });

  it("handles escapes outside of quotes", () => {
    expect(splitShellArgs("foo\\ bar")).toEqual(["foo bar"]);
    expect(splitShellArgs("\\'foo\\'")).toEqual(["'foo'"]);
    expect(splitShellArgs('\\"foo\\"')).toEqual(['"foo"']);
    expect(splitShellArgs("foo\\\\bar")).toEqual(["foo\\bar"]);
  });

  it("handles mixed quotes and concatenation", () => {
    expect(splitShellArgs("foo'bar'baz")).toEqual(["foobarbaz"]);
    expect(splitShellArgs('foo"bar"baz')).toEqual(["foobarbaz"]);
    expect(splitShellArgs("'foo'\"bar\"")).toEqual(["foobar"]);
  });

  it("returns null for unclosed single quotes", () => {
    expect(splitShellArgs("'foo bar")).toBeNull();
  });

  it("returns null for unclosed double quotes", () => {
    expect(splitShellArgs('"foo bar')).toBeNull();
  });

  it("returns null for trailing backslash", () => {
    expect(splitShellArgs("foo bar\\")).toBeNull();
  });

  it("ignores empty quotes (current implementation behavior)", () => {
    // Current implementation: if buf is empty, pushToken is not called.
    // So splitShellArgs('""') -> []
    expect(splitShellArgs('""')).toEqual([]);
    expect(splitShellArgs("''")).toEqual([]);
    expect(splitShellArgs('foo "" bar')).toEqual(["foo", "bar"]);
  });

  it("handles empty string input", () => {
    expect(splitShellArgs("")).toEqual([]);
  });

  it("handles whitespace-only input", () => {
    expect(splitShellArgs("   ")).toEqual([]);
  });
});
