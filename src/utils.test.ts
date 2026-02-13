import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertWebChannel,
  clampInt,
  clampNumber,
  CONFIG_DIR,
  ensureDir,
  isRecord,
  isPlainObject,
  jidToE164,
  normalizeE164,
  normalizePath,
  resolveConfigDir,
  resolveHomeDir,
  resolveJidToE164,
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  sleep,
  sliceUtf16Safe,
  toWhatsappJid,
  truncateUtf16Safe,
  withWhatsAppPrefix,
} from "./utils.js";

describe("sliceUtf16Safe", () => {
  it("slices normal strings correctly", () => {
    expect(sliceUtf16Safe("hello", 0, 5)).toBe("hello");
    expect(sliceUtf16Safe("hello", 1, 4)).toBe("ell");
    expect(sliceUtf16Safe("hello", 0)).toBe("hello");
  });

  it("handles negative indices", () => {
    expect(sliceUtf16Safe("hello", -2)).toBe("lo");
    expect(sliceUtf16Safe("hello", -3, -1)).toBe("ll");
  });

  it("swaps start and end if start > end", () => {
    expect(sliceUtf16Safe("hello", 4, 1)).toBe("ell");
  });

  it("preserves complete surrogate pairs", () => {
    const emoji = "👋"; // 2 chars: \uD83D \uDC4B
    expect(sliceUtf16Safe(`hi ${emoji} there`, 3, 5)).toBe(emoji);
  });

  it("adjusts start if splitting a surrogate pair", () => {
    const emoji = "👋"; // 2 chars: \uD83D \uDC4B
    // The emoji is at index 0 and 1.
    // If we start at index 1 (low surrogate), it should skip to index 2 (after the emoji).
    expect(sliceUtf16Safe(`${emoji} world`, 1)).toBe(" world");
  });

  it("adjusts end if splitting a surrogate pair", () => {
    const emoji = "👋"; // 2 chars: \uD83D \uDC4B
    // The emoji is at index 0 and 1.
    // If we end at index 1 (low surrogate), it should drop the high surrogate at index 0.
    expect(sliceUtf16Safe(`${emoji} world`, 0, 1)).toBe("");
  });

  it("handles complex mixed content", () => {
    const s = "a👋b🌍c";
    // 'a' (0), '👋' (1,2), 'b' (3), '🌍' (4,5), 'c' (6)

    // Slice from middle of first emoji to middle of second emoji
    // Start: 2 (after 👋)
    // End: 5 (middle of 🌍) -> should become 4 (before 🌍)
    expect(sliceUtf16Safe(s, 2, 5)).toBe("b");

    // Slice from middle of first emoji to end
    // Start: 2 (after 👋)
    expect(sliceUtf16Safe(s, 2)).toBe("b🌍c");

    // Slice from start to middle of second emoji
    // End: 5 (middle of 🌍) -> should become 4 (before 🌍)
    expect(sliceUtf16Safe(s, 0, 5)).toBe("a👋b");
  });
});

