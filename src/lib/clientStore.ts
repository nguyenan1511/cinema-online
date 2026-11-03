// Guarded, versioned browser storage (eng re-run CQ4): storage throws in private mode
// and some in-app WebViews, so every access falls back to memory.
const mem = new Map<string, string>();

function area(kind: "local" | "session"): Storage | null {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__dirap_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJson<T>(kind: "local" | "session", key: string, fallback: T): T {
  const k = `dirap:v1:${key}`;
  try {
    const raw = area(kind)?.getItem(k) ?? mem.get(k) ?? null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(kind: "local" | "session", key: string, value: unknown): void {
  const k = `dirap:v1:${key}`;
  const raw = JSON.stringify(value);
  mem.set(k, raw);
  try {
    area(kind)?.setItem(k, raw);
  } catch {
    /* memory fallback already holds it */
  }
}

export interface MyTicket { f: number; d: string; st: string; seat: string; name: string; token: string; me: string }

export function saveMyTicket(t: MyTicket): void {
  const all = readJson<MyTicket[]>("local", "tickets", []).filter((x) => !(x.f === t.f && x.d === t.d && x.st === t.st));
  writeJson("local", "tickets", [...all, t].slice(-20));
}
