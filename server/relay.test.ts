import { describe, expect, it } from "vitest";
import { createRelay } from "./relay";
import { sanitizeChat, sanitizeState, type ServerMsg } from "../shared/rt";

function client(relay: ReturnType<typeof createRelay>) {
  const got: ServerMsg[] = [];
  let closed = false;
  const conn = relay.connect((m) => got.push(m), () => { closed = true; });
  return { got, conn, send: (m: unknown) => conn.receive(JSON.stringify(m)), closed: () => closed };
}

describe("sanitizeChat", () => {
  it("trims, NFC-normalizes and keeps emoji", () => {
    expect(sanitizeChat("  phim hay quá   😂 ")).toEqual({ ok: true, value: "phim hay quá 😂" });
    expect(sanitizeChat("Nguyễn")).toEqual({ ok: true, value: "Nguyễn" });
  });
  it("rejects empty, too long and links", () => {
    expect(sanitizeChat("   ").ok).toBe(false);
    expect(sanitizeChat("a".repeat(121))).toEqual({ ok: false, error: "length" });
    expect(sanitizeChat("vào www.lua-dao.vn đi")).toEqual({ ok: false, error: "link" });
  });
  it("masks profanity and strips control characters", () => {
    expect(sanitizeChat("đéo hay")).toEqual({ ok: true, value: "*** hay" });
    expect(sanitizeChat("a\u0000b‮c")).toEqual({ ok: true, value: "abc" });
  });
});

describe("sanitizeState", () => {
  it("clamps numbers and drops unknown fields", () => {
    expect(sanitizeState({ x: 999, z: 5, ry: 0, zone: "lobby", moving: true, evil: 1 })).toEqual({ x: 40, z: 5, ry: 0, zone: "lobby", moving: true });
  });
  it("rejects bad zones and NaN", () => {
    expect(sanitizeState({ x: NaN, z: 0, ry: 0, zone: "lobby" })).toBeNull();
    expect(sanitizeState({ x: 0, z: 0, ry: 0, zone: "roof" })).toBeNull();
  });
  it("keeps a seat only with a valid screening key", () => {
    expect(sanitizeState({ x: 0, z: -80, ry: 0, zone: "hall", seat: "F5" })?.seat).toBeUndefined();
    expect(sanitizeState({ x: 0, z: -80, ry: 0, zone: "hall", show: "910001|2026-11-03|1830|1", seat: "F5" })?.seat).toBe("F5");
  });
});

describe("relay", () => {
  it("welcomes with existing peers and announces joins/leaves", () => {
    const r = createRelay();
    const a = client(r), b = client(r);
    a.send({ t: "hello", name: "An", hero: "Mage" });
    b.send({ t: "hello", name: "Bình", hero: "Knight" });
    const welcomeB = b.got.find((m) => m.t === "welcome");
    expect(welcomeB && welcomeB.t === "welcome" && welcomeB.peers.map((p) => p.name)).toEqual(["An"]);
    expect(a.got.some((m) => m.t === "join" && m.peer.name === "Bình")).toBe(true);
    b.conn.close();
    expect(a.got.at(-1)).toEqual({ t: "leave", id: (welcomeB as { id: string }).id });
  });

  it("stamps chat with the server-side name (no spoofing) and rate-limits", () => {
    let t = 0;
    const r = createRelay(() => t);
    const a = client(r), b = client(r);
    a.send({ t: "hello", name: "An", hero: "Mage" });
    b.send({ t: "hello", name: "Bình", hero: "Knight" });
    t = 5000;
    a.send({ t: "chat", text: "chào cả nhà", name: "Admin" });
    a.send({ t: "chat", text: "spam" }); // too soon
    const chats = b.got.filter((m) => m.t === "chat");
    expect(chats).toHaveLength(1);
    expect(chats[0].t === "chat" && chats[0].msg).toMatchObject({ name: "An", text: "chào cả nhà" });
  });

  it("ignores everything before hello and kicks a bad hello", () => {
    const r = createRelay();
    const a = client(r), b = client(r);
    b.send({ t: "hello", name: "Bình", hero: "Knight" });
    a.send({ t: "chat", text: "hi" });
    expect(b.got.some((m) => m.t === "chat")).toBe(false);
    a.send({ t: "hello", name: "x", hero: "Dragon" });
    expect(a.closed()).toBe(true);
  });

  it("drops oversized frames and garbage JSON", () => {
    const r = createRelay();
    const a = client(r);
    a.conn.receive("{not json");
    a.conn.receive("x".repeat(5000));
    expect(a.got).toHaveLength(0);
  });

  it("new joiners get recent chat history", () => {
    let t = 0;
    const r = createRelay(() => t);
    const a = client(r);
    a.send({ t: "hello", name: "An", hero: "Mage" });
    t = 2000; a.send({ t: "chat", text: "phim sắp chiếu" });
    const b = client(r);
    b.send({ t: "hello", name: "Bình", hero: "Knight" });
    const w = b.got.find((m) => m.t === "welcome");
    expect(w && w.t === "welcome" && w.history.map((h) => h.text)).toEqual(["phim sắp chiếu"]);
  });
});

