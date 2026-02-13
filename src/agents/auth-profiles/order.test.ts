import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAuthProfileOrder } from "./order.js";
import type { AuthProfileStore } from "./types.js";
import type { OpenClawConfig } from "../../config/config.js";

describe("resolveAuthProfileOrder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseStore: AuthProfileStore = {
    version: 1,
    profiles: {},
    usageStats: {},
  };

  it("should return empty array if no profiles exist", () => {
    const result = resolveAuthProfileOrder({
      store: baseStore,
      provider: "openai",
    });
    expect(result).toEqual([]);
  });

  it("should return profiles for the given provider", () => {
    const store: AuthProfileStore = {
      ...baseStore,
      profiles: {
        p1: { type: "api_key", provider: "openai", key: "sk-123" },
        p2: { type: "api_key", provider: "anthropic", key: "sk-ant-123" },
        p3: { type: "api_key", provider: "openai", key: "sk-456" },
      },
    };

    const result = resolveAuthProfileOrder({
      store,
      provider: "openai",
    });

    expect(result).toHaveLength(2);
    expect(result).toContain("p1");
    expect(result).toContain("p3");
    expect(result).not.toContain("p2");
  });

  it("should filter out invalid credentials", () => {
    const now = 1000000;
    vi.setSystemTime(now);

    const store: AuthProfileStore = {
      ...baseStore,
      profiles: {
        valid_key: { type: "api_key", provider: "openai", key: "sk-123" },
        empty_key: { type: "api_key", provider: "openai", key: "" },

        valid_token: { type: "token", provider: "openai", token: "tok-123", expires: now + 1000 },
        expired_token: { type: "token", provider: "openai", token: "tok-456", expires: now - 1000 },
        empty_token: { type: "token", provider: "openai", token: "" },

        valid_oauth: { type: "oauth", provider: "openai", access: "acc-123" },
        valid_oauth_refresh: { type: "oauth", provider: "openai", refresh: "ref-123" },
        empty_oauth: { type: "oauth", provider: "openai", access: "", refresh: "" },
      },
    };

    const result = resolveAuthProfileOrder({
      store,
      provider: "openai",
    });

    expect(result).toContain("valid_key");
    expect(result).toContain("valid_token");
    expect(result).toContain("valid_oauth");
    expect(result).toContain("valid_oauth_refresh");

    expect(result).not.toContain("empty_key");
    expect(result).not.toContain("expired_token");
    expect(result).not.toContain("empty_token");
    expect(result).not.toContain("empty_oauth");
  });

  describe("Implicit Ordering (Round Robin)", () => {
    it("should order by type: OAuth > Token > API Key", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p_key: { type: "api_key", provider: "openai", key: "k" },
          p_token: { type: "token", provider: "openai", token: "t" },
          p_oauth: { type: "oauth", provider: "openai", access: "a" },
        },
      };

      const result = resolveAuthProfileOrder({ store, provider: "openai" });

      // Expected order: OAuth, Token, Key
      expect(result).toEqual(["p_oauth", "p_token", "p_key"]);
    });

    it("should order by lastUsed (LRU) within same type", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
          p3: { type: "api_key", provider: "openai", key: "k" },
        },
        usageStats: {
          p1: { lastUsed: 1000 },
          p2: { lastUsed: 500 }, // Oldest usage -> Should be first
          p3: { lastUsed: 2000 },
        },
      };

      const result = resolveAuthProfileOrder({ store, provider: "openai" });

      expect(result).toEqual(["p2", "p1", "p3"]);
    });
  });

  describe("Explicit Ordering", () => {
    it("should respect store.order", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
          p3: { type: "api_key", provider: "openai", key: "k" },
        },
        order: {
          openai: ["p3", "p1", "p2"],
        },
      };

      const result = resolveAuthProfileOrder({ store, provider: "openai" });
      expect(result).toEqual(["p3", "p1", "p2"]);
    });

    it("should respect cfg.auth.order if store.order is missing", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
      };

      const cfg: OpenClawConfig = {
        auth: {
          order: {
            openai: ["p2", "p1"],
          },
        },
      };

      const result = resolveAuthProfileOrder({ store, cfg, provider: "openai" });
      expect(result).toEqual(["p2", "p1"]);
    });

    it("should prioritize store.order over cfg.auth.order", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
        order: {
          openai: ["p1", "p2"],
        },
      };

      const cfg: OpenClawConfig = {
        auth: {
          order: {
            openai: ["p2", "p1"],
          },
        },
      };

      const result = resolveAuthProfileOrder({ store, cfg, provider: "openai" });
      expect(result).toEqual(["p1", "p2"]);
    });
  });

  describe("Cooldown Handling", () => {
    it("should move profiles in cooldown to the end", () => {
      const now = 10000;
      vi.setSystemTime(now);

      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
        usageStats: {
          p1: { cooldownUntil: now + 5000 }, // In cooldown
          p2: { cooldownUntil: now - 1000 }, // Expired cooldown (available)
        },
      };

      // p1 is in cooldown, so p2 should come first despite implicit ordering rules?
      // Wait, implicit ordering sorts by type then lastUsed.
      // Cooldown profiles are separated and appended at the end.

      const result = resolveAuthProfileOrder({ store, provider: "openai" });
      expect(result).toEqual(["p2", "p1"]);
    });

    it("should sort cooldown profiles by soonest availability", () => {
      const now = 10000;
      vi.setSystemTime(now);

      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
          p3: { type: "api_key", provider: "openai", key: "k" },
        },
        usageStats: {
          p1: { cooldownUntil: now + 5000 },
          p2: { disabledUntil: now + 2000 }, // disabledUntil is also checked
          p3: { cooldownUntil: now + 8000 },
        },
      };

      // All are in cooldown/disabled. Order should be by expiry: p2 (2000), p1 (5000), p3 (8000)
      const result = resolveAuthProfileOrder({ store, provider: "openai" });
      expect(result).toEqual(["p2", "p1", "p3"]);
    });

    it("should respect cooldowns even with explicit ordering", () => {
      const now = 10000;
      vi.setSystemTime(now);

      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
        order: {
           openai: ["p1", "p2"],
        },
        usageStats: {
          p1: { cooldownUntil: now + 5000 }, // In cooldown
        },
      };

      // Explicit order says [p1, p2]. But p1 is in cooldown.
      // Logic: "Still apply cooldown sorting to avoid repeatedly selecting known-bad/rate-limited keys as the first candidate."
      // So available (p2) come first, then cooldown (p1).

      const result = resolveAuthProfileOrder({ store, provider: "openai" });
      expect(result).toEqual(["p2", "p1"]);
    });
  });

  describe("Preferred Profile", () => {
    it("should prioritize preferredProfile", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
      };

      // Implicit order would depend on lastUsed/type (here identical/undefined).
      // Let's assume p1 vs p2 is stable or implementation dependent, but preferredProfile ensures specific one first.

      const result = resolveAuthProfileOrder({
        store,
        provider: "openai",
        preferredProfile: "p2"
      });

      expect(result[0]).toBe("p2");
      expect(result).toHaveLength(2);
    });

    it("should prioritize preferredProfile even if it violates explicit order (as long as it is valid)", () => {
       const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "api_key", provider: "openai", key: "k" },
        },
        order: {
          openai: ["p1", "p2"],
        }
      };

      const result = resolveAuthProfileOrder({
        store,
        provider: "openai",
        preferredProfile: "p2"
      });

      // "Still put preferredProfile first if specified"
      expect(result).toEqual(["p2", "p1"]);
    });
  });

  describe("Config Constraints", () => {
    it("should filter out profiles not matching config mode", () => {
      const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "api_key", provider: "openai", key: "k" },
          p2: { type: "token", provider: "openai", token: "t" },
        },
      };

      const cfg: OpenClawConfig = {
        auth: {
            profiles: {
                p1: { provider: "openai", mode: "oauth" }, // p1 is api_key, config expects oauth -> mismatch
                p2: { provider: "openai", mode: "token" }, // match
            }
        }
      } as any; // Cast to any because OpenClawConfig might have optional properties I'm skipping

      const result = resolveAuthProfileOrder({ store, cfg, provider: "openai" });
      expect(result).toEqual(["p2"]);
    });

    it("should allow oauth mode for token credential type (compatibility)", () => {
       const store: AuthProfileStore = {
        ...baseStore,
        profiles: {
          p1: { type: "token", provider: "openai", token: "t" },
        },
      };
       const cfg: OpenClawConfig = {
        auth: {
            profiles: {
                p1: { provider: "openai", mode: "oauth" }, // Config says oauth, but credential is token -> Compatible
            }
        }
      } as any;

      const result = resolveAuthProfileOrder({ store, cfg, provider: "openai" });
      expect(result).toEqual(["p1"]);
    });
  });
});
