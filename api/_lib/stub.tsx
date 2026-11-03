// Ticket + invite-card renderer behind /api/stub (eng T3/T8, design 8A, DT5).
// Pure factory so tests can inject fonts, films, poster fetch and the clock.
import { ImageResponse } from "@vercel/og";
import qrcode from "qrcode-generator";
import {
  COMBO_LABELS, decodeMe, decodeToken, encodeToken, formatShowtime, maskProfanity, neighborLine,
  PERFORATION_RATIO, reshare, seatConflict, stockBand, type Me, type Token,
} from "../../shared/ticket";
import { TMDB_IMG, type FilmIndexEntry } from "../../shared/films";

export interface StubDeps {
  films: FilmIndexEntry[];
  loadFonts: () => Promise<{ bold: ArrayBuffer; medium: ArrayBuffer }>;
  fetchPoster?: (url: string) => Promise<ArrayBuffer | null>;
}

const C = {
  hall: "#2B1216", velvet: "#6E1F2A", ink: "#2A2320", stamp: "#C8372D", bulb: "#F2C14E",
  hallText: "#F6E9E4", hallText2: "#C9A9A6",
  stock: { matinee: "#F3E3A1", evening: "#F4C9C4", late: "#CFE8D5" } as const,
};

const ALLOWED_PARAMS = new Set(["t", "me", "view"]);
const IMMUTABLE = "public, max-age=3600, s-maxage=31536000, immutable";
const SHORT = "public, max-age=60, s-maxage=300";

function hashCode(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).toUpperCase().slice(-4).padStart(4, "0");
}

function viDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function toDataUrl(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  const type = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0x52 && bytes[8] === 0x57 ? "image/webp" : "image/jpeg";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

export async function defaultFetchPoster(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** The viewer's own invite link, printed as the ticket QR (eng review D5). */
export function shareUrlFor(origin: string, t: Token, me: Me): string {
  return `${origin}/s/${encodeToken(reshare(t, me))}`;
}

function errorResponse(code: string): Response {
  return new Response(`invalid: ${code}`, {
    status: 400,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "X-Stub-Error": code },
  });
}

export function createStubHandler(deps: StubDeps) {
  const filmById = new Map(deps.films.map((f) => [f.id, f]));
  const fetchPoster = deps.fetchPoster ?? defaultFetchPoster;

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Canonical cache key: only t, me, view (eng re-run OV-9).
    for (const k of url.searchParams.keys()) if (!ALLOWED_PARAMS.has(k)) return errorResponse("param");
    const view = url.searchParams.get("view") ?? "og";
    if (view !== "og" && view !== "ticket") return errorResponse("view");
    const t = decodeToken(url.searchParams.get("t") ?? "", (f) => filmById.has(f));
    if (!t) return errorResponse("token");
    const film = filmById.get(t.f)!;

    let me: Me | null = null;
    const meParam = url.searchParams.get("me");
    if (view === "ticket") {
      me = meParam ? decodeMe(meParam) : null;
      if (!me) return errorResponse("me");
      if (seatConflict(t, me.s)) return errorResponse("seat_conflict"); // client → seat map (D21)
    } else if (meParam !== null) {
      return errorResponse("param");
    }

    let poster: string | null = null;
    let posterFailed = false;
    if (film.posterPath) {
      const buf = await fetchPoster(TMDB_IMG + film.posterPath);
      if (buf) poster = toDataUrl(buf);
      else posterFailed = true;
    }

    const fonts = await deps.loadFonts();
    const options = {
      fonts: [
        { name: "BVP", data: fonts.bold, weight: 800 as const, style: "normal" as const },
        { name: "BVP", data: fonts.medium, weight: 500 as const, style: "normal" as const },
      ],
    };
    // ImageResponse sets its own immutable Cache-Control; override it so a poster-fail
    // render is never pinned at the CDN (eng review A2).
    const withCache = (img: Response) => {
      const headers = new Headers(img.headers);
      headers.set("Cache-Control", posterFailed ? SHORT : IMMUTABLE);
      return new Response(img.body, { status: img.status, headers });
    };

    if (view === "og") {
      return withCache(new ImageResponse(<InviteCard t={t} title={film.title} poster={poster} />, { width: 1200, height: 630, ...options }));
    }
    const shareUrl = shareUrlFor(url.origin, t, me!);
    return withCache(new ImageResponse(
      <Ticket t={t} me={me!} title={film.title} poster={poster} qr={qrDataUrl(shareUrl)} host={url.host} code={hashCode(shareUrl)} />,
      { width: 1080, height: 1350, ...options },
    ));
  };
}

