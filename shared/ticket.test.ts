import { describe, expect, it } from "vitest";
import {
  adjacent, decodeMe, decodeToken, encodeMe, encodeToken, formatShowtime, initials, maskProfanity,
  MAX_TOKEN_CHARS, mintOrigin, neighborLine, nextShowDate, reshare, screeningPassed, seatConflict,
  stockBand, validateName, validateWish, type Me, type Token,
} from "./ticket";

const base: Token = { v: 1, f: 1234567, st: "1930", d: "2026-11-02", h: { s: "F6", n: "Linh" }, r: [["F4", "Mi"]] };
const me = (s: string, n = "Minh", c: Me["c"] = "caramel"): Me => ({ s, n, c });

describe("encode/decode", () => {
  it("round-trips Vietnamese names over UTF-8 (btoa on raw text throws, SC-1)", () => {
    const t = { ...base, h: { s: "F6", n: "Nguyễn Thị Phương Ân" } };
    const tok = encodeToken(t);
    expect(tok).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeToken(tok)).toEqual(t);
  });

  it("decode-compat pin: a v1 token minted today must keep decoding forever", () => {
    const PINNED = "eyJ2IjoxLCJmIjoxMjM0NTY3LCJzdCI6IjE5MzAiLCJkIjoiMjAyNi0xMS0wMiIsImgiOnsicyI6IkY2IiwibiI6IkxpbmgifSwiciI6W1siRjQiLCJNaSJdXX0";
    expect(encodeToken(base)).toBe(PINNED);
    expect(decodeToken(PINNED)).toEqual(base);
  });

  it("keeps the worst case (8 entries, 20-grapheme host) under 320 chars (R2)", () => {
    const t: Token = { ...base, f: 9999999, st: "2200", h: { s: "H12", n: "Nguyễn Thị Phương Ân" },
      r: Array.from({ length: 8 }, (_, i) => [`H${i + 1}`, "Ữở"] as [string, string]) };
    const tok = encodeToken(t);
    expect(tok.length).toBeLessThanOrEqual(MAX_TOKEN_CHARS);
    expect(decodeToken(tok)!.r).toHaveLength(8);
  });

  it("caps r at 8 and drops the oldest first", () => {
    const r = Array.from({ length: 10 }, (_, i) => [`A${i + 1}`, "Ab"] as [string, string]);
    const out = decodeToken(encodeToken({ ...base, r }))!;
    expect(out.r.map(([s]) => s)).toEqual(["A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"]);
  });

  it.each([
    ["garbage", "!!!"],
    ["not json", "bm90IGpzb24"],
    ["too long", "A".repeat(MAX_TOKEN_CHARS + 1)],
  ])("rejects %s", (_l, s) => expect(decodeToken(s)).toBeNull());

  it.each([
    ["wrong version", { ...base, v: 2 }],
    ["off-grid showtime", { ...base, st: "1810" }],
    ["too-early showtime", { ...base, st: "0730" }],
    ["impossible showtime", { ...base, st: "2460" }],
    ["bad seat", { ...base, h: { s: "Z99", n: "Linh" } }],
    ["seat 17", { ...base, h: { s: "A17", n: "Linh" } }],
    ["row M", { ...base, h: { s: "M3", n: "Linh" } }],
    ["url as name", { ...base, h: { s: "F6", n: "www.scam.vn" } }],
    ["masked name", { ...base, h: { s: "F6", n: "***" } }],
    ["bad o", { ...base, o: 2 }],
  ])("rejects a token with %s", (_l, obj) => {
    expect(decodeToken(encodeToken(obj as Token))).toBeNull();
  });

  it("rejects unknown films when a lookup is given", () => {
    const tok = encodeToken(base);
    expect(decodeToken(tok, (f) => f === 1)).toBeNull();
    expect(decodeToken(tok, (f) => f === 1234567)).not.toBeNull();
  });

  it("drops duplicate seats, first wins (host first)", () => {
    const out = decodeToken(encodeToken({ ...base, r: [["F6", "Xx"], ["F4", "Mi"], ["F4", "Yy"]] }))!;
    expect(out.r).toEqual([["F4", "Mi"]]);
  });
});

