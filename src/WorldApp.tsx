// HUD for the walkable 3D cinema: intro → walk in → queue at QUẦY VÉ → buy (film, time, seat)
// → BẮP NƯỚC → SOÁT VÉ tears the stub → PHÒNG n → find your seat → lights down → share.
// Visual language: "cuống vé rạp quốc doanh" — every panel is a piece of ticket stock, every
// message sits in a bulb-lit marquee (see .ticket/.bulbs/.stamp/.btn-ticket in index.css).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adjacent, COMBO_LABELS, encodeMe, encodeToken, formatShowtime, initials, mintOrigin, neighborLine,
  validateName, validateWish, type Combo, type Me, type Token,
} from "../shared/ticket";
import { scheduleFor, upcomingSlots, type ShowSlot } from "../shared/schedule";
import { World, type Prompt, type QueueInfo, type Zone } from "./world/World";
import { AISLE_AFTER, allSeats, COLS, ROWS } from "../shared/seats";
import { HERO_IDS, HERO_NAMES, preloadHeroes, type HeroId } from "./world/Character";
import { CharacterPreview } from "./world/CharacterPreview";
import { fillerSeats } from "./world/audience";
import { filmById, films, readInvite, Stub, useToast } from "./App";
import { saveMyTicket } from "./lib/clientStore";
import { Net } from "./net/Net";
import { MAX_CHAT, sanitizeChat, type RtChat, type RtEmote, type RtHero, type RtQuiz } from "../shared/rt";
import { claimOnce, earn, PRICE, REWARD, rollGacha, spend, type Pin } from "../shared/economy";
import { useWallet } from "./lib/wallet";
import { Bag, ClawHud, CoinPill, EmoteBar, GachaReveal, KaraokePanel, PhotoBooth, QuizPanel } from "./hud/Activities";
import type { PromptId } from "./world/World";
import { FilmDetail, Kiosk, Poster, PosterRail, posterUrl, TicketCode } from "./hud/Booking";

