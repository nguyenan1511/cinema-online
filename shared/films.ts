// Film data: committed data/films.json is the persistent store (spec review R2-3).
// Append-only: films are never deleted, so old invite links keep resolving.

export interface Film {
  id: number; // TMDB id
  title: string; // vi-VN title
  posterPath: string | null; // TMDB path, e.g. "/abc.jpg"
  trailerKey: string | null; // official YouTube key
  releaseDate: string;
  nowPlaying: boolean;
  sample?: true; // hand-made placeholder, removed by the first real refresh
  room?: number; // optional explicit schedule; otherwise derived (shared/schedule.ts)
  showtimes?: string[];
  vn?: true; // Vietnamese production (TMDB origin country / original language): listed first
  /** Openly licensed feature you can actually watch in the hall (Blender open movies on Wikimedia Commons). */
  video?: FilmVideo;
}

export interface FilmVideo {
  webm: string; // VP9 480p (Chrome, Firefox, Safari 17.4+)
  mp4?: string; // MPEG-4 360p fallback for older Safari
  minutes: number;
  genre: string; // vi
  blurb: string; // vi, one line
  credit: string; // attribution required by the CC licence
  poster?: string; // official poster / still on Wikimedia Commons (same licence)
}

export interface FilmIndexEntry { id: number; title: string; posterPath: string | null }

export const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

/**
 * Merge a fresh now_playing result into the committed list.
 * - new films are appended
 * - existing films get refreshed metadata (a known trailer/poster is never blanked)
 * - films missing from `fresh` become nowPlaying:false, never deleted
 * - sample placeholders are dropped once real data exists
 */
export function mergeFilms(existing: Film[], fresh: Omit<Film, "nowPlaying">[]): Film[] {
  // Open films we stream ourselves (`video`) are not TMDB titles: never touched by a refresh,
  // and a TMDB id that happens to collide with one is skipped rather than overwriting it.
  const pinned = new Set(existing.filter((f) => f.video).map((f) => f.id));
  fresh = fresh.filter((f) => !pinned.has(f.id));
  const freshById = new Map(fresh.map((f) => [f.id, f]));
  const out: Film[] = [];
  const seen = new Set<number>();
  for (const old of existing) {
    if (pinned.has(old.id)) { out.push(old); seen.add(old.id); continue; }
    if (old.sample && fresh.length > 0) continue;
    const nu = freshById.get(old.id);
    seen.add(old.id);
    if (nu) {
      out.push({
        ...old,
        title: nu.title || old.title,
        posterPath: nu.posterPath ?? old.posterPath,
        trailerKey: nu.trailerKey ?? old.trailerKey,
        releaseDate: nu.releaseDate || old.releaseDate,
        ...(nu.vn ? { vn: true as const } : {}),
        nowPlaying: true,
      });
    } else {
      out.push({ ...old, nowPlaying: false });
    }
  }
  for (const nu of fresh) if (!seen.has(nu.id)) out.push({ ...nu, nowPlaying: true });
  return out;
}

export function toIndex(films: Film[]): FilmIndexEntry[] {
  return films.map(({ id, title, posterPath }) => ({ id, title, posterPath }));
}
