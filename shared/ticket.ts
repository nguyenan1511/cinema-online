// shared/ticket.ts — the one contract used by the browser, api/share and api/stub.
// Runtime-agnostic: no Buffer, no DOM. Only TextEncoder/TextDecoder, btoa/atob on
// byte strings, Intl.Segmenter and String.prototype.normalize.
import { AISLE_AFTER, SEAT_RE } from "./seats";

// Showtimes are "HHMM" on a 15-minute grid, 08:00-23:45 (each film has its own schedule,
// see shared/schedule.ts). SHOWTIMES is only the default set used by the 2D flow.
export type Showtime = string;
export const SHOWTIMES: Showtime[] = ["1200", "1930", "2200"];
const SHOWTIME_RE = /^(0[89]|1\d|2[0-3])(00|15|30|45)$/;
export function isShowtime(s: unknown): s is Showtime {
  return typeof s === "string" && SHOWTIME_RE.test(s);
}
/** Ticket paper stock by time of day (design 8A): matinee butter, evening pink, late mint. */
export function stockBand(st: Showtime): "matinee" | "evening" | "late" {
  const h = Number(st.slice(0, 2));
  return h < 17 ? "matinee" : h < 21 ? "evening" : "late";
}
export const COMBOS = ["caramel", "phomai", "ngot", "none"] as const;
export type Combo = (typeof COMBOS)[number];
export const COMBO_LABELS: Record<Combo, string> = {
  caramel: "Bắp caramel + Coca",
  phomai: "Bắp phô mai + Coca",
  ngot: "Bắp ngọt + Coca",
  none: "",
};