describe("input rules", () => {
  it("NFC-normalizes NFD input from combining-mark keyboards (OV-3)", () => {
    const nfd = "Nguyễn Văn Linh".normalize("NFD");
    const v = validateName(nfd);
    expect(v).toEqual({ ok: true, value: "Nguyễn Văn Linh" });
  });

  it("counts graphemes, not UTF-16 units", () => {
    expect(validateName("Ữ".repeat(20)).ok).toBe(true);
    expect(validateName("Ữ".repeat(21)).ok).toBe(false);
    expect(validateName("Ữ".repeat(20).normalize("NFD")).ok).toBe(true);
  });

  it.each(["", "   ", "linh.com", "a@b", "https://x", "Linh123"])("rejects name %j", (n) => {
    expect(validateName(n).ok).toBe(false);
  });

  it("strips emoji and control characters before validating", () => {
    expect(validateName("Linh 🎬\u0007")).toEqual({ ok: true, value: "Linh" });
  });

  it("validates wishes: optional, 60 graphemes, no links", () => {
    expect(validateWish(undefined)).toEqual({ ok: true, value: "" });
    expect(validateWish("Mong năm nay bớt deadline!").ok).toBe(true);
    expect(validateWish("x".repeat(61)).ok).toBe(false);
    expect(validateWish("xem tại www.x.vn").ok).toBe(false);
  });

  it("masks profanity only at render time; masked text never validates as a name", () => {
    expect(maskProfanity("đụ má")).toBe("*** má");
    expect(maskProfanity("Đức")).toBe("Đức");
    expect(validateName(maskProfanity("đụ")).ok).toBe(false);
  });
});

describe("initials (D9)", () => {
  it.each([
    ["Nguyễn Văn Linh", "Li"],
    ["Trần Thị Mai", "Ma"],
    ["Tú", "Tú"],
    ["Ữở".normalize("NFD"), "Ữở"],
  ])("%s → %s", (n, want) => expect(initials(n)).toBe(want));
});

describe("reshare", () => {
  it("makes me the host and moves the previous host into r with initials", () => {
    const next = reshare({ ...base, h: { s: "F6", n: "Nguyễn Văn Linh" } }, me("F7"));
    expect(next.h).toEqual({ s: "F7", n: "Minh" });
    expect(next.r).toEqual([["F4", "Mi"], ["F6", "Li"]]);
    expect(next.o).toBeUndefined();
  });

  it("an origin token re-shares without duplicating the viewer and drops o", () => {
    const origin = mintOrigin(1234567, "1200", new Date("2026-11-02T01:00:00Z"), { s: "E6", n: "Linh" });
    const next = reshare(origin, { s: "E6", n: "Linh", c: "none" });
    expect(next.o).toBeUndefined();
    expect(next.h).toEqual({ s: "E6", n: "Linh" });
    expect(next.r).toEqual([]);
  });

  it("keeps f, st and d unchanged and respects the cap", () => {
    const full: Token = { ...base, r: Array.from({ length: 8 }, (_, i) => [`B${i + 1}`, "Ab"] as [string, string]) };
    const next = reshare(full, me("F7"));
    expect([next.f, next.st, next.d]).toEqual([base.f, base.st, base.d]);
    expect(next.r).toHaveLength(8);
    expect(next.r.at(-1)).toEqual(["F6", "Li"]);
    expect(next.r[0][0]).toBe("B2");
  });
});