describe("quiz", () => {
  const questions = [
    { text: "Q1", options: ["a", "b", "c", "d"], answer: 2 },
    { text: "Q2", options: ["a", "b", "c", "d"], answer: 0 },
  ];
  it("runs ask → reveal → next question for joined players, scoring right answers (faster = more)", async () => {
    const { QUIZ_ASK_MS, QUIZ_REVEAL_MS } = await import("./relay");
    let t = 0;
    const r = createRelay(() => t, { questions });
    const a = client(r), b = client(r);
    a.send({ t: "hello", name: "An", hero: "Mage" });
    b.send({ t: "hello", name: "Bình", hero: "Knight" });
    a.send({ t: "quiz", on: true });
    b.send({ t: "quiz", on: true });
    t = 1000; a.send({ t: "answer", q: 0, choice: 2 }); // right, fast
    t = 9000; b.send({ t: "answer", q: 0, choice: 2 }); // right, slower
    b.send({ t: "answer", q: 0, choice: 1 }); // second answer ignored
    t = QUIZ_ASK_MS + 1; r.tick();
    const reveal = a.got.filter((m) => m.t === "quiz").at(-1);
    expect(reveal && reveal.t === "quiz" && reveal.s).toMatchObject({ phase: "reveal", answer: 2 });
    const board = reveal && reveal.t === "quiz" ? reveal.s!.board : [];
    expect(board.map((x) => x.name)).toEqual(["An", "Bình"]);
    expect(board[0].score).toBeGreaterThan(board[1].score);
    t += QUIZ_REVEAL_MS + 1; r.tick();
    const next = b.got.filter((m) => m.t === "quiz").at(-1);
    expect(next && next.t === "quiz" && next.s).toMatchObject({ q: 1, phase: "ask" });
    expect(next && next.t === "quiz" && next.s!.answer).toBeUndefined(); // no spoilers while asking
  });
  it("rejects answers for the wrong question or out of range, and stops when nobody plays", () => {
    let t = 0;
    const r = createRelay(() => t, { questions });
    const a = client(r);
    a.send({ t: "hello", name: "An", hero: "Mage" });
    a.send({ t: "quiz", on: true });
    a.send({ t: "answer", q: 1, choice: 0 });
    a.send({ t: "answer", q: 0, choice: 9 });
    const last = a.got.filter((m) => m.t === "quiz").at(-1);
    expect(last && last.t === "quiz" && last.s!.mine).toBe(0);
    a.send({ t: "quiz", on: false });
    t = 99999; r.tick();
    expect(a.got.filter((m) => m.t === "quiz").at(-1)).toEqual({ t: "quiz", s: null });
  });
});

describe("emotes in state", () => {
  it("accepts known emotes with a counter, drops unknown ones", () => {
    expect(sanitizeState({ x: 0, z: 0, ry: 0, zone: "lobby", em: "dance", en: 3 })).toMatchObject({ em: "dance", en: 3 });
    expect(sanitizeState({ x: 0, z: 0, ry: 0, zone: "lobby", em: "nuke", en: 3 })?.em).toBeUndefined();
    expect(sanitizeState({ x: 0, z: 0, ry: 0, zone: "arcade" })?.zone).toBe("arcade");
  });
});