type Dialog = null | "counter" | "concession" | "board" | "checker";
interface Purchase { t: Token; seat: string; room: number; filmTitle: string; wish: string }
const SHOW_SECONDS = 10;
const HERO_BLURB: Partial<Record<HeroId, string>> = {
  Knight: "Giáp bạc, kiếm sáng", Barbarian: "Rìu to, mũ sừng", Mage: "Áo choàng, gậy phép", Rogue: "Nhanh nhẹn, dao găm", Rogue_Hooded: "Trùm mũ, bí ẩn",
  SinhVien: "Hoodie, balo", CongSo: "Sơ mi, cà vạt, kính", CoNang: "Váy hồng, tóc dài", Pikachu: "Model riêng · chỉ bản dev",
  Model1: "Mũ nồi, sơ mi caro", Model2: "Trái chuối tăng động", Model3: "Cún Corgi chân ngắn",
};
const viDate = (d: string) => d.split("-").reverse().join("/");
/** Short "valid ticket" double beep from the gate scanner (Web Audio, no file). */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.13].forEach((at, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = i ? 1760 : 1320;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.1);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.11);
    });
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch { /* audio unavailable */ }
}
/** Human-friendly ticket number derived from the token (stable per ticket). */
function ticketNo(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return `RO-${(h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}
function Barcode({ seed }: { seed: string }) {
  let h = 7;
  const bars: number[] = [];
  for (let i = 0; i < 46; i++) { h = (h * 31 + seed.charCodeAt(i % seed.length)) % 997; bars.push(1 + (h % 3)); }
  let x = 0;
  return (
    <svg viewBox="0 0 140 30" className="eticket-barcode" aria-hidden preserveAspectRatio="none">
      {bars.map((w, i) => { const r = i % 2 ? null : <rect key={i} x={x} y={0} width={w} height={30} fill="#f6e9e4" />; x += w; return r; })}
    </svg>
  );
}

/** Vietnamese films first, then other current releases in Vietnam (newest first), then the open films we stream in full. */
const showingOrder = (list: typeof films) =>
  [...list.filter((f) => f.nowPlaying)].sort((a, b) => Number(!!a.video) - Number(!!b.video) || Number(!a.vn) - Number(!b.vn) || b.releaseDate.localeCompare(a.releaseDate));

// ---------- building blocks ----------

function TicketButton({ children, disabled, onClick, className = "" }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; className?: string }) {
  return <button disabled={disabled} onClick={onClick} className={`btn-ticket w-full px-6 text-[17px] ${className}`}>{children}</button>;
}

/** NPC line: round avatar badge + speech on ticket stock. */
function Speech({ who, avatar, children }: { who: string; avatar: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="shrink-0 w-12 h-12 rounded-full bg-velvet text-hall-text grid place-items-center font-[family-name:var(--font-display)] text-lg ring-2 ring-ink/80">{avatar}</span>
      <div className="flex-1">
        <p className="text-[13px] font-extrabold uppercase tracking-wide text-stamp">{who}</p>
        <p className="mt-1 text-base font-medium leading-snug">{children}</p>
      </div>
    </div>
  );
}

/** Bottom sheet made of ticket stock with a torn top edge. */
function Sheet({ title, onClose, stock, children }: { title: string; onClose?: () => void; stock?: string; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="absolute inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] sheet-in">
      <div className="torn-top ticket max-h-[86dvh] overflow-y-auto px-5 pt-7 pb-[max(18px,env(safe-area-inset-bottom))] [--notch:0px]" style={stock ? ({ "--stock": stock } as React.CSSProperties) : undefined}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="stamp text-[20px] leading-tight">{title}</h2>
          {onClose && <button onClick={onClose} aria-label="Đóng" className="-mr-2 -mt-2 w-11 h-11 grid place-items-center text-ink/70 text-2xl">×</button>}
        </div>
        {children}
      </div>
    </div>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    setKnob({ x, y });
    onMove(x, y);
  };
  const end = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div ref={base} role="application" aria-label="Cần điều khiển: kéo để đi"
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={(e) => e.buttons && move(e)} onPointerUp={end} onPointerCancel={end}
      className="reel absolute left-4 bottom-[max(22px,env(safe-area-inset-bottom))] z-20 w-[136px] h-[136px] rounded-full touch-none ring-2 ring-hall-text-2/40">
      <div className="absolute w-16 h-16 rounded-full left-1/2 top-1/2 bg-bulb shadow-[0_4px_0_#9a6b12] grid place-items-center"
        style={{ transform: `translate(calc(-50% + ${knob.x * 38}px), calc(-50% + ${knob.y * 38}px))` }}>
        <span className="w-6 h-6 rounded-full bg-ink/80" />
      </div>
    </div>
  );
}

/** Seat map: fixed-size cells (nothing scales or shifts when you pick), centre aisle, row labels both sides. */
function SeatChart({ taken, nearHost, seat, onPick }: { taken: Map<string, string>; nearHost: Set<string>; seat: string | null; onPick: (s: string) => void }) {
  const cell = (id: string) => {
    const who = taken.get(id);
    const mine = seat === id;
    const near = nearHost.has(id) && !who;
    const state = mine ? "mine" : who ? (who !== "•" ? "friend" : "sold") : near ? "near" : "free";
    return (
      <button key={id} type="button" disabled={!!who} onClick={() => onPick(id)} aria-pressed={mine}
        aria-label={who ? `Ghế ${id}, đã bán${who !== "•" ? `, ${who}` : ""}` : near ? `Ghế ${id}, cạnh bạn của bạn` : `Ghế ${id}, trống`}
        className={`seat seat--${state}`}>
        {state === "friend" ? who : state === "mine" ? "✓" : ""}
      </button>
    );
  };
  return (
    <div className="seatmap">
      <div className="seatmap-screen" aria-hidden />
      <p className="seatmap-label">MÀN HÌNH</p>
      <div className="seatmap-grid" role="group" aria-label="Sơ đồ ghế">
        {ROWS.map((r) => (
          <div key={r} className="seatmap-row">
            <span className="seatmap-row-id">{r}</span>
            {Array.from({ length: AISLE_AFTER }, (_, i) => cell(`${r}${i + 1}`))}
            <span className="seatmap-aisle" aria-hidden />
            {Array.from({ length: COLS - AISLE_AFTER }, (_, i) => cell(`${r}${i + AISLE_AFTER + 1}`))}
            <span className="seatmap-row-id">{r}</span>
          </div>
        ))}
      </div>
      <div className="seatmap-legend">
        <span><i className="seat seat--free" /> Trống</span>
        <span><i className="seat seat--sold" /> Đã bán</span>
        {nearHost.size > 0 && <span><i className="seat seat--near" /> Cạnh bạn bè</span>}
        <span><i className="seat seat--mine" /> Ghế bạn chọn</span>
      </div>
    </div>
  );
}

// ---------- multiplayer HUD ----------

type NetStatus = "connecting" | "online" | "offline" | "full";
interface ChatLine extends RtChat { key: number; mine: boolean }

function Presence({ status, count, onChat }: { status: NetStatus; count: number; onChat: () => void }) {
  const label = status === "online" ? `${count} người trong rạp` : status === "connecting" ? "Đang kết nối…" : status === "full" ? "Rạp đã đầy" : "Mất kết nối · đang thử lại";
  return (
    <button onClick={onChat} className="presence pointer-events-auto" aria-label={`${label}. Mở chat`}>
      <span className={`dot ${status === "online" ? "bg-[#5fd38d]" : status === "connecting" ? "bg-bulb animate-pulse" : "bg-stamp"}`} aria-hidden />
      <span className="tabular-nums full">{label}</span>
      <span className="tabular-nums short">{status === "online" ? `👥 ${count}` : status === "connecting" ? "…" : "!"}</span>
      <span className="ml-1 text-[15px]" aria-hidden>💬</span>
    </button>
  );
}

/** Recent lines, bottom-left; each fades out after a while like a game chat feed. */
function ChatFeed({ lines, raised }: { lines: ChatLine[]; raised?: boolean }) {
  return (
    <ol className={`chat-feed ${raised ? "chat-feed--show" : ""}`} aria-live="polite" aria-label="Tin nhắn trong rạp">
      {lines.slice(-5).map((l) => (
        <li key={l.key} className="chat-line">
          <b className={l.mine ? "text-bulb" : "text-[#f4c9c4]"}>{l.name}</b> <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

function ChatInput({ onSend, onClose, compact }: { onSend: (t: string) => string | null; onClose: () => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!compact) ref.current?.focus(); }, [compact]); // the always-on bar mustn't grab focus (and pop the phone keyboard)
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = onSend(text);
    if (problem) return setErr(problem);
    setText("");
    setErr(null);
    if (!compact) onClose();
  };
  return (
    <form onSubmit={submit} className={`chat-input ${compact ? "" : "chat-input--float"}`}>
      <input ref={ref} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} maxLength={MAX_CHAT * 2} enterKeyHint="send"
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); onClose(); } }}
        placeholder="Nhắn cả rạp…" aria-label="Nhắn tin cho mọi người trong rạp" aria-invalid={!!err} />
      <button type="submit" disabled={!text.trim()} aria-label="Gửi">Gửi</button>
      {err && <p role="alert" className="chat-err">{err}</p>}
    </form>
  );
}

/** Bullet comments flying across the top of the screen during the film. */
function Danmaku({ lines }: { lines: ChatLine[] }) {
  const [flying, setFlying] = useState<(ChatLine & { lane: number })[]>([]);
  const seen = useRef(0);
  useEffect(() => {
    const fresh = lines.filter((l) => l.key > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[fresh.length - 1].key;
    setFlying((f) => [...f, ...fresh.map((l, i) => ({ ...l, lane: (l.key + i) % 4 }))].slice(-16));
  }, [lines]);
  return (
    <div className="danmaku" aria-hidden>
      {flying.map((l) => (
        <span key={l.key} className={`danmaku-item ${l.mine ? "danmaku-item--mine" : ""}`} style={{ top: `${l.lane * 2.6}rem` }}
          onAnimationEnd={() => setFlying((f) => f.filter((x) => x.key !== l.key))}>
          <b>{l.name}</b> {l.text}
        </span>
      ))}
    </div>
  );
}

// ---------- app ----------

export function WorldApp() {
  const invite = useMemo(readInvite, []);
  const mount = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const [toast, setToast] = useToast();
  const [started, setStarted] = useState(false);
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [hero, setHero] = useState<HeroId>("SinhVien");
  const [heroesReady, setHeroesReady] = useState(false);
  useEffect(() => { preloadHeroes().then(() => setHeroesReady(true)).catch(() => setToast("Không tải được nhân vật, thử tải lại trang")); }, [setToast]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [queue, setQueue] = useState<QueueInfo>({ inQueue: false, ahead: 0, atFront: false });
  const [zone, setZone] = useState<Zone>("street");
  const [fade, setFade] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [combo, setCombo] = useState<Combo>("none");
  const [gateOpen, setGateOpen] = useState(false);
  const [showLeft, setShowLeft] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const touch = useMemo(() => matchMedia("(pointer: coarse)").matches, []);
  // The film: created inside the "sit down" tap/keypress so the browser lets it play with sound.
  const video = useRef<HTMLVideoElement | null>(null);
  const purchaseRef = useRef<Purchase | null>(null);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filmFailed, setFilmFailed] = useState(false);
  // multiplayer
  const net = useRef<Net | null>(null);
  const [netStatus, setNetStatus] = useState<NetStatus>("connecting");
  const [peerCount, setPeerCount] = useState(0);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [danmakuOn, setDanmakuOn] = useState(true);
  // Game Zone / karaoke
  type Activity = null | { kind: "claw" } | { kind: "gacha"; pin: Pin | null; isNew: boolean } | { kind: "booth" } | { kind: "karaoke"; i: number } | { kind: "quiz" };
  const [activity, setActivity] = useState<Activity>(null);
  const [clawResult, setClawResult] = useState<{ prize: string | null; note: string } | null>(null);
  const [quiz, setQuiz] = useState<RtQuiz | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [wallet, applyWallet] = useWallet();
  const rewardedQ = useRef(new Set<number>());
  const startActivity = useRef<(id: PromptId) => void>(() => {});
  const [eTicket, setETicket] = useState(false);
  const chatKey = useRef(0);
  const lastSent = useRef(0);

  const [filmId, setFilmId] = useState<number>(invite?.f ?? showingOrder(films)[0]?.id ?? 0);
  const [slot, setSlot] = useState<ShowSlot | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [wish, setWish] = useState("");
  const [counterStep, setCounterStep] = useState<"film" | "seat" | "confirm">(invite ? "seat" : "film");

  const showing = useMemo(() => showingOrder(films.filter((f) => f.nowPlaying || f.id === invite?.f)), [invite]);
  const board = useMemo(() => showing.map((f) => ({ title: f.title, poster: posterUrl(f), ...scheduleFor(f) })), [showing]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("err") === "link" || (location.pathname.startsWith("/s/") && !invite)) {
      setToast("Link vé không hợp lệ");
      history.replaceState(null, "", "/");
    }
  }, [invite, setToast]);

  const onInteract = useCallback(() => {
    const id = world.current?.interact();
    const fv = id === "seat" && purchaseRef.current ? filmById.get(purchaseRef.current.t.f)?.video : undefined;
    if (fv && !video.current) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous"; // needed to draw it as a WebGL texture (Wikimedia sends ACAO: *)
      v.playsInline = true;
      v.preload = "auto";
      for (const [src, type] of [[fv.webm, 'video/webm; codecs="vp9, opus"'], [fv.mp4, "video/mp4"]] as const) {
        if (!src) continue;
        const el = document.createElement("source");
        el.src = src;
        el.type = type;
        v.appendChild(el);
      }
      // <source> errors fire on the source element; the last one failing means nothing can play.
      v.lastElementChild?.addEventListener("error", () => setFilmFailed(true));
      v.addEventListener("timeupdate", () => setProgress(v.duration ? v.currentTime / v.duration : 0));
      v.addEventListener("ended", () => setEnded(true));
      // Unlock playback with sound inside this user gesture; the World starts it after the countdown.
      v.play().then(() => v.pause()).catch(() => {});
      video.current = v;
    }
    if (id === "board") setDialog("board");
    if (id === "concession") setDialog("concession");
    if (id === "checker") setDialog("checker");
    if (id && ["claw", "gacha", "booth", "karaoke", "quiz"].includes(id)) startActivity.current(id);
  }, []);

  useEffect(() => {
    if (!started || !mount.current) return;
    let w: World | null = null;
    let disposed = false;
    let tick = 0;
    Promise.all([document.fonts.load('800 40px "Be Vietnam Pro"'), preloadHeroes()]).finally(() => {
      if (disposed || !mount.current) return;
      w = new World(mount.current, {
        prompt: setPrompt, queue: setQueue, zone: setZone, fade: setFade, toast: setToast,
        seated: () => setShowLeft(SHOW_SECONDS),
        stood: () => setShowLeft(null),
      }, { look: { hero }, name, films: board });
      w.input.onInteract = onInteract;
      world.current = w;
      const peers = new Set<string>();
      const n = new Net({ name, hero: hero as RtHero }, {
        status: setNetStatus,
        welcome: (_id, list, history) => {
          peers.clear();
          list.forEach((p) => { peers.add(p.id); w?.upsertPeer(p); });
          setPeerCount(peers.size);
          setChat(history.map((m) => ({ ...m, key: ++chatKey.current, mine: m.id === n.myId })));
        },
        join: (p) => { peers.add(p.id); w?.upsertPeer(p); setPeerCount(peers.size); },
        leave: (id) => { peers.delete(id); w?.removePeer(id); setPeerCount(peers.size); },
        state: (id, st) => w?.peerState(id, st),
        quiz: (q) => setQuiz(q),
        chat: (m) => {
          const mine = m.id === n.myId;
          w?.say(mine ? null : m.id, m.text);
          setChat((c) => [...c, { ...m, key: ++chatKey.current, mine }].slice(-40));
        },
      });
      net.current = n;
      tick = window.setInterval(() => { if (w) n.sendState(w.snapshot()); }, 100);
      if (import.meta.env.DEV) (window as unknown as { __world: World }).__world = w; // demo/E2E hook, dev only
    });
    return () => { disposed = true; clearInterval(tick); net.current?.dispose(); net.current = null; w?.dispose(); world.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  useEffect(() => { if (queue.atFront) setDialog("counter"); }, [queue.atFront]);
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "Enter" || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || dialog) return;
      e.preventDefault();
      setChatOpen(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [started, dialog]);

  /** Returns an error message, or null when sent. */
  const sendChat = (text: string): string | null => {
    const c = sanitizeChat(text);
    if (!c.ok) return c.error === "link" ? "Không gửi link trong rạp nhé" : c.error === "length" ? `Tối đa ${MAX_CHAT} ký tự` : "Nhập gì đó đã";
    if (netStatus !== "online") return "Chưa kết nối, thử lại sau giây lát";
    if (performance.now() - lastSent.current < 1200) return "Từ từ thôi, chờ chút rồi gửi tiếp";
    lastSent.current = performance.now();
    net.current?.chat(c.value);
    return null;
  };

  useEffect(() => {
    if (showLeft === null) return;
    if (showLeft === SHOW_SECONDS) world.current?.startShow(video.current, purchaseRef.current ? filmById.get(purchaseRef.current.t.f)?.trailerKey : null);
    if (showLeft <= 0) return;
    const id = setTimeout(() => setShowLeft((n) => (n ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [showLeft]);

  useEffect(() => { purchaseRef.current = purchase; }, [purchase]);
  useEffect(() => { if (ended) video.current?.pause(); }, [ended]);
  // rewards: finishing a film, first visit to each wing, correct quiz answers
  /** One-time reward: returns true only the first time `key` is claimed. */
  const claim = (key: string, amount: number, msg: string) => {
    if (wallet.seen.includes(key)) return;
    applyWallet((w) => claimOnce(w, key, amount));
    setToast(msg);
  };
  useEffect(() => {
    if (ended && purchase) claim(`film:${purchase.t.f}:${purchase.t.d}:${purchase.t.st}`, REWARD.watchedFilm, `+${REWARD.watchedFilm} xu: xem phim xong`);
  }, [ended]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (zone === "arcade" || zone === "karaoke") claim(`visit:${zone}`, REWARD.firstVisit, `+${REWARD.firstVisit} xu: lần đầu ghé ${zone === "arcade" ? "Game Zone" : "Karaoke"}`);
  }, [zone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // the big quiz screen in the Game Zone mirrors the round you are playing
    if (!quiz) return;
    world.current?.drawQuiz({ title: quiz.text, lines: quiz.options.map((o, i) => `${"ABCD"[i]}. ${o}`), timer: Math.ceil(quiz.endsIn / 1000), highlight: quiz.phase === "reveal" ? quiz.answer : undefined });
  }, [quiz]);
  useEffect(() => {
    if (!quiz || quiz.phase !== "reveal" || quiz.picked === undefined || rewardedQ.current.has(quiz.q)) return;
    rewardedQ.current.add(quiz.q);
    if (quiz.picked === quiz.answer) { applyWallet((w) => earn(w, REWARD.quizCorrect)); setToast(`Đúng rồi! +${REWARD.quizCorrect} xu`); }
  }, [quiz]); // eslint-disable-line react-hooks/exhaustive-deps

  const noCoins = () => setToast("Hết xu rồi! Chơi đố vui, xem hết phim hoặc hát karaoke để kiếm thêm");
  startActivity.current = (id: PromptId) => {
    const w = world.current;
    if (!w) return;
    setPrompt(null);
    if (id === "claw") {
      if (!applyWallet((x) => spend(x, PRICE.claw))) return noCoins();
      setClawResult(null);
      w.playClaw(w.lastRef, (prize, note) => {
        setClawResult({ prize, note });
        if (prize) applyWallet((x) => ({ ...x, plush: [...x.plush, prize] }));
      });
      setActivity({ kind: "claw" });
    } else if (id === "gacha") {
      if (!applyWallet((x) => spend(x, PRICE.gacha))) return noCoins();
      const pin = rollGacha(Math.random);
      const isNew = !wallet.pins.includes(pin.id);
      setActivity({ kind: "gacha", pin: null, isNew });
      w.playGacha(pin.rarity === "siêu hiếm" ? 0xffd23f : pin.rarity === "hiếm" ? 0x4fc3f7 : 0xff5d8f, () => {
        applyWallet((x) => ({ ...x, pins: [...x.pins, pin.id] }));
        setActivity({ kind: "gacha", pin, isNew });
      });
    } else if (id === "booth") {
      w.enterBooth();
      setActivity({ kind: "booth" });
    } else if (id === "karaoke") {
      w.enterKaraoke(w.lastRef);
      setActivity({ kind: "karaoke", i: w.lastRef });
    } else if (id === "quiz") {
      setQuiz(null);
      net.current?.quiz(true);
      setActivity({ kind: "quiz" });
    }
  };
  const endActivity = () => {
    if (activity?.kind === "quiz") net.current?.quiz(false);
    world.current?.exitMode();
    world.current?.gacha.reset();
    setActivity(null);
    setClawResult(null);
  };
  const doEmote = useCallback((e: RtEmote) => world.current?.emote(e), []);

  /** Close the souvenir ticket screen and get up from the seat. */
  const closeStub = () => { setEnded(false); world.current?.standUp(); };
  /** One "back" action for Esc and the mobile exit buttons: innermost layer first. */
  const goBack = () => {
    if (bagOpen) return setBagOpen(false);
    if (chatOpen) return setChatOpen(false);
    if (eTicket) return setETicket(false);
    if (dialog) { if (dialog === "counter") world.current?.leaveQueue(); return setDialog(null); }
    if (activity) return endActivity();
    if (ended) return closeStub();
    world.current?.exitHall();
  };
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => {
    if (!started) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return; // the input handles its own Esc (closes chat)
      e.preventDefault();
      goBackRef.current();
    };
    addEventListener("keydown", onEsc);
    return () => removeEventListener("keydown", onEsc);
  }, [started]);
  useEffect(() => () => { video.current?.pause(); }, []);

  const film = filmById.get(filmId);
  const chosenSlot = invite ? { st: invite.st, d: invite.d, label: formatShowtime(invite.st), tomorrow: false } : slot;

  const chart = useMemo(() => {
    const taken = new Map<string, string>();
    const nearHost = new Set<string>();
    if (!film || !chosenSlot) return { taken, nearHost, filler: [] as string[] };
    const all = allSeats();
    if (invite) {
      taken.set(invite.h.s, initials(invite.h.n));
      for (const [s, ini] of invite.r) taken.set(s, ini);
    }
    const keepFree = invite ? all.filter((id) => adjacent(id, invite.h.s)) : [];
    const filler = fillerSeats(film.id, chosenSlot.d, chosenSlot.st, new Set([...taken.keys(), ...keepFree]));
    for (const s of filler) taken.set(s, "•");
    if (invite) for (const id of all) if (!taken.has(id) && adjacent(id, invite.h.s)) nearHost.add(id);
    return { taken, nearHost, filler };
  }, [film, chosenSlot?.d, chosenSlot?.st, invite]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!film) return <main className="min-h-dvh grid place-items-center p-8 text-center text-hall-text-2">Rạp đang thay phim, quay lại sau nhé</main>;

  const start = () => {
    const v = validateName(name);
    if (!v.ok) return setNameErr("Tên chỉ gồm chữ cái, tối đa 20 ký tự");
    setName(v.value);
    setStarted(true);
  };

  const buy = () => {
    if (!chosenSlot || !seat) return;
    const room = scheduleFor(film).room;
    const t = invite ?? mintOrigin(film.id, chosenSlot.st, new Date(), { s: seat, n: name });
    const w = validateWish(wish);
    const me: Me = { s: seat, n: name, c: "none", ...(w.ok && w.value ? { w: w.value } : {}) };
    saveMyTicket({ f: t.f, d: t.d, st: t.st, seat, name, token: encodeToken(t), me: encodeMe(me) });
    setPurchase({ t, seat, room, filmTitle: film.title, wish: w.ok ? w.value : "" });
    const occupants = invite ? [{ seat: invite.h.s, name: invite.h.n, friend: true }, ...invite.r.map(([s, ini]) => ({ seat: s, name: ini, friend: true }))] : [];
    world.current?.finishPurchase({ room, seat, show: `${t.f}|${t.d}|${t.st}|${room}`, occupants, filler: chart.filler });
    setDialog(null);
    setETicket(true);
  };

  const me: Me | null = purchase ? { s: purchase.seat, n: name, c: combo, ...(purchase.wish ? { w: purchase.wish } : {}) } : null;
  const ticketUrl = purchase && me ? `/api/stub?t=${encodeToken(purchase.t)}&me=${encodeMe(me)}&view=ticket` : "";

  const step = !purchase ? 1 : !gateOpen ? 2 : zone !== "hall" ? 3 : 4;
  const QUEST_TITLES = ["Mua vé", "Soát vé", "Vào phòng chiếu", "Tìm chỗ ngồi"];
  const questTitle = QUEST_TITLES[step - 1];
  const objective = !started || showLeft !== null ? "" :
    queue.inQueue ? (queue.atFront ? "Đến lượt bạn, chọn phim ở quầy" : `Đang xếp hàng · còn ${queue.ahead} người`) :
    !purchase ? (zone === "street" ? "Vào sảnh, tới Quầy vé bên trái" : "Tới Quầy vé bên trái và xếp hàng") :
    !gateOpen ? "Đưa vé ở cổng Soát vé · bắp nước tùy chọn" :
    zone !== "hall" ? `Đi qua cổng, vào Phòng ${purchase.room}` : `Ghế ${purchase.seat} · đi theo cột sáng vàng`;
  // "Quest complete" banner whenever the step advances.
  const [banner, setBanner] = useState<string | null>(null);
  const lastStep = useRef(1);
  useEffect(() => {
    if (!started || step === lastStep.current) return;
    const done = QUEST_TITLES[lastStep.current - 1];
    lastStep.current = step;
    setBanner(done);
    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, started]);
  const stockFor = (st: string) => (Number(st.slice(0, 2)) < 17 ? "var(--color-stock-1200)" : Number(st.slice(0, 2)) < 21 ? "var(--color-stock-1930)" : "var(--color-stock-2200)");

  return (
    <main className="fixed inset-0 overflow-hidden bg-hall select-none">
      <div ref={mount} className="absolute inset-0" />
      {toast}
      <div className={`absolute inset-0 z-40 bg-black pointer-events-none transition-opacity duration-300 ${fade ? "opacity-100" : "opacity-0"}`} />

      {/* ===== Intro: cinematic poster backdrop + "now showing" rail + your character ===== */}
      {!started && (() => {
        const featured = filmById.get(invite?.f ?? filmId) ?? film;
        const hint = touch ? "Kéo cần điều khiển để đi · nút ✋ để tương tác" : "WASD để đi · E tương tác · Enter để chat · 1–4 biểu cảm";
        return (
          <div className="intro">
            <div className="intro-bg" aria-hidden>
              {posterUrl(featured) && <img src={posterUrl(featured)} alt="" referrerPolicy="no-referrer" key={featured.id} />}
            </div>
            <div className="intro-grid">
              <div className="intro-left">
                <header className="flex items-center justify-between">
                  <p className="intro-logo">RẠP ONLINE</p>
                  <p className="text-[12px] text-hall-text/60">3D · chơi chung · miễn phí</p>
                </header>
                {invite ? (
                  <div className="invite pop-in">
                    <p className="kicker">VÉ MỜI · {formatShowtime(invite.st)} · {viDate(invite.d)}</p>
                    <h1 className="intro-h1">{invite.h.n} mời bạn xem <span className="text-bulb">{filmById.get(invite.f)?.title}</span></h1>
                    <p className="intro-sub">{invite.h.n} đang giữ ghế {invite.h.s}. Vào rạp, mua vé ghế bên cạnh và xem cùng nhau.</p>
                  </div>
                ) : (
                  <div className="pop-in">
                    <h1 className="intro-h1">Tối nay <span className="text-bulb">đi rạp</span> không?</h1>
                    <p className="intro-sub">Đi bộ vào rạp 3D, xếp hàng mua vé, gắp gấu, hát karaoke, rồi xem phim thật cùng mọi người.</p>
                  </div>
                )}
                <PosterRail films={showing} selected={featured.id} onSelect={invite ? undefined : (id) => setFilmId(id)} />
                <p className="intro-blurb"><b>{featured.title}</b> · {featured.video ? featured.video.blurb : `Khởi chiếu ${viDate(featured.releaseDate)}${featured.trailerKey ? " · vào phòng chiếu để xem trailer chính thức" : ""}`}</p>
              </div>

              <section className="intro-card" aria-label="Nhân vật của bạn">
                <div className="intro-stage">
                  <CharacterPreview hero={hero} name={name || "Bạn"} />
                </div>
                <label className="block">
                  <span className="kicker">TÊN CỦA BẠN</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setNameErr(null); }} maxLength={40} placeholder="VD: Phương" autoComplete="nickname"
                    onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && heroesReady) start(); }} className="kiosk-input mt-1.5" aria-invalid={!!nameErr} />
                  {nameErr && <span className="block mt-1 text-[13px] font-semibold text-[#ff8a80]">{nameErr}</span>}
                </label>
                <p className="kicker mt-3">NHÂN VẬT</p>
                <div className="hero-chips" role="radiogroup" aria-label="Chọn nhân vật">
                  {HERO_IDS.map((h) => (
                    <button key={h} role="radio" aria-checked={h === hero} aria-label={`Tướng ${HERO_NAMES[h]}`} onClick={() => setHero(h)} className={`hero-chip ${h === hero ? "hero-chip--on" : ""}`}>
                      <b>{HERO_NAMES[h]}</b><span>{HERO_BLURB[h]}</span>
                    </button>
                  ))}
                </div>
                <button className="intro-cta" disabled={!name.trim() || !heroesReady} onClick={start}>{heroesReady ? "BẮT ĐẦU ▸" : "ĐANG TẢI NHÂN VẬT…"}</button>
                <p className="mt-2 text-center text-[12px] text-hall-text/55">{hint}</p>
              </section>
            </div>
            <p className="intro-credits">Phim: Blender Foundation (CC BY) qua Wikimedia Commons · Poster & dữ liệu phim Việt: TMDB (sản phẩm dùng TMDB API nhưng không được TMDB bảo trợ) · Trailer: YouTube chính thức · Nhân vật: KayKit (CC0) · Vật liệu: Poly Haven (CC0)</p>
          </div>
        );
      })()}

      {/* ===== HUD ===== */}
      {started && showLeft === null && zone !== "hall" && !activity && (objective || purchase) && (
        <div className="absolute top-[max(12px,env(safe-area-inset-top))] left-3 right-3 z-20 flex items-start justify-between gap-2 pointer-events-none">
          <div className="flex flex-col items-start gap-2 min-w-0">
            {objective && (
              <section className="hud-panel w-[min(100%,340px)] px-4 py-3" role="status" aria-label={`Nhiệm vụ ${step}/4: ${questTitle}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold tracking-[.14em] text-bulb whitespace-nowrap">NHIỆM VỤ {step}/4</span>
                  <span className="flex gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i < step ? "w-3 bg-bulb" : i === step ? "w-6 bg-bulb" : "w-3 bg-hall-text/25"}`} />)}
                  </span>
                </div>
                <p className="mt-1 font-[family-name:var(--font-display)] text-[17px] leading-tight text-hall-text">{questTitle}</p>
                <p className="mt-0.5 text-[14px] font-medium text-hall-text/80 leading-snug" key={objective}>
                  <span className="inline-block w-1.5 h-1.5 mr-2 mb-0.5 rounded-full bg-bulb animate-pulse" aria-hidden />{objective}
                </p>
              </section>
            )}
            {purchase && (
              <p className="hud-panel px-3 py-1.5 text-[13px] font-bold text-hall-text/90 max-w-full truncate">
                {`🎟 ${purchase.filmTitle} · ${formatShowtime(purchase.t.st)} · P${purchase.room} · ${purchase.seat}`}{gateOpen && <span className="ml-1.5 text-bulb">✓</span>}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Presence status={netStatus} count={peerCount + 1} onChat={() => setChatOpen(true)} />
            <CoinPill coins={wallet.coins} onClick={() => setBagOpen(true)} />
          </div>
        </div>
      )}

      {/* Hall: cinematic letterbox. The HUD lives in the black bars so nothing covers the screen. */}
      {started && zone === "hall" && purchase && !ended && (
        <>
          <header className={`letterbox letterbox--top ${showLeft !== null ? "letterbox--show" : ""}`}>
            <div className="letterbox-row">
              <div className="min-w-0">
                <p className="letterbox-kicker">{showLeft !== null ? "ĐANG CHIẾU" : `PHÒNG ${purchase.room} · SUẤT ${formatShowtime(purchase.t.st)}`}</p>
                <p className="letterbox-title">{showLeft !== null ? purchase.filmTitle : <>Tìm ghế <span className="text-bulb">{purchase.seat}</span></>}</p>
              </div>
              <div className="flex items-center gap-2">
                <Presence status={netStatus} count={peerCount + 1} onChat={() => setChatOpen(true)} />
                <button className="exit-btn" onClick={() => world.current?.exitHall()} aria-label={showLeft !== null ? "Đứng dậy rời ghế (Esc)" : "Ra khỏi phòng chiếu (Esc)"}>
                  <span aria-hidden>←</span><span>{showLeft !== null ? "Rời ghế" : "Ra sảnh"}</span>{!touch && <kbd>Esc</kbd>}
                </button>
              </div>
            </div>
          </header>
          {showLeft !== null && danmakuOn && <Danmaku lines={chat} />}
          {showLeft !== null && (() => {
            const fv = filmById.get(purchase.t.f)?.video;
            return (
              <footer className="letterbox letterbox--bottom letterbox--show">
                {fv && <div className="letterbox-progress" aria-hidden><i style={{ width: `${progress * 100}%` }} /></div>}
                <div className="letterbox-row gap-2">
                  {fv && (
                    <button className="lb-btn" onClick={() => { const v = video.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); if (v.paused && v.currentTime > 0) v.play().catch(() => {}); }}
                      aria-label={muted ? "Bật tiếng" : "Tắt tiếng"}>{muted ? "🔇" : "🔊"}</button>
                  )}
                  <button className={`lb-btn ${danmakuOn ? "lb-btn--on" : ""}`} onClick={() => setDanmakuOn((d) => !d)} aria-pressed={danmakuOn} aria-label="Bình luận bay trên màn hình" title="Live comments"><span className="text-[11px] font-extrabold tracking-wide">CMT</span></button>
                  <div className="flex-1 min-w-0"><ChatInput compact onSend={sendChat} onClose={() => goBackRef.current()} /></div>
                  <button disabled={showLeft > 0} onClick={() => setEnded(true)} className="lb-cta">
                    {showLeft > 0 ? `${showLeft}s` : "Vé kỷ niệm"}
                  </button>
                </div>
                <p className="letterbox-credit">{filmFailed ? "Không tải được phim (mạng chặn video từ Wikimedia Commons). Thử mạng khác nhé." : fv?.credit ?? (filmById.get(purchase.t.f)?.trailerKey ? "Trailer chính thức của nhà phát hành · phát qua YouTube" : "Chúc quý khách xem phim vui vẻ")}</p>
              </footer>
            );
          })()}
        </>
      )}

      {started && !ended && !activity && <ChatFeed lines={chat} raised={showLeft !== null} />}
      {started && chatOpen && showLeft === null && !dialog && <ChatInput onSend={sendChat} onClose={() => setChatOpen(false)} />}

      {banner && (
        <div className="absolute inset-x-0 top-[22%] z-30 flex justify-center pointer-events-none" aria-live="polite">
          <div className="quest-done text-center">
            <p className="text-[12px] font-extrabold tracking-[.3em] text-bulb">HOÀN THÀNH NHIỆM VỤ</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-[30px] leading-none text-hall-text [text-shadow:0_2px_18px_rgba(0,0,0,.6)]">{banner}</p>
          </div>
        </div>
      )}

      {/* ===== Game Zone / karaoke ===== */}
      {activity?.kind === "claw" && world.current && (
        <ClawHud world={world.current} result={clawResult} onDrop={() => world.current?.claws[world.current.lastRef]?.drop()} onClose={endActivity} />
      )}
      {activity?.kind === "gacha" && <GachaReveal pin={activity.pin} isNew={activity.isNew} onClose={endActivity} />}
      {activity?.kind === "booth" && world.current && <PhotoBooth world={world.current} filmTitle={purchase?.filmTitle ?? "Rạp Online"} onClose={endActivity} onDone={() => {}} />}
      {activity?.kind === "karaoke" && world.current && (
        <KaraokePanel world={world.current} booth={activity.i} coins={wallet.coins} onClose={endActivity}
          pay={() => (applyWallet((x) => spend(x, PRICE.karaoke)) ? true : (noCoins(), false))}
          reward={(score) => { const bonus = score !== null && score >= 60 ? REWARD.karaokeScore : 0; if (bonus) applyWallet((x) => earn(x, bonus)); return bonus; }} />
      )}
      {activity?.kind === "quiz" && <QuizPanel quiz={quiz} onClose={endActivity} onAnswer={(q, c) => net.current?.answer(q, c)} />}
      {activity?.kind === "claw" && touch && <Joystick onMove={(x, y) => { if (world.current) world.current.input.joy = { x, y }; }} />}
      {bagOpen && <Bag wallet={wallet} onClose={() => setBagOpen(false)} />}
      {started && showLeft === null && !dialog && !activity && <EmoteBar onEmote={doEmote} />}

      {started && showLeft === null && !dialog && !activity && (
        <>
          {touch && <Joystick onMove={(x, y) => { if (world.current) world.current.input.joy = { x, y }; }} />}
          {prompt && (
            <div className={`absolute z-20 pop-in ${touch ? "right-4 bottom-[max(36px,env(safe-area-inset-bottom))]" : "left-1/2 -translate-x-1/2 bottom-[16%]"}`} key={prompt.label}>
              <button onClick={onInteract} className="hud-prompt flex items-center gap-3 min-h-[56px] pl-2 pr-5">
                <kbd className="keycap">{touch ? "✋" : "E"}</kbd>
                <span className="text-[16px] font-extrabold text-hall-text whitespace-nowrap">{prompt.label}</span>
              </button>
            </div>
          )}
          {queue.inQueue && !queue.atFront && (
            <button onClick={() => world.current?.leaveQueue()} className="absolute right-4 bottom-[max(30px,env(safe-area-inset-bottom))] z-20 h-12 px-5 rounded-full border-2 border-hall-text-2 bg-hall/80 font-extrabold">Rời hàng</button>
          )}
        </>
      )}

      {/* ===== Dialogs ===== */}
      {dialog === "board" && (
        <Kiosk title="LỊCH CHIẾU HÔM NAY" onClose={() => setDialog(null)}>
          <ul className="grid gap-2">
            {showing.slice(0, 14).map((f) => {
              const sch = scheduleFor(f);
              return (
                <li key={f.id} className="schedule-row">
                  <Poster film={f} className="w-[44px] shrink-0 rounded-[6px]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-[15px] leading-tight truncate">{f.vn && <span className="vn-chip">VN</span>}{f.title}</p>
                    <p className="mt-1 text-[13px] text-hall-text/70 tabular-nums">{upcomingSlots(sch.times, new Date()).slice(0, 5).map((x) => x.label).join(" · ")}</p>
                  </div>
                  <span className="room-chip">P{sch.room}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[13px] text-hall-text/60 text-center">Mua vé ở QUẦY VÉ bên trái sảnh.</p>
        </Kiosk>
      )}

      {dialog === "counter" && (
        <Kiosk title="QUẦY VÉ" steps={["Phim", "Ghế", "Xác nhận"]} step={counterStep === "film" ? 0 : counterStep === "seat" ? 1 : 2}
          onBack={counterStep === "seat" && !invite ? () => setCounterStep("film") : counterStep === "confirm" ? () => setCounterStep("seat") : undefined}
          onClose={() => { setDialog(null); world.current?.leaveQueue(); }}>
          {counterStep === "film" && (
            <>
              <p className="kiosk-say"><b>Bán vé</b> Chào {name}! Hôm nay xem phim gì?</p>
              <PosterRail films={showing} selected={filmId} onSelect={(id) => { setFilmId(id); setSlot(null); setSeat(null); }} label="Chọn phim" />
              <div className="mt-4"><FilmDetail film={film} room={scheduleFor(film).room} /></div>
              <p className="kicker mt-4">SUẤT CHIẾU</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {upcomingSlots(scheduleFor(film).times, new Date()).map((s) => (
                  <button key={s.st} onClick={() => { setSlot(s); setSeat(null); }} aria-pressed={slot?.st === s.st} className={`slot ${slot?.st === s.st ? "slot--on" : ""}`}>{s.label}</button>
                ))}
              </div>
              <button className="kiosk-cta" disabled={!slot} onClick={() => setCounterStep("seat")}>Chọn ghế ›</button>
            </>
          )}
          {counterStep === "seat" && chosenSlot && (
            <>
              <p className="kiosk-say"><b>Bán vé</b> {invite ? `${invite.h.n} đang ngồi ghế ${invite.h.s}. Ghế vàng là ngay cạnh đó nha!` : `${film.title}, suất ${chosenSlot.label}, phòng ${scheduleFor(film).room}. Bạn chọn ghế nhé.`}</p>
              <SeatChart taken={chart.taken} nearHost={chart.nearHost} seat={seat} onPick={setSeat} />
              <p className="mt-3 min-h-6 text-[16px] font-extrabold text-bulb text-center">{seat ? `Ghế ${seat}${invite && neighborLine(invite, seat).nextTo ? ` · ${neighborLine(invite, seat).nextTo} ✓` : ""}` : "Chạm một ghế trống"}</p>
              <button className="kiosk-cta" disabled={!seat} onClick={() => setCounterStep("confirm")}>Tiếp tục ›</button>
            </>
          )}
          {counterStep === "confirm" && chosenSlot && seat && (
            <>
              <div className="order">
                <Poster film={film} className="w-[96px] shrink-0 rounded-[10px]" />
                <dl className="order-rows">
                  <dt>Phim</dt><dd>{film.title}</dd>
                  <dt>Suất</dt><dd className="tabular-nums">{`${formatShowtime(chosenSlot.st)} · ${viDate(chosenSlot.d)}`}</dd>
                  <dt>Phòng</dt><dd>{scheduleFor(film).room}</dd>
                  <dt>Ghế</dt><dd className="text-bulb">{seat}</dd>
                  <dt>Giá</dt><dd>0đ <span className="text-hall-text/55 font-medium">· rạp mời</span></dd>
                </dl>
              </div>
              <label className="block mt-4">
                <span className="kicker">ĐIỀU ƯỚC IN TRÊN VÉ · KHÔNG BẮT BUỘC</span>
                <input value={wish} onChange={(e) => setWish(e.target.value)} maxLength={80} placeholder="VD: mong năm nay bớt deadline" className="kiosk-input mt-2" />
              </label>
              <button className="kiosk-cta" onClick={buy}>Xác nhận & in vé 🎟</button>
            </>
          )}
        </Kiosk>
      )}

      {eTicket && purchase && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/55 p-4" role="dialog" aria-label="Vé điện tử">
          <div className="eticket pop-in">
            <div className="eticket-top">
              <Poster film={filmById.get(purchase.t.f)!} className="w-[88px] shrink-0 rounded-[10px]" />
              <div className="min-w-0">
                <p className="kicker">VÉ ĐIỆN TỬ · RẠP ONLINE</p>
                <p className="font-[family-name:var(--font-display)] text-[22px] leading-tight mt-1">{purchase.filmTitle}</p>
                <p className="mt-1 text-[14px] text-hall-text/80 tabular-nums">{formatShowtime(purchase.t.st)} · {viDate(purchase.t.d)}</p>
              </div>
            </div>
            <div className="eticket-perf" aria-hidden />
            <div className="eticket-bottom">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1">
                <dt className="kicker">PHÒNG</dt><dt className="kicker">GHẾ</dt>
                <dd className="font-[family-name:var(--font-display)] text-[34px] leading-none">{purchase.room}</dd>
                <dd className="font-[family-name:var(--font-display)] text-[34px] leading-none text-bulb">{purchase.seat}</dd>
              </dl>
              <TicketCode seed={encodeToken(purchase.t) + purchase.seat} />
            </div>
            {(() => {
              const f = filmById.get(purchase.t.f)!;
              const no = ticketNo(encodeToken(purchase.t) + purchase.seat);
              return (
                <div className="eticket-meta">
                  <dl className="eticket-facts">
                    <div><dt>Thời lượng</dt><dd>{f.video ? `${f.video.minutes} phút` : "Trailer"}</dd></div>
                    <div><dt>Định dạng</dt><dd>2D · Phụ đề</dd></div>
                    <div><dt>Giá vé</dt><dd>0đ</dd></div>
                    <div><dt>Combo</dt><dd>{combo === "none" ? "—" : "Bắp + nước"}</dd></div>
                  </dl>
                  <Barcode seed={no} />
                  <p className="eticket-no">SỐ VÉ {no} · Có mặt trước giờ chiếu 10 phút · Vé không đổi trả</p>
                  <div className="eticket-holo" aria-hidden />
                </div>
              );
            })()}
            <button className="kiosk-cta mt-0" onClick={() => setETicket(false)}>Vào sảnh · soát vé ở cổng ›</button>
          </div>
        </div>
      )}

      {dialog === "concession" && (
        <Kiosk title="BẮP NƯỚC" onClose={() => setDialog(null)}>
          <p className="kiosk-say"><b>Bắp nước</b> Bắp mới nổ thơm phức! Hôm nay rạp tặng một combo, bạn chọn vị nào?</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(["caramel", "phomai", "ngot"] as Combo[]).map((c, i) => (
              <button key={c} onClick={() => { setCombo(c); world.current?.giveFood(); setDialog(null); setToast(`Đã lấy ${COMBO_LABELS[c]}`); }} aria-pressed={combo === c}
                className={`combo-card ${combo === c ? "combo-card--on" : ""}`}>
                <span className="text-[38px] leading-none" aria-hidden>{["🍯", "🧀", "🍿"][i]}</span>
                <b>{COMBO_LABELS[c].replace(" + Coca", "")}</b>
                <span>+ Coca 500ml</span>
                <em>Tặng</em>
              </button>
            ))}
          </div>
          <button onClick={() => setDialog(null)} className="lb-ghost w-full mt-3">Thôi, không ăn</button>
        </Kiosk>
      )}

      {dialog === "checker" && (
        <Kiosk title="SOÁT VÉ" onClose={() => setDialog(null)}>
          {!purchase ? (
            <>
              <p className="kiosk-say"><b>Soát vé</b> Bạn chưa có vé rồi. Mua ở QUẦY VÉ bên trái sảnh nha!</p>
              <button className="kiosk-cta" onClick={() => setDialog(null)}>OK</button>
            </>
          ) : (
            <>
              <p className="kiosk-say"><b>Soát vé</b> {`${purchase.filmTitle} · Phòng ${purchase.room} · Ghế ${purchase.seat}. Cho mình quét vé và xé cuống nha!`}</p>
              <div className="scan-stage">
                <div className="relative mx-auto w-[min(62vw,250px)] aspect-[1080/1350] overflow-hidden drop-shadow-[0_8px_14px_rgba(0,0,0,.45)]">
                  <img src={ticketUrl} alt={`Vé ${name}, ghế ${purchase.seat}`} className="absolute inset-0 w-full" style={{ clipPath: "inset(0 0 26% 0)" }} />
                  <img src={ticketUrl} alt="" aria-hidden className="absolute inset-0 w-full animate-[tear_900ms_900ms_ease-in_forwards]" style={{ clipPath: "inset(74% 0 0 0)" }} />
                  <div className="scan-line" aria-hidden />
                </div>
                <p className="scan-ok">✓ Vé hợp lệ · {purchase.seat}</p>
              </div>
              <button className="kiosk-cta" onClick={() => { beep(); world.current?.openGate(); setGateOpen(true); setDialog(null); setToast(`Mời bạn vào Phòng ${purchase.room}`); }}>Qua cổng ›</button>
            </>
          )}
        </Kiosk>
      )}

      {ended && purchase && me && (
        <div className="absolute inset-0 z-50 overflow-y-auto bg-hall/85 backdrop-blur-sm sheet-in">
          <button className="exit-btn stub-close" onClick={closeStub} aria-label="Đóng vé, quay lại rạp (Esc)">
            <span aria-hidden>✕</span><span>Đóng</span>{!touch && <kbd>Esc</kbd>}
          </button>
          <div className="mx-auto max-w-[430px] min-h-dvh flex flex-col pt-[calc(max(12px,env(safe-area-inset-top))+48px)]">
            <Stub t={purchase.t} me={me} toast={setToast} onSeatConflict={() => setToast("Ghế vừa có người, chọn ghế khác")} />
          </div>
        </div>
      )}
    </main>
  );
}
