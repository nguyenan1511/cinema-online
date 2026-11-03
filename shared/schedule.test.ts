import { describe, expect, it } from "vitest";
import { scheduleFor, upcomingSlots } from "./schedule";
import { isShowtime } from "./ticket";

describe("scheduleFor", () => {
  it("is deterministic per film and only uses valid showtimes in rooms 1-3", () => {
    for (const id of [1, 42, 900001, 1234567, 99999999]) {
      const a = scheduleFor({ id });
      expect(scheduleFor({ id })).toEqual(a);
      expect(a.room).toBeGreaterThanOrEqual(1);
      expect(a.room).toBeLessThanOrEqual(3);
      expect(a.times.length).toBeGreaterThanOrEqual(4);
      expect(a.times.every(isShowtime)).toBe(true);
      expect([...a.times].sort()).toEqual(a.times);
    }
  });

  it("honors an explicit schedule and ignores invalid ones", () => {
    expect(scheduleFor({ id: 1, room: 2, showtimes: ["2200", "1030"] })).toEqual({ room: 2, times: ["1030", "2200"] });
    expect(scheduleFor({ id: 1, showtimes: ["9999"] }).times.every(isShowtime)).toBe(true);
  });
});

describe("upcomingSlots", () => {
  it("rolls past showtimes to tomorrow and sorts by real time", () => {
    // 13:00 local (06:00Z)
    const slots = upcomingSlots(["1030", "1930", "1200", "2200"], new Date("2026-11-02T06:00:00Z"));
    expect(slots.map((s) => [s.st, s.d, s.tomorrow])).toEqual([
      ["1930", "2026-11-02", false],
      ["2200", "2026-11-02", false],
      ["1030", "2026-11-03", true],
      ["1200", "2026-11-03", true],
    ]);
    expect(slots[2].label).toBe("10:30 (mai)");
  });
});
