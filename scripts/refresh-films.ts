// Fetch TMDB now_playing for Vietnam (vi-VN) and merge into data/films.json (append-only).
// Usage: put TMDB_API_KEY=... in .env (gitignored), then: npm run refresh-films
// Run by hand first and spot-check titles, posters and trailers (eng review D10);
// the weekly GitHub Action comes after the Step 5 gate.
import { readFileSync, writeFileSync } from "node:fs";
import { mergeFilms, type Film } from "../shared/films.ts";

// Either TMDB credential works: the short v3 "API Key" or the long v4 "API Read Access Token" (eyJ...).
const KEY = (process.env.TMDB_API_KEY ?? "").trim();
if (!KEY) {
  console.error("TMDB_API_KEY is not set. Put your TMDB API Key or API Read Access Token in .env (see https://www.themoviedb.org/settings/api)");
  process.exit(1);
}
const BEARER = KEY.startsWith("eyJ");
const API = "https://api.themoviedb.org/3";
const q = (path: string, params: Record<string, string> = {}) =>
  `${API}${path}?${new URLSearchParams({ ...(BEARER ? {} : { api_key: KEY }), ...params })}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with retries: some networks reset TLS connections to TMDB now and then (ECONNRESET). */
async function fetchRetry(url: string, init?: RequestInit, tries = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status !== 429 && res.status < 500) return res;
      if (i >= tries) return res;
    } catch (e) {
      if (i >= tries) throw new Error(`Không kết nối được TMDB sau ${tries} lần thử (${(e as { cause?: { code?: string } }).cause?.code ?? e}). Thử mạng khác hoặc tắt VPN/proxy rồi chạy lại.`);
    }
    await sleep(800 * 2 ** (i - 1));
  }
}

async function get<T>(url: string): Promise<T> {
  await sleep(150); // be gentle: ~40 calls per refresh
  const res = await fetchRetry(url, BEARER ? { headers: { Authorization: `Bearer ${KEY}`, accept: "application/json" } } : undefined);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url.replace(KEY, "***")}${res.status === 401 ? " (key sai hoặc chưa kích hoạt)" : ""}`);
  return res.json() as Promise<T>;
}

interface Movie { id: number; title: string; poster_path: string | null; release_date: string; original_language: string; origin_country?: string[] }
interface NowPlaying { results: Movie[] }
interface Videos { results: { key: string; site: string; type: string; official: boolean; iso_639_1: string }[] }

function pickTrailer(v: Videos): string | null {
  const yt = v.results.filter((x) => x.site === "YouTube" && x.type === "Trailer");
  const rank = (x: Videos["results"][number]) => (x.official ? 2 : 0) + (x.iso_639_1 === "vi" ? 1 : 0);
  return yt.sort((a, b) => rank(b) - rank(a))[0]?.key ?? null;
}

const np = await get<NowPlaying>(q("/movie/now_playing", { region: "VN", language: "vi-VN", page: "1" }));
// Vietnamese productions released in cinemas recently: they lead the line-up even when they
// are not in TMDB's top-20 "now playing" for the region.
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const vnNew = await get<NowPlaying>(q("/discover/movie", {
  region: "VN", language: "vi-VN", with_origin_country: "VN", sort_by: "primary_release_date.desc",
  "primary_release_date.gte": day(-75), "primary_release_date.lte": day(7), with_release_type: "2|3", page: "1",
}));
const isVN = (m: Movie) => m.original_language === "vi" || !!m.origin_country?.includes("VN");
const picked = new Map<number, Movie & { vn: boolean }>();
for (const m of vnNew.results.slice(0, 10)) if (m.poster_path) picked.set(m.id, { ...m, vn: true });
for (const m of np.results.slice(0, 20)) if (!picked.has(m.id)) picked.set(m.id, { ...m, vn: isVN(m) });
const fresh: Omit<Film, "nowPlaying">[] = [];
for (const m of picked.values()) {
  // vi videos first, then any language
  const vi = await get<Videos>(q(`/movie/${m.id}/videos`, { language: "vi-VN" }));
  const any = vi.results.length ? vi : await get<Videos>(q(`/movie/${m.id}/videos`));
  fresh.push({ id: m.id, title: m.title, posterPath: m.poster_path, trailerKey: pickTrailer(any), releaseDate: m.release_date, ...(m.vn ? { vn: true as const } : {}) });
}

const path = new URL("../data/films.json", import.meta.url);
const existing: Film[] = JSON.parse(readFileSync(path, "utf8"));
const merged = mergeFilms(existing, fresh);
writeFileSync(path, JSON.stringify(merged, null, 2) + "\n");

console.log(`now_playing VN: ${fresh.length} films; films.json now has ${merged.length} (${merged.filter((f) => f.nowPlaying).length} showing)`);
console.log("Spot-check before committing:");
for (const f of fresh) console.log(`  ${f.id}\t${f.vn ? "PHIM VIỆT" : "         "}\t${f.posterPath ? "poster" : "NO POSTER"}\t${f.trailerKey ? "trailer" : "NO TRAILER"}\t${f.title}`);
