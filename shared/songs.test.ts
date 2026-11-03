import { describe, expect, it } from "vitest";
import { karaokeScore, midiToHz, schedule, songLength, SONGS } from "./songs";

describe("songs", () => {
  it("every song has lines, sane notes and at most 10 syllables per line", () => {
    for (const s of SONGS) {
      expect(s.lines.length).toBeGreaterThan(2);
      for (const line of s.lines) {
        expect(line.length).toBeLessThanOrEqual(10);
        for (const [m, b] of line) { expect(m).toBeGreaterThanOrEqual(48); expect(m).toBeLessThanOrEqual(84); expect(b).toBeGreaterThan(0); }
      }
    }
  });
  it("schedules notes back to back after the lead-in", () => {
    const n = schedule(SONGS[0], 2);
    expect(n[0].start).toBe(2);
    for (let i = 1; i < n.length; i++) expect(n[i].start).toBeCloseTo(n[i - 1].start + n[i - 1].dur);
    expect(songLength(SONGS[0])).toBeGreaterThan(n[n.length - 1].start);
  });
  it("tunes A4 to 440 Hz", () => { expect(midiToHz(69)).toBe(440); expect(midiToHz(81)).toBeCloseTo(880); });
  it("scores voiced time as a percentage, clamped", () => {
    const n = schedule(SONGS[1]);
    const total = n.reduce((a, x) => a + x.dur, 0);
    expect(karaokeScore(total / 2, n)).toBe(50);
    expect(karaokeScore(total * 3, n)).toBe(100);
    expect(karaokeScore(-1, n)).toBe(0);
  });
});
