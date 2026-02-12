import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assertWebChannel,
  CONFIG_DIR,
  ensureDir,
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