export const MAX_TOKEN_CHARS = 320; // eng review R2 (D2): measured worst case 310
export const MAX_ROW_ENTRIES = 8;
export const MAX_NAME = 20;
export const MAX_WISH = 60;
export const TZ_OFFSET_MIN = 7 * 60; // Asia/Ho_Chi_Minh, no DST
// Perforation position as a fraction of the ticket height. api/stub draws it here
// and the client tear overlay splits the PNG at the same place (eng re-run OV2-8).
export const PERFORATION_RATIO = 0.74;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NAME_RE = /^[\p{L}\p{M} .'-]+$/u;
const WISH_RE = /^[\p{L}\p{M}\p{N} .,'!?-]*$/u;
const URLISH_RE = /:\/\/|www\.|\.com\b|\.vn\b|@/i;
// Control chars and emoji are stripped before validation (design.md input rules).
const STRIP_RE = /[\p{Cc}\p{Cf}\p{Extended_Pictographic}\u{FE0F}\u{20E3}]/gu;

export type Seat = string;
export interface Host { s: Seat; n: string }
export interface Token {
  v: 1;
  o?: 1; // origin ticket: a first visitor's self-minted token
  f: number;
  st: Showtime;
  d: string; // YYYY-MM-DD, Asia/Ho_Chi_Minh
  h: Host;
  r: [Seat, string][]; // oldest first
}
export interface Me { s: Seat; n: string; w?: string; c: Combo }

// ---------- text ----------

const segmenter = new Intl.Segmenter("vi", { granularity: "grapheme" });
export function graphemes(s: string): string[] {
  return Array.from(segmenter.segment(s), (x) => x.segment);
}

function clean(raw: string): string {
  return raw.normalize("NFC").replace(STRIP_RE, "").replace(/\s+/g, " ").trim();
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateName(raw: unknown): Result<string> {
  if (typeof raw !== "string") return { ok: false, error: "name" };
  const v = clean(raw);
  const len = graphemes(v).length;
  if (len < 1 || len > MAX_NAME) return { ok: false, error: "name_length" };
  if (URLISH_RE.test(v) || !NAME_RE.test(v)) return { ok: false, error: "name_chars" };
  return { ok: true, value: v };
}

export function validateWish(raw: unknown): Result<string> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: "" };
  if (typeof raw !== "string") return { ok: false, error: "wish" };
  const v = clean(raw);
  if (graphemes(v).length > MAX_WISH) return { ok: false, error: "wish_length" };
  if (URLISH_RE.test(v) || !WISH_RE.test(v)) return { ok: false, error: "wish_chars" };
  return { ok: true, value: v };
}

/** Given-name initials: first 2 graphemes of the last word (eng review D9). */
export function initials(name: string): string {
  const words = name.normalize("NFC").trim().split(/\s+/);
  return graphemes(words[words.length - 1] ?? "").slice(0, 2).join("");
}

// Render-time only. Masked text is never written into tokens (eng re-run OV2-5).
const BLOCKLIST = ["đụ", "địt", "lồn", "cặc", "đéo", "vãi lồn", "fuck", "shit", "bitch", "cunt"];
export function maskProfanity(text: string): string {
  let out = text;
  for (const w of BLOCKLIST) {
    out = out.replace(new RegExp(`(^|[^\\p{L}])(${w})(?=$|[^\\p{L}])`, "giu"), (_m, pre) => pre + "***");
  }
  return out;
}

export function formatShowtime(st: Showtime): string {
  return `${st.slice(0, 2)}:${st.slice(2)}`;
}

// ---------- base64url over UTF-8 bytes (never btoa on raw text: eng review SC-1) ----------

function toB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}
export function encodeJson(obj: unknown): string {
  return toB64url(new TextEncoder().encode(JSON.stringify(obj)));
}
export function decodeJson(s: string): unknown {
  const bytes = fromB64url(s);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

// ---------- token ----------

export function encodeToken(t: Token): string {
  const tok: Token = { ...t, r: [...t.r] };
  if (tok.r.length > MAX_ROW_ENTRIES) tok.r = tok.r.slice(-MAX_ROW_ENTRIES);
  let s = encodeJson(tok);
  while (s.length > MAX_TOKEN_CHARS && tok.r.length > 0) {
    tok.r.shift(); // drop oldest
    s = encodeJson(tok);
  }
  return s;
}

/** Decode + validate. Returns null for anything malformed. `filmExists` checks f. */
export function decodeToken(s: string, filmExists?: (f: number) => boolean): Token | null {
  if (typeof s !== "string" || s.length === 0 || s.length > MAX_TOKEN_CHARS) return null;
  const raw = decodeJson(s) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  if (raw.v !== 1) return null;
  if (raw.o !== undefined && raw.o !== 1) return null;
  if (!Number.isInteger(raw.f) || (raw.f as number) <= 0) return null;
  if (filmExists && !filmExists(raw.f as number)) return null;
  if (!isShowtime(raw.st)) return null;
  if (typeof raw.d !== "string" || !DATE_RE.test(raw.d) || Number.isNaN(Date.parse(raw.d))) return null;
  const h = raw.h as Record<string, unknown> | undefined;
  if (!h || typeof h.s !== "string" || !SEAT_RE.test(h.s)) return null;
  const hn = validateName(h.n);
  if (!hn.ok || hn.value !== h.n) return null; // tokens carry already-clean names only
  if (!Array.isArray(raw.r) || raw.r.length > MAX_ROW_ENTRIES) return null;
  const seen = new Set<string>([h.s]);
  const r: [Seat, string][] = [];
  for (const e of raw.r) {
    if (!Array.isArray(e) || e.length !== 2) return null;
    const [seat, ini] = e;
    if (typeof seat !== "string" || !SEAT_RE.test(seat)) return null;
    if (typeof ini !== "string" || !NAME_RE.test(ini) || graphemes(ini).length > 2) return null;
    if (seen.has(seat)) continue; // duplicate seats: first wins
    seen.add(seat);
    r.push([seat, ini]);
  }
  const t: Token = { v: 1, f: raw.f as number, st: raw.st as Showtime, d: raw.d, h: { s: h.s, n: h.n as string }, r };
  if (raw.o === 1) t.o = 1;
  return t;
}

export function encodeMe(me: Me): string {
  const o: Record<string, string> = { s: me.s, n: me.n, c: me.c };
  if (me.w) o.w = me.w;
  return encodeJson(o);
}
export function decodeMe(s: string): Me | null {
  const raw = decodeJson(s) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.s !== "string" || !SEAT_RE.test(raw.s)) return null;
  const n = validateName(raw.n);
  if (!n.ok || n.value !== raw.n) return null;
  const w = validateWish(raw.w);
  if (!w.ok || (raw.w !== undefined && w.value !== raw.w)) return null;
  if (!COMBOS.includes(raw.c as Combo)) return null;
  const me: Me = { s: raw.s, n: n.value, c: raw.c as Combo };
  if (w.value) me.w = w.value;
  return me;
}

