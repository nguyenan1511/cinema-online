// Gate build (Next Steps 1-5): booth / invite landing → seat → combo → printed ticket → share.
// The full ritual (lights dim, tear, own-row view, resume) lands after the Zalo gate.
import { useEffect, useMemo, useState } from "react";
import filmsData from "../data/films.json";
import type { Film } from "../shared/films";
import { TMDB_IMG } from "../shared/films";
import {
  adjacent, COMBO_LABELS, initials, decodeToken, encodeMe, encodeToken, formatShowtime, mintOrigin, neighborLine,
  occupiedSeats, reshare, screeningPassed, SHOWTIMES, validateName, validateWish,
  type Combo, type Me, type Showtime, type Token,
} from "../shared/ticket";
import { saveMyTicket } from "./lib/clientStore";

export const films = filmsData as Film[];
export const filmById = new Map(films.map((f) => [f.id, f]));
import { AISLE_AFTER, COLS, ROWS } from "../shared/seats";
type Step = "entry" | "seat" | "popcorn" | "stub";

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(id);
  }, [msg]);
  const node = msg ? (
    <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-hall border border-hall-text-2/40 text-hall-text px-4 py-3 text-base font-medium shadow-[0_6px_16px_rgba(0,0,0,.35)]">{msg}</div>
  ) : null;
  return [node, setMsg] as const;
}

export function readInvite(): Token | null {
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)\/?$/);
  return m ? decodeToken(m[1], (f) => filmById.has(f)) : null;
}

export function App() {
  const invite = useMemo(readInvite, []);
  const [toast, setToast] = useToast();
  const [step, setStep] = useState<Step>("entry");
  const [filmId, setFilmId] = useState<number>(invite?.f ?? films.find((f) => f.nowPlaying)?.id ?? 0);
  const [st, setSt] = useState<Showtime>(invite?.st ?? "1930");
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [combo, setCombo] = useState<Combo | null>(null);
  const [wish, setWish] = useState("");
  const [ticket, setTicket] = useState<{ t: Token; me: Me } | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("err") === "link" || (location.pathname.startsWith("/s/") && !invite)) {
      setToast("Link vé không hợp lệ");
      history.replaceState(null, "", "/");
    }
  }, [invite, setToast]);

  const film = filmById.get(filmId);
  if (!film) return <Empty />;

  const submitName = () => {
    const v = validateName(name);
    if (!v.ok) return setNameErr("Tên chỉ gồm chữ cái, tối đa 20 ký tự");
    setName(v.value);
    setNameErr(null);
    setStep("seat");
  };

  const print = () => {
    const w = validateWish(wish);
    const me: Me = { s: seat!, n: name, c: combo ?? "none", ...(w.ok && w.value ? { w: w.value } : {}) };
    const t = invite ?? mintOrigin(film.id, st, new Date(), { s: seat!, n: name });
    saveMyTicket({ f: t.f, d: t.d, st: t.st, seat: me.s, name: me.n, token: encodeToken(t), me: encodeMe(me) });
    setTicket({ t, me });
    setStep("stub");
  };

  return (
    <main className={`mx-auto min-h-dvh flex flex-col ${step === "seat" ? "max-w-[600px]" : "max-w-[430px]"}`}>
      {toast}
      {step === "entry" && (invite
        ? <InviteLanding t={invite} film={film} name={name} setName={setName} nameErr={nameErr} onNext={submitName} />
        : <Booth filmId={filmId} setFilmId={setFilmId} st={st} setSt={setSt} name={name} setName={setName} nameErr={nameErr} onNext={submitName} />)}
      {step === "seat" && <SeatMap t={invite} seat={seat} setSeat={setSeat} onNext={() => setStep("popcorn")} />}
      {step === "popcorn" && <Popcorn combo={combo} setCombo={setCombo} wish={wish} setWish={setWish} onNext={print} />}
      {step === "stub" && ticket && (
        <Stub t={ticket.t} me={ticket.me} toast={setToast} onSeatConflict={() => { setSeat(null); setStep("seat"); setToast("Ghế vừa có người, chọn ghế khác"); }} />
      )}
    </main>
  );
}

