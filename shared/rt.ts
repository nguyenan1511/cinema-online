// Realtime protocol for "see each other + chat" (one shared cinema per relay).
// The relay (server/relay.ts) is authoritative for ids and names: clients can't spoof
// who said what. Everything a client sends is re-validated there.
import { graphemes, maskProfanity, validateName } from "./ticket";
import { SEAT_RE } from "./seats";

export const HEROES = ["Knight", "Barbarian", "Mage", "Rogue", "Rogue_Hooded", "SinhVien", "CongSo", "CoNang", "Pikachu", "Model1", "Model2", "Model3"] as const;
export type RtHero = (typeof HEROES)[number];
export const MAX_CHAT = 120; // graphemes
export const MAX_PEERS = 60;

export type RtZone = "street" | "lobby" | "corridor" | "hall" | "arcade" | "karaoke";
/** A player's public state, sent ~8×/s. `show` scopes the hall: you only see people at your screening. */
export interface RtState {
  x: number; z: number; ry: number; zone: RtZone; moving: boolean;
  show?: string; // `${filmId}|${date}|${showtime}|${room}`
  seat?: string; // seated in the hall
  pop?: boolean; // holding popcorn
  em?: RtEmote; // current emote
  en?: number; // emote counter: a change means "play it again"
}
export const EMOTES = ["wave", "cheer", "dance", "clap"] as const;
export type RtEmote = (typeof EMOTES)[number];

/** What quiz players see. `answer` is only present during the reveal. */
export interface RtQuiz {
  q: number; text: string; options: string[]; phase: "ask" | "reveal"; endsIn: number; // ms
  answer?: number; board: { name: string; score: number }[]; mine?: number; picked?: number;
}
export interface RtPeer { id: string; name: string; hero: RtHero; s: RtState }
export interface RtChat { id: string; name: string; text: string; ts: number }

export type ClientMsg =
  | { t: "hello"; name: string; hero: RtHero }
  | { t: "state"; s: RtState }
  | { t: "chat"; text: string }
  | { t: "quiz"; on: boolean }
  | { t: "answer"; q: number; choice: number };
export type ServerMsg =
  | { t: "welcome"; id: string; peers: RtPeer[]; history: RtChat[] }
  | { t: "join"; peer: RtPeer }
  | { t: "leave"; id: string }
  | { t: "state"; id: string; s: RtState }
  | { t: "chat"; msg: RtChat }
  | { t: "full" }
  | { t: "quiz"; s: RtQuiz | null };

const URLISH_RE = /:\/\/|www\.|\.com\b|\.vn\b|\.net\b|\.org\b/i;
// Strip control/format chars but keep ZWJ (U+200D) and variation selectors so emoji survive.
const CTRL_RE = /(?![‍️])[\p{Cc}\p{Cf}]/gu;

export type ChatResult = { ok: true; value: string } | { ok: false; error: "empty" | "length" | "link" };
export function sanitizeChat(raw: unknown): ChatResult {
  if (typeof raw !== "string") return { ok: false, error: "empty" };
  const v = raw.normalize("NFC").replace(CTRL_RE, "").replace(/\s+/g, " ").trim();
  if (!v) return { ok: false, error: "empty" };
  if (graphemes(v).length > MAX_CHAT) return { ok: false, error: "length" };
  if (URLISH_RE.test(v)) return { ok: false, error: "link" };
  return { ok: true, value: maskProfanity(v) };
}

const ZONES: RtZone[] = ["street", "lobby", "corridor", "hall", "arcade", "karaoke"];
const SHOW_RE = /^\d{1,9}\|\d{4}-\d{2}-\d{2}\|\d{4}\|[1-3]$/;
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

/** Validate + clamp an incoming state; null if malformed. */
export function sanitizeState(raw: unknown): RtState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = num(r.x, -40, 40), z = num(r.z, -100, 45), ry = num(r.ry, -10, 10);
  if (x === null || z === null || ry === null || !ZONES.includes(r.zone as RtZone)) return null;
  const s: RtState = { x, z, ry, zone: r.zone as RtZone, moving: r.moving === true };
  if (typeof r.show === "string" && SHOW_RE.test(r.show)) s.show = r.show;
  if (typeof r.seat === "string" && SEAT_RE.test(r.seat) && s.show) s.seat = r.seat;
  if (r.pop === true) s.pop = true;
  if (EMOTES.includes(r.em as RtEmote) && Number.isInteger(r.en) && (r.en as number) >= 0 && (r.en as number) < 1e6) { s.em = r.em as RtEmote; s.en = r.en as number; }
  return s;
}

export function sanitizeHello(raw: unknown): { name: string; hero: RtHero } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = validateName(r.name);
  if (!n.ok || !HEROES.includes(r.hero as RtHero)) return null;
  return { name: n.value, hero: r.hero as RtHero };
}
