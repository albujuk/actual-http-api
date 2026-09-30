import { afterEach, describe, expect, it } from "vitest";
import { parseDay } from "./dates.js";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const localDay = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe("parseDay", () => {
  it("returns local midnight of that day", () => {
    const d = parseDay("2026-09-30");
    expect(localDay(d)).toEqual([2026, 9, 30]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  // new Date("2026-09-30") would be 2026-09-29 locally west of UTC.
  it.each(["America/Los_Angeles", "Pacific/Honolulu", "UTC", "Asia/Tokyo", "Pacific/Kiritimati"])(
    "keeps the calendar day in %s",
    (tz) => {
      process.env.TZ = tz;
      const d = parseDay("2026-09-30");
      expect(localDay(d)).toEqual([2026, 9, 30]);
      expect(d.getHours()).toBe(0);
    },
  );

  // Chile starts DST at midnight: 2026-09-06 00:00 does not exist there.
  it("keeps the calendar day when local midnight is skipped by DST", () => {
    process.env.TZ = "America/Santiago";
    expect(localDay(parseDay("2026-09-06"))).toEqual([2026, 9, 6]);
  });

  it("keeps years below 100", () => {
    expect(parseDay("0050-01-02").getFullYear()).toBe(50);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-9-30", "", "not a date"])("rejects %j", (day) => {
    expect(() => parseDay(day)).toThrow(RangeError);
  });
});
