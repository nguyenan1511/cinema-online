// Seats already sold to strangers for a screening (filler audience). Deterministic per
// screening so the counter's seat chart and the hall always agree.
import { COLS, ROWS } from "../../shared/seats";

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fillerSeats(f: number, d: string, st: string, exclude: Set<string>, n = 44): string[] {
  const rand = mulberry32(seedFrom(`${f}|${d}|${st}`));
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const r = ROWS[Math.floor(rand() * ROWS.length)];
    const c = 1 + Math.floor(rand() * COLS);
    const id = `${r}${c}`;
    if (!exclude.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}
