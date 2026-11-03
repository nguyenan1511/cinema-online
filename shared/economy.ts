// Coins, prizes and odds for the lobby games (claw machine, gacha, karaoke, quiz).
// Pure + seedable so it is testable; the wallet itself lives in localStorage (src/lib/wallet.ts).

export const START_COINS = 6;
export const PRICE = { claw: 1, gacha: 2, karaoke: 1 } as const;
export const REWARD = { quizCorrect: 1, watchedFilm: 3, karaokeScore: 2, firstVisit: 2 } as const;

export interface Wallet { coins: number; plush: string[]; pins: string[]; seen: string[] }
export const emptyWallet = (): Wallet => ({ coins: START_COINS, plush: [], pins: [], seen: [] });

export function spend(w: Wallet, amount: number): Wallet | null {
  if (!Number.isInteger(amount) || amount < 0 || w.coins < amount) return null;
  return { ...w, coins: w.coins - amount };
}
export function earn(w: Wallet, amount: number, cap = 99): Wallet {
  return { ...w, coins: Math.min(cap, w.coins + Math.max(0, Math.floor(amount))) };
}
/** One-time rewards (first visit to a corner, finishing a film): returns the same wallet if already claimed. */
export function claimOnce(w: Wallet, key: string, amount: number): Wallet {
  if (w.seen.includes(key)) return w;
  return { ...earn(w, amount), seen: [...w.seen, key] };
}

// ---------- claw machine ----------
export const PLUSH = [
  { id: "gau-nau", name: "Gấu nâu", color: 0x8a5a3c },
  { id: "gau-hong", name: "Gấu hồng", color: 0xf29bb6 },
  { id: "gau-trang", name: "Gấu bắc cực", color: 0xf3efe6 },
  { id: "gau-vang", name: "Gấu mật", color: 0xe9b949 },
  { id: "gau-xanh", name: "Gấu bạc hà", color: 0x8fd6c0 },
] as const;

/**
 * Grab chance from how far (metres, xz) the claw centre is from the plush centre.
 * Dead centre ≈ 75%, edge of reach (0.16 m) ≈ 10%, beyond → 0. A grabbed plush can still
 * slip on the way up (SLIP) like a real machine.
 */
export const CLAW_REACH = 0.16;
export const CLAW_SLIP = 0.2;
export function grabChance(dist: number): number {
  if (!(dist >= 0) || dist > CLAW_REACH) return 0;
  return 0.1 + 0.65 * (1 - dist / CLAW_REACH);
}

// ---------- gacha ----------
export type Rarity = "thường" | "hiếm" | "siêu hiếm";
export interface Pin { id: string; name: string; rarity: Rarity; emoji: string }
export const PINS: Pin[] = [
  { id: "bap", name: "Bắp rang bơ", rarity: "thường", emoji: "🍿" },
  { id: "ve", name: "Cuống vé", rarity: "thường", emoji: "🎟️" },
  { id: "kinh3d", name: "Kính 3D", rarity: "thường", emoji: "🕶️" },
  { id: "may-quay", name: "Máy quay", rarity: "thường", emoji: "🎥" },
  { id: "cuon-phim", name: "Cuộn phim", rarity: "thường", emoji: "🎞️" },
  { id: "tho", name: "Thỏ Bunny", rarity: "hiếm", emoji: "🐰" },
  { id: "rong", name: "Rồng Sintel", rarity: "hiếm", emoji: "🐉" },
  { id: "robot", name: "Robot thép", rarity: "hiếm", emoji: "🤖" },
  { id: "lac-da", name: "Lạc đà Koro", rarity: "hiếm", emoji: "🦙" },
  { id: "clapper", name: "Bảng clapper vàng", rarity: "siêu hiếm", emoji: "🎬" },
  { id: "tuong-vang", name: "Tượng vàng", rarity: "siêu hiếm", emoji: "🏆" },
];
const WEIGHT: Record<Rarity, number> = { "thường": 70, "hiếm": 25, "siêu hiếm": 5 };

/** Pick a pin: rarity first by weight, then uniformly inside the rarity. `rand` in [0,1). */
export function rollGacha(rand: () => number): Pin {
  const total = Object.values(WEIGHT).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  let rarity: Rarity = "thường";
  for (const k of Object.keys(WEIGHT) as Rarity[]) { if (r < WEIGHT[k]) { rarity = k; break; } r -= WEIGHT[k]; }
  const pool = PINS.filter((p) => p.rarity === rarity);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

/** Small deterministic PRNG for tests / reproducible demos. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse a stored wallet defensively (localStorage is user-editable). */
export function parseWallet(raw: unknown): Wallet {
  const w = emptyWallet();
  if (!raw || typeof raw !== "object") return w;
  const r = raw as Record<string, unknown>;
  const ids = (v: unknown, allowed: Set<string>) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.has(x)).slice(0, 200) : []);
  if (typeof r.coins === "number" && Number.isFinite(r.coins)) w.coins = Math.max(0, Math.min(99, Math.floor(r.coins)));
  w.plush = ids(r.plush, new Set(PLUSH.map((p) => p.id)));
  w.pins = ids(r.pins, new Set(PINS.map((p) => p.id)));
  w.seen = Array.isArray(r.seen) ? r.seen.filter((x): x is string => typeof x === "string" && x.length < 40).slice(0, 50) : [];
  return w;
}