function Empty() {
  return <main className="min-h-dvh grid place-items-center p-8 text-center text-hall-text-2">Rạp đang thay phim, quay lại sau nhé</main>;
}

export function Poster({ film, className }: { film: Film; className: string }) {
  return film.posterPath
    ? <img src={TMDB_IMG + film.posterPath} alt={`Poster phim ${film.title}`} className={`${className} object-cover rounded-[2px]`} />
    : <div className={`${className} bg-velvet grid place-items-center p-4 text-center font-extrabold text-xl`}>{film.title}</div>;
}

export function Cta({ children, disabled, onClick }: { children: string; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="sticky bottom-0 bg-hall pt-3 pb-[max(16px,env(safe-area-inset-bottom))] px-4">
      <button disabled={disabled} onClick={onClick} className="w-full h-[52px] bg-bulb text-ink font-extrabold text-base active:brightness-90 disabled:opacity-40">{children}</button>
    </div>
  );
}

export function NameField({ name, setName, err }: { name: string; setName: (v: string) => void; err: string | null }) {
  return (
    <label className="block px-4 mt-6">
      <span className="block text-[13px] font-medium text-hall-text-2 mb-2">Tên in trên vé</span>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name"
        className="w-full h-12 px-3 bg-velvet text-hall-text text-base outline-none" />
      {err && <span className="block mt-2 text-stamp-on-hall text-base">{err}</span>}
    </label>
  );
}

function Booth(p: { filmId: number; setFilmId: (n: number) => void; st: Showtime; setSt: (s: Showtime) => void; name: string; setName: (v: string) => void; nameErr: string | null; onNext: () => void }) {
  const showing = films.filter((f) => f.nowPlaying);
  const film = filmById.get(p.filmId)!;
  return (
    <>
      <header className="px-4 pt-6 font-extrabold tracking-wide">RẠP ONLINE</header>
      <section className="px-4 mt-4">
        <Poster film={film} className="w-full h-[34dvh]" />
        <div className="bg-hall mt-3"><h1 className="text-[32px] leading-tight font-extrabold">{film.title}</h1></div>
      </section>
      {showing.length > 1 && (
        <nav aria-label="Phim đang chiếu" className="mt-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {showing.map((f) => (
            <button key={f.id} onClick={() => p.setFilmId(f.id)} aria-pressed={f.id === p.filmId}
              className={`shrink-0 w-24 text-left ${f.id === p.filmId ? "outline-2 outline-bulb" : ""}`}>
              <Poster film={f} className="w-24 h-36 text-[13px]" />
            </button>
          ))}
        </nav>
      )}
      <div className="px-4 mt-4 flex gap-2" role="radiogroup" aria-label="Suất chiếu">
        {SHOWTIMES.map((s) => (
          <button key={s} role="radio" aria-checked={s === p.st} onClick={() => p.setSt(s)}
            className={`h-10 px-4 rounded-full bg-velvet text-base font-medium ${s === p.st ? "outline-2 outline-bulb" : ""}`}>
            {formatShowtime(s)}{s === "1200" ? " trưa" : ""}
          </button>
        ))}
      </div>
      <NameField name={p.name} setName={p.setName} err={p.nameErr} />
      <div className="flex-1" />
      <Cta disabled={!p.name.trim()} onClick={p.onNext}>Mua vé</Cta>
    </>
  );
}

