import { describe, expect, it } from "vitest";
import { parseInlineDirectives } from "./directive-tags.js";

describe("parseInlineDirectives", () => {
  it("handles empty or undefined input", () => {
    expect(parseInlineDirectives(undefined).text).toBe("");
    expect(parseInlineDirectives("").text).toBe("");
    expect(parseInlineDirectives("").audioAsVoice).toBe(false);
    expect(parseInlineDirectives("").hasAudioTag).toBe(false);
    expect(parseInlineDirectives("").hasReplyTag).toBe(false);
  });

  it("returns original text when no directives are present", () => {
    const text = "Hello world";
    const result = parseInlineDirectives(text);
    expect(result.text).toBe(text);
    expect(result.audioAsVoice).toBe(false);
    expect(result.hasAudioTag).toBe(false);
    expect(result.hasReplyTag).toBe(false);
    expect(result.replyToCurrent).toBe(false);
    expect(result.replyToId).toBeUndefined();
  });

  it("parses and strips audio directive", () => {
    const text = "Hello [[audio_as_voice]] world";
    const result = parseInlineDirectives(text);
    expect(result.text).toBe("Hello world");
    expect(result.audioAsVoice).toBe(true);
    expect(result.hasAudioTag).toBe(true);
  });

  it("parses and strips reply_to_current directive", () => {
    const text = "Response [[reply_to_current]]";
    const result = parseInlineDirectives(text, { currentMessageId: "msg-123" });
    expect(result.text).toBe("Response");
    expect(result.replyToCurrent).toBe(true);
    expect(result.hasReplyTag).toBe(true);
    expect(result.replyToId).toBe("msg-123");
  });

  it("parses and strips reply_to explicit id directive", () => {
    const text = "Response [[reply_to: msg-456]]";
    const result = parseInlineDirectives(text);
    expect(result.text).toBe("Response");
    expect(result.replyToExplicitId).toBe("msg-456");
    expect(result.replyToId).toBe("msg-456");
  });

  it("handles whitespace in directives", () => {
    const text = "Hello [[  audio_as_voice  ]] [[ reply_to :  msg-789  ]]";
    const result = parseInlineDirectives(text);
    expect(result.text).toBe("Hello");
    expect(result.audioAsVoice).toBe(true);
    expect(result.replyToExplicitId).toBe("msg-789");
  });

  it("respects options to not strip tags", () => {
    const text = "Hello [[audio_as_voice]]";
    const result = parseInlineDirectives(text, { stripAudioTag: false });
    expect(result.text).toBe("Hello [[audio_as_voice]]");
    expect(result.audioAsVoice).toBe(true);
  });

  it("prioritizes explicit reply id over current", () => {
    const text = "[[reply_to_current]] [[reply_to: explicit-id]]";
    const result = parseInlineDirectives(text, { currentMessageId: "current-id" });
    expect(result.replyToId).toBe("explicit-id");
    expect(result.replyToCurrent).toBe(true); // It saw both
  });

  it("handles multiline text and normalizes whitespace", () => {
      const text = "Line 1\n   Line 2   [[audio_as_voice]]\nLine 3";
      const result = parseInlineDirectives(text);
      expect(result.text).toBe("Line 1\nLine 2\nLine 3");
  });

  it("handles multiple directives correctly", () => {
    const text = "Some text [[audio_as_voice]] and more [[reply_to_current]]";
    const result = parseInlineDirectives(text, { currentMessageId: "abc" });
    expect(result.text).toBe("Some text and more");
    expect(result.audioAsVoice).toBe(true);
    expect(result.replyToCurrent).toBe(true);
    expect(result.replyToId).toBe("abc");
  });
});
