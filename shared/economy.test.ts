import { describe, expect, it } from "vitest";
import { CLAW_REACH, claimOnce, earn, emptyWallet, grabChance, mulberry32, parseWallet, PINS, rollGacha, spend, START_COINS } from "./economy";

describe("wallet", () => {
  it("spends only what you have", () => {
    const w = emptyWallet();
    expect(spend(w, 2)?.coins).toBe(START_COINS - 2);
    expect(spend({ ...w, coins: 1 }, 2)).toBeNull();
    expect(spend(w, -1)).toBeNull();
    expect(spend(w, 1.5)).toBeNull();
  });
  it("earns up to a cap and ignores negatives", () => {
    expect(earn({ ...emptyWallet(), coins: 98 }, 5).coins).toBe(99);
    expect(earn(emptyWallet(), -3).coins).toBe(START_COINS);
  });
  it("one-time rewards are claimed once", () => {
    const a = claimOnce(emptyWallet(), "film:910001", 3);
    expect(a.coins).toBe(START_COINS + 3);
    expect(claimOnce(a, "film:910001", 3)).toBe(a);
  });
  it("parses tampered storage defensively", () => {
    const w = parseWallet({ coins: 1e9, plush: ["gau-nau", "<script>", 5], pins: ["rong", "fake"], seen: "x" });
    expect(w).toEqual({ coins: 99, plush: ["gau-nau"], pins: ["rong"], seen: [] });
    expect(parseWallet(null).coins).toBe(START_COINS);
    expect(parseWallet({ coins: NaN }).coins).toBe(START_COINS);
  });
});

describe("claw odds", () => {
  it("is best dead centre and zero out of reach", () => {
    expect(grabChance(0)).toBeCloseTo(0.75);
    expect(grabChance(CLAW_REACH)).toBeCloseTo(0.1);
    expect(grabChance(CLAW_REACH + 0.01)).toBe(0);
    expect(grabChance(NaN)).toBe(0);
  });
});

describe("gacha", () => {
  it("only returns real pins and respects rarity weights", () => {
    const rand = mulberry32(42);
    const counts = { "thường": 0, "hiếm": 0, "siêu hiếm": 0 };
    for (let i = 0; i < 10000; i++) {
      const p = rollGacha(rand);
      expect(PINS).toContain(p);
      counts[p.rarity]++;
    }
    expect(counts["thường"] / 10000).toBeGreaterThan(0.66);
    expect(counts["thường"] / 10000).toBeLessThan(0.74);
    expect(counts["siêu hiếm"] / 10000).toBeGreaterThan(0.03);
    expect(counts["siêu hiếm"] / 10000).toBeLessThan(0.07);
  });
});
