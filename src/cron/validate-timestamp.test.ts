import { describe, it, expect } from "vitest";
import { validateScheduleTimestamp } from "./validate-timestamp.js";
import type { CronSchedule } from "./types.js";

describe("validateScheduleTimestamp", () => {
  const nowMs = Date.parse("2024-01-01T12:00:00Z");

  it("returns ok for non-'at' schedules", () => {
    const everySchedule: CronSchedule = { kind: "every", everyMs: 1000 };
    const cronSchedule: CronSchedule = { kind: "cron", expr: "* * * * *" };

    expect(validateScheduleTimestamp(everySchedule, nowMs)).toEqual({ ok: true });
    expect(validateScheduleTimestamp(cronSchedule, nowMs)).toEqual({ ok: true });
  });

  it("returns ok for valid future timestamp", () => {
    const futureMs = nowMs + 1000 * 60 * 60; // 1 hour in future
    const schedule: CronSchedule = {
      kind: "at",
      at: new Date(futureMs).toISOString(),
    };

    expect(validateScheduleTimestamp(schedule, nowMs)).toEqual({ ok: true });
  });

  it("returns ok for timestamp slightly in the past (within 1 minute grace)", () => {
    const pastMs = nowMs - 1000 * 30; // 30 seconds ago
    const schedule: CronSchedule = {
      kind: "at",
      at: new Date(pastMs).toISOString(),
    };

    expect(validateScheduleTimestamp(schedule, nowMs)).toEqual({ ok: true });
  });

  it("returns error for timestamp too far in the past (> 1 minute)", () => {
    const pastMs = nowMs - 1000 * 60 * 2; // 2 minutes ago
    const schedule: CronSchedule = {
      kind: "at",
      at: new Date(pastMs).toISOString(),
    };

    const result = validateScheduleTimestamp(schedule, nowMs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("schedule.at is in the past");
    }
  });

  it("returns error for timestamp too far in the future (> 10 years)", () => {
    const futureMs = nowMs + 1000 * 60 * 60 * 24 * 365.25 * 11; // 11 years in future
    const schedule: CronSchedule = {
      kind: "at",
      at: new Date(futureMs).toISOString(),
    };

    const result = validateScheduleTimestamp(schedule, nowMs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("schedule.at is too far in the future");
    }
  });

  it("returns error for invalid timestamp string", () => {
    const schedule: CronSchedule = {
      kind: "at",
      at: "invalid-date",
    };

    const result = validateScheduleTimestamp(schedule, nowMs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid schedule.at");
    }
  });

  it("returns error for empty timestamp string", () => {
    const schedule: CronSchedule = {
      kind: "at",
      at: "",
    };

    const result = validateScheduleTimestamp(schedule, nowMs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid schedule.at");
    }
  });

  it("returns error for whitespace timestamp string", () => {
    const schedule: CronSchedule = {
      kind: "at",
      at: "   ",
    };

    const result = validateScheduleTimestamp(schedule, nowMs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Invalid schedule.at");
    }
  });
});