describe("truncateUtf16Safe", () => {
  it("does not truncate short strings", () => {
    expect(truncateUtf16Safe("hello", 10)).toBe("hello");
  });

  it("truncates normal strings", () => {
    expect(truncateUtf16Safe("hello world", 5)).toBe("hello");
  });

  it("truncates at surrogate pair boundary safely", () => {
    const emoji = "👋"; // 2 chars
    const s = `hi ${emoji}`; // "hi 👋" -> h(0), i(1), space(2), emoji(3,4)
    expect(truncateUtf16Safe(s, 3)).toBe("hi ");
  });

  it("avoid splitting surrogate pairs", () => {
    const emoji = "👋"; // 2 chars
    const s = `hi ${emoji}`; // "hi 👋" -> h(0), i(1), space(2), emoji(3,4)
    // Truncate at 4 (middle of emoji)
    // Should drop the emoji entirely because we can't include half of it
    expect(truncateUtf16Safe(s, 4)).toBe("hi ");
  });

  it("includes surrogate pair if limit allows", () => {
    const emoji = "👋"; // 2 chars
    const s = `hi ${emoji}`; // "hi 👋" -> h(0), i(1), space(2), emoji(3,4)
    expect(truncateUtf16Safe(s, 5)).toBe(`hi ${emoji}`);
  });

  it("handles zero and negative limits", () => {
    expect(truncateUtf16Safe("hello", 0)).toBe("");
    expect(truncateUtf16Safe("hello", -5)).toBe("");
  });

  it("handles empty strings", () => {
    expect(truncateUtf16Safe("", 10)).toBe("");
describe("clampNumber", () => {
  it("keeps value within range", () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
  });

  it("clamps to min if value is lower", () => {
    expect(clampNumber(-5, 0, 10)).toBe(0);
  });

  it("clamps to max if value is higher", () => {
    expect(clampNumber(15, 0, 10)).toBe(10);
  });

  it("handles value equal to min", () => {
    expect(clampNumber(0, 0, 10)).toBe(0);
  });

  it("handles value equal to max", () => {
    expect(clampNumber(10, 0, 10)).toBe(10);
  });

  it("handles floating point values", () => {
    expect(clampNumber(5.5, 0, 10)).toBe(5.5);
    expect(clampNumber(-0.1, 0, 10)).toBe(0);
    expect(clampNumber(10.1, 0, 10)).toBe(10);
  });
});

describe("clampInt", () => {
  it("floors value and clamps within range", () => {
    expect(clampInt(5.9, 0, 10)).toBe(5);
  });

  it("clamps floored value to min", () => {
    expect(clampInt(-0.1, 0, 10)).toBe(0); // Math.floor(-0.1) is -1, clamps to 0
  });

  it("clamps floored value to max", () => {
    expect(clampInt(10.5, 0, 10)).toBe(10);
describe("sliceUtf16Safe", () => {
  it("slices simple ASCII strings correctly", () => {
    expect(sliceUtf16Safe("Hello World", 0, 5)).toBe("Hello");
    expect(sliceUtf16Safe("Hello World", 6)).toBe("World");
  });

  it("slices strings with emojis correctly (valid boundaries)", () => {
    // "A🐬B" -> A (0), D83D (1), DC2C (2), B (3)
    const input = "A🐬B";
    expect(sliceUtf16Safe(input, 0, 4)).toBe("A🐬B");
    expect(sliceUtf16Safe(input, 1, 3)).toBe("🐬");
  });

  it("handles splitting a surrogate pair at the start", () => {
    const input = "A🐬B";
    // Start at index 2 (low surrogate of dolphin)
    // Should skip the low surrogate and start at B
    expect(sliceUtf16Safe(input, 2, 4)).toBe("B");
  });

  it("handles splitting a surrogate pair at the end", () => {
    const input = "A🐬B";
    // End at index 2 (low surrogate of dolphin)
    // Should exclude the high surrogate at index 1
    expect(sliceUtf16Safe(input, 0, 2)).toBe("A");
  });

  it("handles splitting a surrogate pair at both ends (empty result)", () => {
    const input = "A🐬B";
    // Start at 1 (H), End at 2 (L).
    // Start 1 (H) -> valid start (not L preceded by H).
    // End 2 (L) -> invalid end (L preceded by H). reduced to 1.
    // Result slice(1, 1) -> ""
    expect(sliceUtf16Safe(input, 1, 2)).toBe("");
  });

  it("handles negative indices safely", () => {
    const input = "A🐬B";
    // slice(-2) -> start at index 2 (L).
    // Should skip L and start at 3 (B).
    expect(sliceUtf16Safe(input, -2)).toBe("B");
  });

  it("swaps start and end if start > end", () => {
    const input = "A🐬B";
    expect(sliceUtf16Safe(input, 4, 0)).toBe("A🐬B");
  });

  it("handles out of bounds indices", () => {
    const input = "ABC";
    expect(sliceUtf16Safe(input, -10, 10)).toBe("ABC");
  });
});

describe("normalizePath", () => {
  it("adds leading slash when missing", () => {
    expect(normalizePath("foo")).toBe("/foo");
  });

  it("keeps existing slash", () => {
    expect(normalizePath("/bar")).toBe("/bar");
  });
});

describe("withWhatsAppPrefix", () => {
  it("adds whatsapp prefix", () => {
    expect(withWhatsAppPrefix("+1555")).toBe("whatsapp:+1555");
  });

  it("leaves prefixed intact", () => {
    expect(withWhatsAppPrefix("whatsapp:+1555")).toBe("whatsapp:+1555");
  });
});

describe("ensureDir", () => {
  it("creates nested directory", async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-test-"));
    const target = path.join(tmp, "nested", "dir");
    await ensureDir(target);
    expect(fs.existsSync(target)).toBe(true);
  });
});

describe("sleep", () => {
  it("resolves after delay using fake timers", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("assertWebChannel", () => {
  it("throws for invalid channel", () => {
    expect(() => assertWebChannel("bad" as string)).toThrow();
  });
});

describe("normalizeE164 & toWhatsappJid", () => {
  it("strips formatting and prefixes", () => {
    expect(normalizeE164("whatsapp:(555) 123-4567")).toBe("+5551234567");
    expect(toWhatsappJid("whatsapp:+555 123 4567")).toBe("5551234567@s.whatsapp.net");
  });

  it("preserves existing JIDs", () => {
    expect(toWhatsappJid("123456789-987654321@g.us")).toBe("123456789-987654321@g.us");
    expect(toWhatsappJid("whatsapp:123456789-987654321@g.us")).toBe("123456789-987654321@g.us");
    expect(toWhatsappJid("1555123@s.whatsapp.net")).toBe("1555123@s.whatsapp.net");
  });
});

describe("jidToE164", () => {
  it("maps @lid using reverse mapping file", () => {
    const mappingPath = path.join(CONFIG_DIR, "credentials", "lid-mapping-123_reverse.json");
    const original = fs.readFileSync;
    const spy = vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
      if (args[0] === mappingPath) {
        return `"5551234"`;
      }
      return original(...args);
    });
    expect(jidToE164("123@lid")).toBe("+5551234");
    spy.mockRestore();
  });

  it("maps @lid from authDir mapping files", () => {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    const mappingPath = path.join(authDir, "lid-mapping-456_reverse.json");
    fs.writeFileSync(mappingPath, JSON.stringify("5559876"));
    expect(jidToE164("456@lid", { authDir })).toBe("+5559876");
    fs.rmSync(authDir, { recursive: true, force: true });
  });

  it("maps @hosted.lid from authDir mapping files", () => {
    const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-auth-"));
    const mappingPath = path.join(authDir, "lid-mapping-789_reverse.json");
    fs.writeFileSync(mappingPath, JSON.stringify(4440001));
    expect(jidToE164("789@hosted.lid", { authDir })).toBe("+4440001");
    fs.rmSync(authDir, { recursive: true, force: true });
  });

  it("accepts hosted PN JIDs", () => {
    expect(jidToE164("1555000:2@hosted")).toBe("+1555000");
  });

  it("falls back through lidMappingDirs in order", () => {
    const first = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-lid-a-"));
    const second = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-lid-b-"));
    const mappingPath = path.join(second, "lid-mapping-321_reverse.json");
    fs.writeFileSync(mappingPath, JSON.stringify("123321"));
    expect(jidToE164("321@lid", { lidMappingDirs: [first, second] })).toBe("+123321");
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  });
});

describe("resolveConfigDir", () => {
  it("prefers ~/.openclaw when legacy dir is missing", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-config-dir-"));
    try {
      const newDir = path.join(root, ".openclaw");
      await fs.promises.mkdir(newDir, { recursive: true });
      const resolved = resolveConfigDir({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });
});

describe("resolveHomeDir", () => {
  it("prefers OPENCLAW_HOME over HOME", () => {
    vi.stubEnv("OPENCLAW_HOME", "/srv/openclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveHomeDir()).toBe(path.resolve("/srv/openclaw-home"));

    vi.unstubAllEnvs();
  });
});

describe("shortenHomePath", () => {
  it("uses $OPENCLAW_HOME prefix when OPENCLAW_HOME is set", () => {
    vi.stubEnv("OPENCLAW_HOME", "/srv/openclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(shortenHomePath(`${path.resolve("/srv/openclaw-home")}/.openclaw/openclaw.json`)).toBe(
      "$OPENCLAW_HOME/.openclaw/openclaw.json",
    );

    vi.unstubAllEnvs();
  });
});

describe("shortenHomeInString", () => {
  it("uses $OPENCLAW_HOME replacement when OPENCLAW_HOME is set", () => {
    vi.stubEnv("OPENCLAW_HOME", "/srv/openclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(
      shortenHomeInString(`config: ${path.resolve("/srv/openclaw-home")}/.openclaw/openclaw.json`),
    ).toBe("config: $OPENCLAW_HOME/.openclaw/openclaw.json");

    vi.unstubAllEnvs();
  });
});

describe("resolveJidToE164", () => {
  it("resolves @lid via lidLookup when mapping file is missing", async () => {
    const lidLookup = {
      getPNForLID: vi.fn().mockResolvedValue("777:0@s.whatsapp.net"),
    };
    await expect(resolveJidToE164("777@lid", { lidLookup })).resolves.toBe("+777");
    expect(lidLookup.getPNForLID).toHaveBeenCalledWith("777@lid");
  });

  it("skips lidLookup for non-lid JIDs", async () => {
    const lidLookup = {
      getPNForLID: vi.fn().mockResolvedValue("888:0@s.whatsapp.net"),
    };
    await expect(resolveJidToE164("888@s.whatsapp.net", { lidLookup })).resolves.toBe("+888");
    expect(lidLookup.getPNForLID).not.toHaveBeenCalled();
  });
});

describe("resolveUserPath", () => {
  it("expands ~ to home dir", () => {
    expect(resolveUserPath("~")).toBe(path.resolve(os.homedir()));
  });

  it("expands ~/ to home dir", () => {
    expect(resolveUserPath("~/openclaw")).toBe(path.resolve(os.homedir(), "openclaw"));
  });

  it("resolves relative paths", () => {
    expect(resolveUserPath("tmp/dir")).toBe(path.resolve("tmp/dir"));
  });

  it("prefers OPENCLAW_HOME for tilde expansion", () => {
    vi.stubEnv("OPENCLAW_HOME", "/srv/openclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveUserPath("~/openclaw")).toBe(path.resolve("/srv/openclaw-home", "openclaw"));

    vi.unstubAllEnvs();
  });

  it("keeps blank paths blank", () => {
    expect(resolveUserPath("")).toBe("");
    expect(resolveUserPath("   ")).toBe("");
  });
});

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("returns true for class instances", () => {
    class Foo {}
    expect(isRecord(new Foo())).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isRecord("string")).toBe(false);
    expect(isRecord(123)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(Symbol("sym"))).toBe(false);
describe("isPlainObject", () => {
  it("returns true for plain objects", () => {
    expect(isPlainObject({})).toBe(true);
    // eslint-disable-next-line no-new-object
    expect(isPlainObject(new Object())).toBe(true);
  });

  it("returns false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("returns false for arrays", () => {
    expect(isPlainObject([])).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-array-constructor
    expect(isPlainObject(new Array())).toBe(false);
  });

  it("returns false for complex built-ins", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(new RegExp("a"))).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Set())).toBe(false);
  });

  it("returns false for class instances", () => {
    class Foo {}
    expect(isPlainObject(new Foo())).toBe(false);
  });

  it("returns false for Object.create(null)", () => {
    // Current implementation uses Object.getPrototypeOf(v) === Object.prototype,
    // so objects with null prototype are excluded.
    expect(isPlainObject(Object.create(null))).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(123)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});
