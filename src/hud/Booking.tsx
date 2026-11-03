// Booking UI ("premium kiosk"): real posters (CC BY, Wikimedia Commons), a dark kiosk sheet
// with step progress, poster rail, showtime chips and an order summary. Used by the intro
// screen and the QUẦY VÉ counter.
import { useState } from "react";
import { TMDB_IMG, type Film } from "../../shared/films";

/** Official poster: our open films' Commons poster, or TMDB's for current Vietnamese releases. */
export const posterUrl = (f: Film) => f.video?.poster ?? (f.posterPath ? `${TMDB_IMG}${f.posterPath}` : undefined);

/** Poster with a typographic fallback if the image can't load (offline, blocked). */
export function Poster({ film, className = "", eager = false }: { film: Film; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = posterUrl(film);
  return (
    <div className={`poster ${className}`}>
      {src && !failed ? (
        <img src={src} alt={`Poster ${film.title}`} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <div className="poster-fallback" aria-label={`Poster ${film.title}`}><span>{film.title}</span></div>
      )}
    </div>
  );
}

/** Poster grid (no sideways scrolling): first `initial` films, then "Xem tất cả" expands in place. */
export function PosterRail({ films, selected, onSelect, label = "Đang chiếu", initial = 8 }: { films: Film[]; selected: number; onSelect?: (id: number) => void; label?: string; initial?: number }) {
  const [all, setAll] = useState(false);
  // keep the selected film visible even when it sits beyond the first rows
  const shown = all ? films : films.slice(0, initial).concat(films.slice(initial).filter((f) => f.id === selected));
  return (
    <section aria-label={label}>
      <div className="flex items-baseline justify-between px-1">
        <p className="kicker">{label.toUpperCase()}</p>
        <p className="text-[12px] text-hall-text/55">{films.length} phim · phim Việt trước</p>
      </div>
      <ul className="poster-grid" role="listbox" aria-label="Chọn phim">
        {shown.map((f) => (
          <li key={f.id} role="option" aria-selected={f.id === selected}>
            <button className={`poster-card ${f.id === selected ? "poster-card--on" : ""}`} onClick={() => onSelect?.(f.id)} disabled={!onSelect}>
              <Poster film={f} />
              {f.vn && <span className="poster-badge">VN</span>}
              <span className="poster-title">{f.title}</span>
              <span className="poster-meta">{f.video ? `${f.video.genre} · ${f.video.minutes}′` : f.trailerKey ? "Trailer" : "Đang chiếu"}</span>
            </button>
          </li>
        ))}
      </ul>
      {films.length > initial && (
        <button className="lb-ghost w-full mt-2" onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Thu gọn" : `Xem tất cả ${films.length} phim`}
        </button>
      )}
    </section>
  );
}

/** Dark kiosk sheet with step dots, used for the ticket counter. */
export function Kiosk({ title, steps = [], step = 0, onClose, onBack, children }: { title: string; steps?: string[]; step?: number; onClose?: () => void; onBack?: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="absolute inset-x-0 bottom-0 z-30 mx-auto max-w-[560px] sheet-in">
      <div className="kiosk">
        <div className="kiosk-grip" aria-hidden />
        <header className="flex items-center gap-2">
          {onBack ? <button className="lb-btn" onClick={onBack} aria-label="Quay lại">‹</button> : <span className="w-11" />}
          <div className="flex-1 text-center">
            <p className="kicker">{title}</p>
            {steps.length > 0 && (
              <ol className="kiosk-steps" aria-label={`Bước ${step + 1}/${steps.length}`}>
                {steps.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>{s}</li>)}
              </ol>
            )}
          </div>
          {onClose ? <button className="lb-btn" onClick={onClose} aria-label="Đóng">✕</button> : <span className="w-11" />}
        </header>
        <div className="kiosk-body">{children}</div>
      </div>
    </div>
  );
}

export function FilmDetail({ film, room }: { film: Film; room: number }) {
  return (
    <div className="flex gap-3 items-start">
      <Poster film={film} className="w-[84px] shrink-0 rounded-[10px]" />
      <div className="min-w-0">
        <p className="font-[family-name:var(--font-display)] text-[20px] leading-tight">{film.title}</p>
        {film.video ? (
          <>
            <p className="mt-1 text-[12px] font-bold tracking-wide text-hall-text/65 uppercase">{film.video.genre} · {film.video.minutes} phút · {film.releaseDate.slice(0, 4)} · Phòng {room}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-hall-text/85">{film.video.blurb}</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[12px] font-bold tracking-wide text-hall-text/65 uppercase">Khởi chiếu {film.releaseDate.split("-").reverse().join("/")} · Phòng {room}</p>
            <p className="mt-1.5 text-[14px] leading-snug text-hall-text/85">{film.trailerKey ? "Đang chiếu ngoài rạp. Vào phòng để xem trailer chính thức trên màn hình lớn." : "Đang chiếu ngoài rạp."}</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Minimal QR-looking code drawn from the ticket token (decorative; the real link is the share URL). */
export function TicketCode({ seed }: { seed: string }) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const cells: boolean[] = [];
  for (let i = 0; i < 21 * 21; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; cells.push((h & 3) === 0); }
  const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  return (
    <svg viewBox="0 0 21 21" className="ticket-code" aria-hidden shapeRendering="crispEdges">
      <rect width="21" height="21" fill="#fff" />
      {cells.map((on, i) => {
        const x = i % 21, y = Math.floor(i / 21);
        if (finder(x, y)) return null;
        return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#111" /> : null;
      })}
      {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => (
        <g key={`${x}-${y}`}><rect x={x} y={y} width="7" height="7" fill="#111" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#111" /></g>
      ))}
    </svg>
  );
}
