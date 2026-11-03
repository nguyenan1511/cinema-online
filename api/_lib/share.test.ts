import { describe, expect, it } from "vitest";
import { createShareHandler, escapeHtml } from "./share";
import { encodeToken, type Token } from "../../shared/ticket";

const shell = `<!doctype html><html><head><title>Rạp Online</title><!--OG--></head><body><div id="root"></div></body></html>`;
const films = [{ id: 1234567, title: "Mai", posterPath: "/mai.jpg" }];
const h = createShareHandler({ films, shell });
const token: Token = { v: 1, f: 1234567, st: "1200", d: "2026-11-03", h: { s: "F6", n: "Lê O'Neil" }, r: [] };
const get = (path: string) => h(new Request(`https://dirap.example${path}`));
const meta = (html: string, prop: string) => html.match(new RegExp(`property="${prop}" content="([^"]*)"`))?.[1];

describe("/s/{token} → api/share", () => {
  it("injects absolute, escaped og tags for a valid token", async () => {
    const tok = encodeToken(token);
    const res = await get(`/api/share?t=${tok}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("Lê O&#39;Neil mời bạn xem Mai");
    expect(meta(html, "og:description")).toBe("Ghế F6 · Suất 12:00 · Ngồi cạnh Lê O&#39;Neil?");
    expect(meta(html, "og:image")).toBe(`https://dirap.example/api/stub?t=${tok}&amp;view=og`);
    expect(meta(html, "og:url")).toBe(`https://dirap.example/s/${tok}`);
    expect(meta(html, "og:image:width")).toBe("1200");
    expect(html).toContain('<div id="root"></div>');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("also reads the token from the /s/ path", async () => {
    const res = await get(`/s/${encodeToken(token)}`);
    expect(res.status).toBe(200);
  });

  it.each([["garbage", "/api/share?t=@@@"], ["missing", "/api/share"], ["unknown film", `/api/share?t=${encodeToken({ ...token, f: 1 })}`]])(
    "redirects a %s token to the booth with a toast, uncached", async (_l, path) => {
      const res = await get(path);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/?err=link");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

  it("refuses to start without the OG marker", () => {
    expect(() => createShareHandler({ films, shell: "<html></html>" })).toThrow(/OG/);
  });

  it("escapes HTML", () => expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));
});
