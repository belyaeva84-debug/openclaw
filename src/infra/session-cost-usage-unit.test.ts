import { describe, expect, it } from "vitest";
import { processTranscriptLine } from "./session-cost-usage.js";
import type { OpenClawConfig } from "../config/config.js";

describe("processTranscriptLine", () => {
  it("returns null for empty or whitespace-only lines", () => {
    expect(processTranscriptLine("")).toBeNull();
    expect(processTranscriptLine("   ")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(processTranscriptLine("{ invalid json }")).toBeNull();
  });

  it("returns null for malformed entries (missing message or role)", () => {
    expect(processTranscriptLine(JSON.stringify({ type: "message" }))).toBeNull(); // Missing message object
    expect(processTranscriptLine(JSON.stringify({ message: {} }))).toBeNull(); // Missing role
  });

  it("parses a valid user message", () => {
    const line = JSON.stringify({
      timestamp: "2023-01-01T12:00:00Z",
      message: {
        role: "user",
        content: "Hello",
      },
    });
    const entry = processTranscriptLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.role).toBe("user");
    expect(entry?.timestamp).toEqual(new Date("2023-01-01T12:00:00Z"));
  });

  it("parses an assistant message with usage and cost", () => {
    const line = JSON.stringify({
      timestamp: "2023-01-01T12:00:01Z",
      message: {
        role: "assistant",
        content: "Hi",
        usage: {
          input: 10,
          output: 20,
          cost: { total: 0.005 },
        },
      },
    });
    const entry = processTranscriptLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.role).toBe("assistant");
    expect(entry?.usage?.input).toBe(10);
    expect(entry?.costTotal).toBe(0.005);
  });

  it("calculates missing cost using config", () => {
    const config = {
      models: {
        providers: {
          test: {
            models: [
              {
                id: "test-model",
                cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
              },
            ],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const line = JSON.stringify({
      timestamp: "2023-01-01T12:00:01Z",
      message: {
        role: "assistant",
        provider: "test",
        model: "test-model",
        usage: {
          input: 10, // 10 * 1 = 10
          output: 20, // 20 * 2 = 40
        },
      },
    });

    const entry = processTranscriptLine(line, config);
    expect(entry).not.toBeNull();
    expect(entry?.costTotal).toBe(0.00005); // (10*1 + 20*2) / 1,000,000
  });

  it("ignores cost calculation if usage is missing", () => {
      const line = JSON.stringify({
      timestamp: "2023-01-01T12:00:01Z",
      message: {
        role: "assistant",
        content: "Hi",
      },
    });
    const entry = processTranscriptLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.costTotal).toBeUndefined();
  });
});
