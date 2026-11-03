import { describe, expect, it } from "vitest";
import { mergeFilms, toIndex, type Film } from "./films";

const f = (id: number, extra: Partial<Film> = {}): Film => ({
  id, title: `Phim ${id}`, posterPath: `/p${id}.jpg`, trailerKey: `k${id}`, releaseDate: "2026-10-01", nowPlaying: true, ...extra,
});
const fresh = (id: number, extra: Partial<Film> = {}) => {
  const { nowPlaying: _n, ...rest } = f(id, extra);
  return rest;
};

describe("mergeFilms (append-only)", () => {
  it("adds new films, keeps gone films as nowPlaying:false, never deletes", () => {
    const out = mergeFilms([f(1), f(2)], [fresh(2), fresh(3)]);
    expect(out.map((x) => [x.id, x.nowPlaying])).toEqual([[1, false], [2, true], [3, true]]);
  });

  it("never blanks a known trailer or poster", () => {
    const out = mergeFilms([f(1)], [fresh(1, { trailerKey: null, posterPath: null, title: "Mới" })]);
    expect(out[0]).toMatchObject({ trailerKey: "k1", posterPath: "/p1.jpg", title: "Mới", nowPlaying: true });
  });

  it("drops sample placeholders once real data arrives, keeps them otherwise", () => {
    const sample = f(9, { sample: true });
    expect(mergeFilms([sample], []).map((x) => x.id)).toEqual([9]);
    expect(mergeFilms([sample], [fresh(1)]).map((x) => x.id)).toEqual([1]);
  });

  it("the edge index carries only id, title, posterPath", () => {
    expect(toIndex([f(1)])).toEqual([{ id: 1, title: "Phim 1", posterPath: "/p1.jpg" }]);
  });
});

describe("mergeFilms with our own open films", () => {
  const open: Film = { id: 910001, title: "Big Buck Bunny", posterPath: null, trailerKey: null, releaseDate: "2008-05-30", nowPlaying: true, video: { webm: "x.webm", minutes: 10, genre: "Hoạt hình", blurb: "b", credit: "c" } };
  it("keeps them showing when a TMDB refresh doesn't list them", () => {
    const out = mergeFilms([open], [{ id: 1, title: "Phim Việt", posterPath: "/p.jpg", trailerKey: "yt", releaseDate: "2026-11-01" }]);
    expect(out.find((f) => f.id === 910001)).toEqual(open);
    expect(out.find((f) => f.id === 1)?.nowPlaying).toBe(true);
  });
  it("never lets a colliding TMDB id overwrite them", () => {
    const out = mergeFilms([open], [{ id: 910001, title: "Other film", posterPath: "/x.jpg", trailerKey: "k", releaseDate: "2026-01-01" }]);
    expect(out).toEqual([open]);
  });
});