// ---------- layouts (Satori: flexbox only, every multi-child div needs display:flex) ----------

function InviteCard({ t, title, poster }: { t: Token; title: string; poster: string | null }) {
  const host = maskProfanity(t.h.n);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.hall, fontFamily: "BVP", padding: 56, gap: 48 }}>
      {poster ? (
        <img src={poster} width={340} height={510} style={{ borderRadius: 2, objectFit: "cover" }} />
      ) : (
        <div style={{ width: 340, height: 510, display: "flex", alignItems: "center", justifyContent: "center", background: C.velvet, color: C.hallText, fontSize: 40, fontWeight: 800, padding: 24, textAlign: "center" }}>{title}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 20 }}>
        <div style={{ color: C.hallText2, fontSize: 30, fontWeight: 500 }}>{`RẠP ONLINE · Suất ${formatShowtime(t.st)} · ${viDate(t.d)}`}</div>
        <div style={{ color: C.hallText, fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{`${host} mời bạn xem ${title}`}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
          <div style={{ border: `5px solid ${C.stamp}`, color: C.stamp, background: C.stock[stockBand(t.st)], fontSize: 44, fontWeight: 800, padding: "6px 20px", transform: "rotate(-4deg)", whiteSpace: "nowrap", flexShrink: 0 }}>{`GHẾ ${t.h.s}`}</div>
          <div style={{ color: C.bulb, fontSize: 40, fontWeight: 800 }}>{`Ngồi cạnh ${host}?`}</div>
        </div>
      </div>
    </div>
  );
}

function Ticket(p: { t: Token; me: Me; title: string; poster: string | null; qr: string; host: string; code: string }) {
  const { t, me } = p;
  const lines = neighborLine(t, me.s);
  const perfY = Math.round(1350 * PERFORATION_RATIO);
  const stock = C.stock[stockBand(t.st)];
  const combo = COMBO_LABELS[me.c];
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: stock, fontFamily: "BVP", color: C.ink, position: "relative" }}>
      {/* main part */}
      <div style={{ height: perfY, display: "flex", flexDirection: "column", padding: "64px 72px 48px", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, fontWeight: 500 }}>
          <div style={{ fontWeight: 800, letterSpacing: 2 }}>RẠP ONLINE</div>
          <div>{`Suất ${formatShowtime(t.st)} · ${viDate(t.d)}`}</div>
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 14 }}>
            <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{p.title}</div>
            <div style={{ display: "flex", marginTop: 18 }}>
              <div style={{ border: `7px solid ${C.stamp}`, color: C.stamp, fontSize: 76, fontWeight: 800, padding: "4px 28px", transform: "rotate(-4deg)" }}>{`GHẾ ${me.s}`}</div>
            </div>
            {lines.nextTo ? <div style={{ fontSize: 40, fontWeight: 800, marginTop: 18 }}>{maskProfanity(lines.nextTo)}</div> : null}
            {lines.invitedBy ? <div style={{ fontSize: 34, fontWeight: 500 }}>{`Được mời bởi ${maskProfanity(lines.invitedBy)}`}</div> : null}
          </div>
          {p.poster ? <img src={p.poster} width={240} height={360} style={{ borderRadius: 2, objectFit: "cover" }} /> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 10, fontSize: 34, fontWeight: 500 }}>
          <div>{`Khách: ${maskProfanity(me.n)}`}</div>
          {combo ? <div>{combo}</div> : null}
          {me.w ? <div style={{ fontWeight: 800 }}>{`“${maskProfanity(me.w)}”`}</div> : null}
        </div>
      </div>
      {/* perforation at PERFORATION_RATIO */}
      <div style={{ position: "absolute", top: perfY - 2, left: 0, width: "100%", borderTop: `4px dashed ${C.ink}`, opacity: 0.5 }} />
      <div style={{ position: "absolute", top: perfY - 24, left: -24, width: 48, height: 48, borderRadius: 24, background: C.hall }} />
      <div style={{ position: "absolute", top: perfY - 24, right: -24, width: 48, height: 48, borderRadius: 24, background: C.hall }} />
      {/* stub part: QR back to the viewer's own invite link (eng review D5) */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 72px", gap: 40 }}>
        <img src={p.qr} width={260} height={260} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{`Quét để ngồi cạnh ${maskProfanity(me.n)}`}</div>
          <div style={{ fontSize: 34, fontWeight: 500 }}>{p.host}</div>
          <div style={{ fontSize: 30, fontWeight: 500, opacity: 0.7 }}>{`#${p.code}`}</div>
        </div>
      </div>
    </div>
  );
}
