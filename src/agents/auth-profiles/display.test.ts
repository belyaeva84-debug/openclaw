import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { AuthProfileStore } from "./types.js";
import { resolveAuthProfileDisplayLabel } from "./display.js";

describe("resolveAuthProfileDisplayLabel", () => {
  const store: AuthProfileStore = {
    version: 1,
    profiles: {
      "p1": {
        type: "api_key",
        provider: "test",
        key: "sk-test",
        email: "profile@example.com",
      },
      "p2": {
        type: "api_key",
        provider: "test",
        key: "sk-test",
      },
    },
  };

  it("uses config email if present", () => {
    const cfg = {
      auth: {
        profiles: {
          "p1": {
            provider: "test",
            mode: "api_key",
            email: "config@example.com",
          },
        },
      },
    } as unknown as OpenClawConfig;

    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "p1",
    });

    expect(label).toBe("p1 (config@example.com)");
  });

  it("falls back to profile email if config email is missing", () => {
    const cfg = {
      auth: {
        profiles: {},
      },
    } as unknown as OpenClawConfig;

    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "p1",
    });

    expect(label).toBe("p1 (profile@example.com)");
  });

  it("returns only profileId if no email is found", () => {
    const cfg = {
      auth: {
        profiles: {},
      },
    } as unknown as OpenClawConfig;

    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "p2",
    });

    expect(label).toBe("p2");
  });

  it("trims whitespace from email", () => {
    const cfg = {
      auth: {
        profiles: {
          "p1": {
            provider: "test",
            mode: "api_key",
            email: "  trimmed@example.com  ",
          },
        },
      },
    } as unknown as OpenClawConfig;

    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "p1",
    });

    expect(label).toBe("p1 (trimmed@example.com)");
  });

  it("handles missing profile in store", () => {
    const cfg = {} as OpenClawConfig;
    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "missing",
    });

    expect(label).toBe("missing");
  });

  it("handles undefined config", () => {
    const label = resolveAuthProfileDisplayLabel({
      cfg: undefined,
      store,
      profileId: "p1",
    });

    expect(label).toBe("p1 (profile@example.com)");
  });

  it("handles config without auth/profiles structure", () => {
    const cfg = {} as OpenClawConfig;
    const label = resolveAuthProfileDisplayLabel({
      cfg,
      store,
      profileId: "p1",
    });

    expect(label).toBe("p1 (profile@example.com)");
  });
});
