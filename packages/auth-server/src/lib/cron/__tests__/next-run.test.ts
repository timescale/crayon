import { describe, it, expect } from "vitest";
import { computeNextRun, validateCronExpression } from "../next-run";

describe("computeNextRun", () => {
  it("computes next run for every-5-minutes expression", () => {
    const after = new Date("2026-03-17T10:00:00Z");
    const next = computeNextRun("*/5 * * * *", "UTC", after);
    expect(next).toEqual(new Date("2026-03-17T10:05:00Z"));
  });

  it("computes next run for daily at midnight", () => {
    const after = new Date("2026-03-17T10:00:00Z");
    const next = computeNextRun("0 0 * * *", "UTC", after);
    expect(next).toEqual(new Date("2026-03-18T00:00:00Z"));
  });

  it("computes next run for hourly", () => {
    const after = new Date("2026-03-17T10:30:00Z");
    const next = computeNextRun("0 * * * *", "UTC", after);
    expect(next).toEqual(new Date("2026-03-17T11:00:00Z"));
  });

  it("respects timezone", () => {
    // At 23:00 UTC on March 17, in America/New_York (UTC-4 EDT) it's 19:00 ET
    // A cron for "0 20 * * *" (8pm ET) → next occurrence is 20:00 ET same day
    // 20:00 ET = 00:00 UTC March 18
    const after = new Date("2026-03-17T23:00:00Z");
    const next = computeNextRun("0 20 * * *", "America/New_York", after);
    expect(next).toEqual(new Date("2026-03-18T00:00:00Z"));
  });

  it("uses current time when after is not provided", () => {
    const before = new Date();
    const next = computeNextRun("*/5 * * * *", "UTC");
    // Next run should be in the future
    expect(next.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe("validateCronExpression", () => {
  it("accepts valid 5-field cron expressions", () => {
    expect(validateCronExpression("*/5 * * * *")).toBe(true);
    expect(validateCronExpression("0 0 * * *")).toBe(true);
    expect(validateCronExpression("30 9 * * 1-5")).toBe(true);
    expect(validateCronExpression("0 0 1 * *")).toBe(true);
  });

  it("rejects invalid cron expressions", () => {
    expect(validateCronExpression("invalid")).toBe(false);
    expect(validateCronExpression("")).toBe(false);
    expect(validateCronExpression("60 * * * *")).toBe(false);
  });
});
