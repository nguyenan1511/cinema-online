import { describe, expect, it } from "vitest";
import films from "../data/films.json";
import type { Film } from "./films";
import { buildQuestions } from "./quiz";

describe("buildQuestions", () => {
  const qs = buildQuestions(films as Film[], 30);
  it("builds the requested number of questions from real films", () => { expect(qs.length).toBe(30); });
  it("every question has distinct options and a valid answer index", () => {
    for (const q of qs) {
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
  });
  it("is deterministic (all players see the same quiz)", () => {
    expect(buildQuestions(films as Film[], 30)).toEqual(qs);
  });
  it("needs at least 4 real films", () => {
    expect(buildQuestions((films as Film[]).slice(0, 3))).toEqual([]);
  });
  it("plot answers match the film", () => {
    const real = (films as Film[]).filter((f) => f.video);
    for (const q of qs.filter((x) => x.text.startsWith("Phim nào"))) {
      const f = real.find((x) => q.text.includes(x.video!.blurb))!;
      expect(q.options[q.answer]).toBe(f.title);
    }
  });
});
