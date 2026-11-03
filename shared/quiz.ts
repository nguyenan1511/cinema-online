// Movie trivia generated from the films we actually show (data/films.json), so questions stay
// true when the line-up changes. Deterministic per index: every player in the room sees the same.
import type { Film } from "./films";
import { mulberry32 } from "./economy";

export interface QuizQ { text: string; options: string[]; answer: number }

export function buildQuestions(films: Film[], count = 30, seed = 2026): QuizQ[] {
  const real = films.filter((f) => f.video && f.nowPlaying);
  if (real.length < 4) return [];
  const rand = mulberry32(seed);
  const pick = <T,>(arr: T[], n: number, must: T) => {
    const others = arr.filter((x) => x !== must).sort(() => rand() - 0.5).slice(0, n - 1);
    const all = [...others];
    const at = Math.floor(rand() * n);
    all.splice(at, 0, must);
    return { all, at };
  };
  const out: QuizQ[] = [];
  const kinds = ["plot", "year", "minutes", "genre"] as const;
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const f = real[Math.floor(rand() * real.length)];
    const v = f.video!;
    const kind = kinds[i % kinds.length];
    if (kind === "plot") {
      const { all, at } = pick(real.map((x) => x.title), 4, f.title);
      out.push({ text: `Phim nào: "${v.blurb}"`, options: all, answer: at });
    } else if (kind === "year") {
      const y = Number(f.releaseDate.slice(0, 4));
      const years = [...new Set([y, y - 2, y + 1, y + 3, y - 4])];
      const { all, at } = pick(years.map(String), 4, String(y));
      out.push({ text: `${f.title} ra mắt năm nào?`, options: all, answer: at });
    } else if (kind === "minutes") {
      const m = v.minutes;
      const opts = [...new Set([m, m + 4, Math.max(2, m - 3), m + 9])];
      const { all, at } = pick(opts.map((x) => `${x} phút`), Math.min(4, opts.length), `${m} phút`);
      out.push({ text: `${f.title} dài khoảng bao lâu?`, options: all, answer: at });
    } else {
      const genres = [...new Set(real.map((x) => x.video!.genre))];
      if (genres.length < 3) continue;
      const { all, at } = pick(genres, Math.min(4, genres.length), v.genre);
      out.push({ text: `${f.title} thuộc thể loại nào?`, options: all, answer: at });
    }
  }
  return out;
}