export function occupiedSeats(t: Token): Set<Seat> {
  const set = new Set<Seat>();
  if (!t.o) set.add(t.h.s); // an origin token's host is the viewer themself
  for (const [s] of t.r) set.add(s);
  return set;
}

/** True when `seat` is already taken in the received token (eng review OV-11). */
export function seatConflict(t: Token, seat: Seat): boolean {
  return occupiedSeats(t).has(seat);
}

/** The token X shares after sitting in `me.s` (eng review: share-link lifecycle). */
export function reshare(received: Token, me: Me): Token {
  const r: [Seat, string][] = received.r.filter(([s]) => s !== me.s);
  if (!received.o && received.h.s !== me.s) r.push([received.h.s, initials(received.h.n)]);
  const next: Token = { v: 1, f: received.f, st: received.st, d: received.d, h: { s: me.s, n: me.n }, r };
  return decodeToken(encodeToken(next))!; // apply the caps exactly as the wire does
}

/** A first visitor's own token (o:1). */
export function mintOrigin(f: number, st: Showtime, now: Date, me: Pick<Me, "s" | "n">): Token {
  return { v: 1, o: 1, f, st, d: nextShowDate(st, now), h: { s: me.s, n: me.n }, r: [] };
}

// ---------- seats ----------

function parseSeat(s: Seat): [string, number] {
  return [s[0], Number(s.slice(1))];
}
/** Same row, numbers differ by 1, and not across the centre aisle (design 10A). */
export function adjacent(a: Seat, b: Seat): boolean {
  const [ra, na] = parseSeat(a);
  const [rb, nb] = parseSeat(b);
  if (ra !== rb || Math.abs(na - nb) !== 1) return false;
  return Math.min(na, nb) !== AISLE_AFTER;
}

export interface StubLines { invitedBy?: string; nextTo?: string }
/** The "cạnh …" and "Được mời bởi …" lines (spec review R2-2, R3-2). */
export function neighborLine(t: Token, mySeat: Seat): StubLines {
  if (t.o) return {};
  const out: StubLines = { invitedBy: t.h.n };
  if (adjacent(mySeat, t.h.s)) {
    out.nextTo = `cạnh ${t.h.n} (${t.h.s})`;
    return out;
  }
  const near = t.r
    .filter(([s]) => adjacent(mySeat, s))
    .sort((a, b) => parseSeat(a[0])[1] - parseSeat(b[0])[1]);
  if (near.length) out.nextTo = `cạnh ${near[0][1]} (${near[0][0]})`;
  return out;
}

// ---------- dates ----------

/** Next occurrence of the showtime in UTC+7: today if not started yet, else tomorrow (eng review R4). */
export function nextShowDate(st: Showtime, now: Date): string {
  const local = new Date(now.getTime() + TZ_OFFSET_MIN * 60_000);
  const showMin = Number(st.slice(0, 2)) * 60 + Number(st.slice(2));
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (nowMin >= showMin) local.setUTCDate(local.getUTCDate() + 1);
  return local.toISOString().slice(0, 10);
}

/** True once the screening's start time has passed (for the "Suất đã chiếu" label). */
export function screeningPassed(t: Pick<Token, "d" | "st">, now: Date): boolean {
  const startUtc = Date.parse(`${t.d}T${formatShowtime(t.st)}:00+07:00`);
  return now.getTime() >= startUtc;
}
