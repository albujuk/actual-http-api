import { describe, expect, it } from "vitest";
import { parseDay } from "../src/actual/dates.js";

describe("parseDay", () => {
  it("returns local midnight of that day", () => {
    const d = parseDay("2026-09-30");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 30]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
  });

  it("keeps years below 100", () => {
    expect(parseDay("0050-01-02").getFullYear()).toBe(50);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-9-30", "", "not a date"])("rejects %j", (day) => {
    expect(() => parseDay(day)).toThrow(RangeError);
  });
});