describe("seats and neighbor lines", () => {
  it("treats the 8|9 centre aisle as not adjacent", () => {
    expect(adjacent("F5", "F6")).toBe(true);
    expect(adjacent("F6", "F7")).toBe(true);
    expect(adjacent("F8", "F9")).toBe(false);
    expect(adjacent("L15", "L16")).toBe(true);
    expect(adjacent("F6", "G6")).toBe(false);
  });

  it("names the host when next to the host, even if an r seat is also adjacent", () => {
    const t: Token = { ...base, h: { s: "F5", n: "Linh" }, r: [["F3", "Mi"]] };
    expect(neighborLine(t, "F4")).toEqual({ invitedBy: "Linh", nextTo: "cạnh Linh (F5)" });
  });

  it("names an r neighbor by initials; lower seat number wins between two", () => {
    const t: Token = { ...base, h: { s: "A1", n: "Linh" }, r: [["F5", "Tú"], ["F3", "Mi"]] };
    expect(neighborLine(t, "F4")).toEqual({ invitedBy: "Linh", nextTo: "cạnh Mi (F3)" });
  });

  it("prints only the invite line when not next to anyone", () => {
    expect(neighborLine(base, "A1")).toEqual({ invitedBy: "Linh" });
  });

  it("prints nothing for an origin ticket (o:1)", () => {
    expect(neighborLine({ ...base, o: 1 }, "F5")).toEqual({});
  });

  it("detects seat conflicts (OV-11) but not the viewer's own origin seat", () => {
    expect(seatConflict(base, "F6")).toBe(true);
    expect(seatConflict(base, "F4")).toBe(true);
    expect(seatConflict(base, "F7")).toBe(false);
    expect(seatConflict({ ...base, o: 1, r: [] }, "F6")).toBe(false);
  });
});

describe("dates (R4)", () => {
  // UTC+7: 04:59Z = 11:59 local
  it.each([
    ["2026-11-02T04:59:00Z", "1200", "2026-11-02"],
    ["2026-11-02T05:00:00Z", "1200", "2026-11-03"],
    ["2026-11-02T05:01:00Z", "1200", "2026-11-03"],
    ["2026-11-02T16:30:00Z", "2200", "2026-11-03"], // 23:30 local
    ["2026-11-02T17:30:00Z", "1200", "2026-11-03"], // 00:30 local next day, before noon
    ["2026-12-31T16:00:00Z", "1930", "2027-01-01"], // 23:00 local on Dec 31
  ])("now=%s st=%s → %s", (now, st, want) => {
    expect(nextShowDate(st as Token["st"], new Date(now))).toBe(want);
  });

  it("knows when a screening has passed", () => {
    expect(screeningPassed({ d: "2026-11-02", st: "1200" }, new Date("2026-11-02T04:59:00Z"))).toBe(false);
    expect(screeningPassed({ d: "2026-11-02", st: "1200" }, new Date("2026-11-02T05:00:00Z"))).toBe(true);
  });

  it("formats showtimes", () => expect(formatShowtime("1930")).toBe("19:30"));

  it("accepts any 15-minute showtime 08:00-23:45 and bands the ticket stock", () => {
    expect(decodeToken(encodeToken({ ...base, st: "0845" }))?.st).toBe("0845");
    expect(decodeToken(encodeToken({ ...base, st: "2345" }))?.st).toBe("2345");
    expect([stockBand("0900"), stockBand("1659"), stockBand("1700"), stockBand("2100")]).toEqual(["matinee", "matinee", "evening", "late"]);
  });
});

describe("me param", () => {
  it("round-trips and validates", () => {
    const m: Me = { s: "F7", n: "Phương", w: "Mong năm nay bớt deadline", c: "phomai" };
    expect(decodeMe(encodeMe(m))).toEqual(m);
  });
  it("rejects bad combos and unclean names", () => {
    expect(decodeMe(encodeMe({ s: "F7", n: "Linh", c: "beer" as Me["c"] }))).toBeNull();
    expect(decodeMe(encodeMe({ s: "F7", n: "  Linh  ", c: "none" }))).toBeNull();
  });
});
