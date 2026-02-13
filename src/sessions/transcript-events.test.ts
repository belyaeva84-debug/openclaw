import { describe, expect, it, vi } from "vitest";
import {
  emitSessionTranscriptUpdate,
  onSessionTranscriptUpdate,
} from "./transcript-events.js";

describe("transcript-events", () => {
  it("notifies listeners when update is emitted", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionTranscriptUpdate(listener);

    emitSessionTranscriptUpdate("test-session-file");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      sessionFile: "test-session-file",
    });

    unsubscribe();
  });

  it("supports multiple listeners", () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubscribeA = onSessionTranscriptUpdate(listenerA);
    const unsubscribeB = onSessionTranscriptUpdate(listenerB);

    emitSessionTranscriptUpdate("multi-listener");

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith({ sessionFile: "multi-listener" });

    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledWith({ sessionFile: "multi-listener" });

    unsubscribeA();
    unsubscribeB();
  });

  it("unsubscribes listeners correctly", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionTranscriptUpdate(listener);

    emitSessionTranscriptUpdate("first-update");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    emitSessionTranscriptUpdate("second-update");
    expect(listener).toHaveBeenCalledTimes(1); // Should not increase
  });

  it("trims session file path", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionTranscriptUpdate(listener);

    emitSessionTranscriptUpdate("  spaced-session-file  ");

    expect(listener).toHaveBeenCalledWith({
      sessionFile: "spaced-session-file",
    });

    unsubscribe();
  });

  it("ignores empty or whitespace-only session file paths", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionTranscriptUpdate(listener);

    emitSessionTranscriptUpdate("");
    emitSessionTranscriptUpdate("   ");

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });
});