function InviteLanding(p: { t: Token; film: Film; name: string; setName: (v: string) => void; nameErr: string | null; onNext: () => void }) {
  const passed = screeningPassed(p.t, new Date());
  return (
    <>
      <section className="px-4 pt-8">
        <h1 className="text-[24px] leading-snug font-extrabold">{`${p.t.h.n} mời bạn xem ${p.film.title}`}</h1>
        <Poster film={p.film} className="w-40 aspect-[2/3] mt-4" />
        <p className="mt-4 text-hall-text-2">{`Ghế ${p.t.h.s} · Suất ${formatShowtime(p.t.st)} · ${p.t.d.split("-").reverse().join("/")}`}</p>
        {passed && <p className="mt-3 text-notice font-medium">Suất đã chiếu · vẫn còn ghế cho bạn</p>}
      </section>
      <NameField name={p.name} setName={p.setName} err={p.nameErr} />
      <div className="flex-1" />
      <Cta disabled={!p.name.trim()} onClick={p.onNext}>Vào rạp</Cta>
    </>
  );
}

function SeatMap({ t, seat, setSeat, onNext }: { t: Token | null; seat: string | null; setSeat: (s: string) => void; onNext: () => void }) {
  const taken = useMemo(() => {
    const m = new Map<string, string>();
    if (t) { m.set(t.h.s, initials(t.h.n)); for (const [s, ini] of t.r) m.set(s, ini); }
    return m;
  }, [t]);
  const occupied = t ? occupiedSeats(t) : new Set<string>();
  const focus = t?.h.s ?? "E6";
  useEffect(() => {
    document.getElementById(`seat-${focus}`)?.scrollIntoView({ block: "center", inline: "center" });
  }, [focus]);
  const line = seat && t ? neighborLine(t, seat).nextTo : null;

  const cell = (id: string) => {
    const who = taken.get(id);
    const mine = seat === id;
    const nearHost = t && !occupied.has(id) && adjacent(id, t.h.s);
    const label = who ? `Ghế ${id}, ${who}` : nearHost ? `Ghế ${id}, cạnh ${t!.h.n}` : `Ghế ${id}, trống`;
    return (
      <button key={id} id={`seat-${id}`} aria-label={label} aria-pressed={mine} disabled={!!who}
        onClick={() => setSeat(id)}
        className={`w-10 h-10 m-[2px] shrink-0 text-[13px] font-medium ${mine ? "bg-stock-1930 text-stamp font-extrabold outline-2 outline-stamp" : who ? "bg-hall-text-2/30 text-hall-text" : "bg-velvet"} ${nearHost && !mine ? "outline outline-bulb animate-pulse [animation-iteration-count:2]" : ""}`}>
        {who ?? (mine ? id : "")}
      </button>
    );
  };

  return (
    <>
      <div className="px-4 pt-6">
        <div className="h-2 bg-hall-text-2/50 mx-8" />
        <p className="text-center text-[13px] font-medium text-hall-text-2 mt-1">MÀN HÌNH</p>
      </div>
      <div className="overflow-x-auto px-4 mt-4">
        <div className="w-max mx-auto">
          {ROWS.map((r) => (
            <div key={r} className="flex items-center">
              <span className="sticky left-0 w-6 text-[13px] text-hall-text-2 bg-hall">{r}</span>
              {Array.from({ length: AISLE_AFTER }, (_, i) => cell(`${r}${i + 1}`))}
              <span className="w-4 shrink-0" aria-hidden />
              {Array.from({ length: COLS - AISLE_AFTER }, (_, i) => cell(`${r}${i + AISLE_AFTER + 1}`))}
            </div>
          ))}
        </div>
      </div>
      <p className="px-4 mt-4 min-h-6 font-medium text-bulb">{seat ? `Ghế ${seat}${line ? ` · ${line} ✓` : ""}` : "Chọn một ghế trống"}</p>
      <div className="flex-1" />
      <Cta disabled={!seat} onClick={onNext}>Ngồi đây</Cta>
    </>
  );
}

