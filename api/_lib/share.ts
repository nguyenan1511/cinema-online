// /s/{token} → api/share: the SPA shell with per-link og:* meta, because link-preview
// crawlers (Zalo, Facebook, Messenger) do not run JavaScript (spec review R1-1).
import { decodeToken, encodeToken, formatShowtime } from "../../shared/ticket";
import type { FilmIndexEntry } from "../../shared/films";

export const OG_MARKER = "<!--OG-->";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function tokenFrom(url: URL): string {
  const q = url.searchParams.get("t");
  if (q) return q;
  const m = url.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  return m ? m[1] : "";
}

export function createShareHandler(deps: { films: FilmIndexEntry[]; shell: string }) {
  const filmById = new Map(deps.films.map((f) => [f.id, f]));
  if (!deps.shell.includes(OG_MARKER)) throw new Error("index.html is missing the <!--OG--> marker");

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const raw = tokenFrom(url);
    const t = decodeToken(raw, (f) => filmById.has(f));
    if (!t) {
      // Bad or stale link: back to the booth with a toast (state table 5A).
      return new Response(null, { status: 302, headers: { Location: "/?err=link", "Cache-Control": "no-store" } });
    }
    const film = filmById.get(t.f)!;
    const canonical = encodeToken(t);
    const origin = url.origin;
    const title = `${t.h.n} mời bạn xem ${film.title}`;
    const desc = `Ghế ${t.h.s} · Suất ${formatShowtime(t.st)} · Ngồi cạnh ${t.h.n}?`;
    // Absolute URLs (eng review A1); "&" in the query is escaped by escapeHtml (OV-6).
    const image = `${origin}/api/stub?t=${canonical}&view=og`;
    const pageUrl = `${origin}/s/${canonical}`;
    const tags = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="Rạp Online">`,
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      `<meta property="og:description" content="${escapeHtml(desc)}">`,
      `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
      `<meta property="og:image" content="${escapeHtml(image)}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    ].join("\n    ");
    // The shell's own default <title> is dropped so crawlers see one title.
    const html = deps.shell.replace(/<title>[\s\S]*?<\/title>/, "").replace(OG_MARKER, tags);
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=86400" },
    });
  };
}
