import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStubHandler, shareUrlFor } from "./stub";
import { decodeToken, encodeMe, encodeToken, reshare, type Me, type Token } from "../../shared/ticket";

const font = (n: string) => readFileSync(new URL(`../../fonts/BeVietnamPro-${n}.ttf`, import.meta.url)).buffer as ArrayBuffer;
const fonts = { bold: font("ExtraBold"), medium: font("Medium") };
const films = [
  { id: 1234567, title: "Mai", posterPath: "/mai.jpg" },
  { id: 7654321, title: "Lật Mặt 8", posterPath: null },
];
const OUT = process.env.STUB_PREVIEW_DIR;

const token: Token = { v: 1, f: 1234567, st: "1930", d: "2026-11-03", h: { s: "F6", n: "Nguyễn Văn Linh" }, r: [["F4", "Mi"]] };
const me: Me = { s: "F5", n: "Phương", w: "Mong năm nay bớt deadline", c: "caramel" };

function handler(poster: "ok" | "fail" = "ok") {
  const tiny = readFileSync(new URL("./fixtures/poster.png", import.meta.url));
  return createStubHandler({
    films,
    loadFonts: async () => fonts,
    fetchPoster: async () => (poster === "ok" ? tiny.buffer.slice(tiny.byteOffset, tiny.byteOffset + tiny.byteLength) as ArrayBuffer : null),
  });
}
const call = (h: ReturnType<typeof handler>, qs: string) => h(new Request(`https://dirap.example/api/stub?${qs}`));
const t = encodeURIComponent(encodeToken(token));
const m = encodeURIComponent(encodeMe(me));

async function save(res: Response, name: string) {
  const buf = Buffer.from(await res.arrayBuffer());
  if (OUT) { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${name}.png`, buf); }
  return buf;
}

describe("/api/stub", () => {
  it("renders the ticket PNG (1080×1350) with immutable caching", async () => {
    const res = await call(handler(), `t=${t}&me=${m}&view=ticket`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const buf = await save(res, "ticket-1930");
    expect(buf.readUInt32BE(16)).toBe(1080);
    expect(buf.readUInt32BE(20)).toBe(1350);
  });

  it("renders the og invite card (1200×630)", async () => {
    const res = await call(handler(), `t=${t}&view=og`);
    expect(res.status).toBe(200);
    const buf = await save(res, "og");
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("falls back to a text-only ticket with a short cache when the poster fetch fails", async () => {
    const res = await call(handler("fail"), `t=${t}&me=${m}&view=ticket`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
    expect(res.headers.get("cache-control")).not.toContain("immutable");
    await save(res, "ticket-no-poster");
  });

  it("renders the other showtime stocks and a poster-less film", async () => {
    for (const st of ["1200", "2200"] as const) {
      const tk = encodeURIComponent(encodeToken({ ...token, st, f: 7654321 }));
      const res = await call(handler(), `t=${tk}&me=${m}&view=ticket`);
      expect(res.status).toBe(200);
      await save(res, `ticket-${st}`);
    }
  });

  it.each([
    ["an unknown param", `t=${t}&me=${m}&view=ticket&x=1`, "param"],
    ["a bad view", `t=${t}&view=png`, "view"],
    ["a bad token", `t=nope&view=og`, "token"],
    ["an unknown film", `t=${encodeURIComponent(encodeToken({ ...token, f: 42 }))}&view=og`, "token"],
    ["a ticket without me", `t=${t}&view=ticket`, "me"],
    ["me on the og view", `t=${t}&me=${m}&view=og`, "param"],
    ["a taken seat", `t=${t}&me=${encodeURIComponent(encodeMe({ ...me, s: "F4" }))}&view=ticket`, "seat_conflict"],
    ["a name with a link", `t=${t}&me=${encodeURIComponent(encodeMe({ ...me, n: "www.x.vn" }))}&view=ticket`, "me"],
  ])("rejects %s with a no-store 400", async (_l, qs, code) => {
    const res = await call(handler(), qs);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-stub-error")).toBe(code);
  });

  it("the QR on the ticket encodes the viewer's own re-share link (D5)", () => {
    const url = shareUrlFor("https://dirap.example", token, me);
    expect(url).toBe(`https://dirap.example/s/${encodeToken(reshare(token, me))}`);
    const next = decodeToken(url.split("/s/")[1])!;
    expect(next.h).toEqual({ s: "F5", n: "Phương" });
    expect(next.r).toEqual([["F4", "Mi"], ["F6", "Li"]]);
  });
});