export function Popcorn({ combo, setCombo, wish, setWish, onNext }: { combo: Combo | null; setCombo: (c: Combo) => void; wish: string; setWish: (s: string) => void; onNext: () => void }) {
  const options: Combo[] = ["caramel", "phomai", "ngot"];
  return (
    <>
      <h1 className="px-4 pt-8 text-[24px] font-extrabold">Bắp nước</h1>
      <div className="px-4 mt-6 grid grid-cols-3 gap-3">
        {options.map((c) => (
          <button key={c} onClick={() => setCombo(c)} aria-pressed={combo === c}
            className={`h-24 bg-velvet text-[13px] font-medium px-2 ${combo === c ? "outline-2 outline-bulb" : ""}`}>
            {COMBO_LABELS[c].replace(" + Coca", "")}
          </button>
        ))}
      </div>
      <button onClick={() => setCombo("none")} className="mx-4 mt-3 self-start underline text-hall-text-2">Thôi, không ăn</button>
      <label className="block px-4 mt-6">
        <span className="block text-[13px] font-medium text-hall-text-2 mb-2">Điều ước trước khi tắt đèn (không bắt buộc)</span>
        <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={80} className="w-full h-12 px-3 bg-velvet text-base outline-none" />
      </label>
      <div className="flex-1" />
      <Cta disabled={!combo} onClick={onNext}>In vé</Cta>
    </>
  );
}

export function Stub({ t, me, toast, onSeatConflict }: { t: Token; me: Me; toast: (m: string) => void; onSeatConflict: () => void }) {
  const src = `/api/stub?t=${encodeToken(t)}&me=${encodeMe(me)}&view=ticket`;
  const shareUrl = `${location.origin}/s/${encodeToken(reshare(t, me))}`;
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const onError = async () => {
    const res = await fetch(src).catch(() => null);
    if (res?.headers.get("x-stub-error") === "seat_conflict") return onSeatConflict();
    setState("error");
  };

  const invite = async () => {
    const text = `Ngồi cạnh ${me.n} xem phim nhé`;
    try {
      if (navigator.share) return await navigator.share({ title: text, text, url: shareUrl });
      await navigator.clipboard.writeText(shareUrl);
      toast("Đã chép link mời");
    } catch { /* user cancelled */ }
  };
  const blob = async () => new File([await (await fetch(src)).blob()], "ve-rap-online.png", { type: "image/png" });
  const save = async () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await blob());
    a.download = "ve-rap-online.png";
    a.click();
  };
  const share = async () => {
    try {
      const file = await blob();
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: shareUrl });
      toast("Nhấn giữ ảnh để lưu");
    } catch { /* cancelled */ }
  };

  return (
    <>
      <div className="px-4 pt-6">
        {state === "error" ? (
          <div className="aspect-[1080/1350] bg-velvet grid place-items-center text-center p-6">
            <div><p>Chưa in được vé</p><button className="mt-3 underline" onClick={() => setState("loading")}>Thử lại</button></div>
          </div>
        ) : (
          <div className="relative">
            {state === "loading" && <div className="absolute inset-0 bg-velvet animate-pulse" aria-hidden />}
            <img key={state} src={src} alt={`Vé ${me.n}, ghế ${me.s}, suất ${formatShowtime(t.st)}`} onLoad={() => setState("ok")} onError={onError}
              className="w-full aspect-[1080/1350] rounded-[2px] shadow-[0_6px_16px_rgba(0,0,0,.35)]" />
          </div>
        )}
      </div>
      <div className="flex-1" />
      <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 grid gap-3">
        <button onClick={invite} className="h-[52px] bg-bulb text-ink font-extrabold">Rủ bạn ngồi cạnh</button>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={save} className="h-12 border-[1.5px] border-hall-text-2">Lưu ảnh</button>
          <button onClick={share} className="h-12 border-[1.5px] border-hall-text-2">Chia sẻ</button>
        </div>
        <p className="text-center text-[13px] text-hall-text-2">Nhấn giữ ảnh để lưu</p>
      </div>
    </>
  );
}
