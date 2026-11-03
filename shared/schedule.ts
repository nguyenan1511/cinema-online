// Lịch chiếu: which room each film plays in and at what times.
// Films may carry an explicit schedule; otherwise one is derived deterministically from the
// film id, so TMDB-sourced films get a stable, plausible schedule with no extra data.
import type { Film } from "./films";
import { isShowtime, nextShowDate, screeningPassed, type Showtime } from "./ticket";

export const ROOMS = 3;
const GRID: Showtime[] = ["0900", "0945", "1030", "1115", "1200", "1300", "1345", "1430", "1530", "1615", "1700", "1800", "1845", "1930", "2030", "2115", "2200", "2245"];

export interface Schedule { room: number; times: Showtime[] }

function hash(n: number): number {
  let h = n ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function scheduleFor(film: Pick<Film, "id"> & { room?: number; showtimes?: string[] }): Schedule {
  const room = film.room && film.room >= 1 && film.room <= ROOMS ? film.room : (hash(film.id) % ROOMS) + 1;
  if (film.showtimes?.length && film.showtimes.every(isShowtime)) return { room, times: [...film.showtimes].sort() };
  // 5 shows spread over the day, offset per film so the board isn't uniform.
  const h = hash(film.id * 31 + 7);
  const start = h % 3;
  const step = 3 + (h % 2);
  const times: Showtime[] = [];
  for (let i = start; i < GRID.length && times.length < 5; i += step) times.push(GRID[i]);
  return { room, times };
}

export interface ShowSlot { st: Showtime; d: string; label: string; tomorrow: boolean }

/** The next occurrence of each showtime, today if not started yet, else tomorrow (eng review R4). */
export function upcomingSlots(times: Showtime[], now: Date): ShowSlot[] {
  return times
    .map((st) => {
      const d = nextShowDate(st, now);
      const tomorrow = screeningPassed({ d: nowDate(now), st }, now);
      return { st, d, tomorrow, label: `${st.slice(0, 2)}:${st.slice(2)}${tomorrow ? " (mai)" : ""}` };
    })
    .sort((a, b) => (a.d + a.st).localeCompare(b.d + b.st));
}

function nowDate(now: Date): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
