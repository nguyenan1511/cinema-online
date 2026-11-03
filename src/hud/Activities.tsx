// HUD for the Game Zone + karaoke: coins, claw machine, gacha reveal, 4-cut photo booth,
// coin karaoke, room quiz, emotes and the prize bag. Visual language: the same dark-glass
// "hud-panel" + bulb-gold accents as the rest of the HUD (DESIGN.md).
import { useEffect, useRef, useState } from "react";
import { PINS, PLUSH, type Pin, type Wallet } from "../../shared/economy";
import { SONGS, type Song } from "../../shared/songs";
import type { RtEmote, RtQuiz } from "../../shared/rt";
import { KaraokePlayer } from "../lib/karaoke";
import type { World } from "../world/World";

export function CoinPill({ coins, onClick }: { coins: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="coin-pill pointer-events-auto" aria-label={`${coins} xu. Mở túi đồ`}>
      <span className="coin" aria-hidden>₫</span>
      <span className="tabular-nums">{coins}</span>
      <span className="text-[13px] opacity-70">xu</span>
    </button>
  );
}

/** Full-screen activity frame: title chip top-left, close top-right, content docked at the bottom. */
function Stage({ title, onClose, children, top }: { title: string; onClose?: () => void; children: React.ReactNode; top?: React.ReactNode }) {
  return (
    <div className="activity" role="dialog" aria-label={title}>
      <div className="activity-top">
        <p className="activity-title">{title}</p>
        {top}
        {onClose && <button className="lb-btn" onClick={onClose} aria-label="Thoát">✕</button>}
      </div>
      <div className="activity-bottom">{children}</div>
    </div>
  );
}

// ---------- claw machine ----------

export function ClawHud({ world, onDrop, onClose, result }: { world: World; onDrop: () => void; onClose: () => void; result: { prize: string | null; note: string } | null }) {
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 200); return () => clearInterval(id); }, []);
  const claw = world.claws[world.lastRef];
  const aiming = claw?.phase === "aim";
  const plush = result?.prize ? PLUSH.find((p) => p.id === result.prize) : null;
  return (
    <Stage title="GẮP GẤU" onClose={!aiming || result ? onClose : undefined}
      top={aiming ? <span className="activity-timer tabular-nums">{claw.secondsLeft}s</span> : null}>
      {result ? (
        <div className="prize-card pop-in">
          <p className="text-[44px] leading-none" aria-hidden>{plush ? "🧸" : "😅"}</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-[22px]">{plush ? `Bạn gắp được ${plush.name}!` : result.note}</p>
          <p className="mt-1 text-[14px] text-hall-text/70">{plush ? "Đã cho vào túi đồ." : "Mỗi lượt 1 xu. Canh ngay giữa con gấu nhé."}</p>
          <button className="lb-cta mt-4" onClick={onClose}>Xong</button>
        </div>
      ) : aiming ? (
        <div className="flex items-end justify-between gap-3">
          <p className="hud-panel px-3 py-2 text-[14px] max-w-[60%]">Di chuyển móc bằng <b className="text-bulb">WASD / cần điều khiển</b>, canh trên đầu gấu rồi bấm gắp.</p>
          <button className="claw-btn" onClick={onDrop} aria-label="Thả móc gắp">GẮP!</button>
        </div>
      ) : (
        <p className="hud-panel px-4 py-2 text-[15px] font-bold self-center">Đang gắp…</p>
      )}
    </Stage>
  );
}

// ---------- gacha ----------

export function GachaReveal({ pin, isNew, onClose }: { pin: Pin | null; isNew: boolean; onClose: () => void }) {
  return (
    <Stage title="GACHA" onClose={pin ? onClose : undefined}>
      {pin ? (
        <div className={`prize-card pop-in rarity-${pin.rarity === "siêu hiếm" ? "ssr" : pin.rarity === "hiếm" ? "sr" : "r"}`}>
          <p className="text-[12px] font-extrabold tracking-[.2em] text-bulb">{pin.rarity.toUpperCase()}{isNew ? " · MỚI!" : ""}</p>
          <p className="text-[64px] leading-none mt-2" aria-hidden>{pin.emoji}</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-[22px]">Huy hiệu {pin.name}</p>
          <button className="lb-cta mt-4" onClick={onClose}>Cất vào túi</button>
        </div>
      ) : <p className="hud-panel px-4 py-2 text-[15px] font-bold self-center">Đang quay…</p>}
    </Stage>
  );
}

// ---------- photo booth ----------

const POSES: { label: string; emote: RtEmote | null }[] = [
  { label: "Cười thật tươi!", emote: null },
  { label: "Vẫy tay nào!", emote: "wave" },
  { label: "Cổ vũ!", emote: "cheer" },
  { label: "Nhảy lên!", emote: "dance" },
];
const FRAMES = [
  { id: "night", label: "Đêm", bg: "#141015", fg: "#f2c14e" },
  { id: "pink", label: "Hồng", bg: "#ffb3cf", fg: "#4a1030" },
  { id: "cream", label: "Kem", bg: "#f6eedf", fg: "#6e1f2a" },
];

export function PhotoBooth({ world, filmTitle, onClose, onDone }: { world: World; filmTitle: string; onClose: () => void; onDone: () => void }) {
  const [frame, setFrame] = useState(FRAMES[0]);
  const [step, setStep] = useState<"pick" | "shoot" | "result">("pick");
  const [count, setCount] = useState(0);
  const [shot, setShot] = useState(0);
  const [flash, setFlash] = useState(false);
  const [strip, setStrip] = useState<string | null>(null);
  const shots = useRef<HTMLCanvasElement[]>([]);

  const shoot = async () => {
    setStep("shoot");
    shots.current = [];
    for (let i = 0; i < 4; i++) {
      setShot(i);
      for (let c = 3; c >= 1; c--) {
        setCount(c);
        if (c === 1 && POSES[i].emote) world.emote(POSES[i].emote!);
        await new Promise((r) => setTimeout(r, 800));
      }
      setCount(0);
      const src = await world.capture();
      shots.current.push(crop45(src));
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      await new Promise((r) => setTimeout(r, 450));
    }
    setStrip(composeStrip(shots.current, frame, filmTitle));
    setStep("result");
    onDone();
  };

  const share = async () => {
    if (!strip) return;
    const blob = await (await fetch(strip)).blob();
    const file = new File([blob], "rap-online-4cut.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Rạp Online · 4 kiểu" }).catch(() => {});
    else download(strip);
  };

  return (
    <>
      {flash && <div className="booth-flash" aria-hidden />}
      <Stage title="PHOTO 4 KIỂU" onClose={step !== "shoot" ? onClose : undefined}
        top={step === "shoot" ? <span className="activity-timer">{shot + 1}/4</span> : null}>
        {step === "pick" && (
          <div className="hud-panel p-4 w-full max-w-[460px] mx-auto">
            <p className="text-[14px] text-hall-text/80">Chọn khung, đứng yên trong buồng. Máy chụp 4 tấm, mỗi tấm một dáng.</p>
            <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Khung ảnh">
              {FRAMES.map((f) => (
                <button key={f.id} role="radio" aria-checked={f.id === frame.id} onClick={() => setFrame(f)}
                  className={`frame-chip ${f.id === frame.id ? "frame-chip--on" : ""}`} style={{ background: f.bg, color: f.fg }}>{f.label}</button>
              ))}
            </div>
            <button className="lb-cta w-full mt-4" onClick={shoot}>Bắt đầu chụp</button>
          </div>
        )}
        {step === "shoot" && (
          <div className="booth-count" aria-live="assertive">
            {count > 0 ? <><span className="booth-num">{count}</span><span className="booth-pose">{POSES[shot].label}</span></> : <span className="booth-pose">📸</span>}
          </div>
        )}
        {step === "result" && strip && (
          <div className="flex items-end gap-3 justify-center w-full">
            <img src={strip} alt="Dải ảnh 4 kiểu vừa chụp" className="booth-strip pop-in" />
            <div className="flex flex-col gap-2">
              <button className="lb-cta" onClick={share}>Chia sẻ</button>
              <button className="lb-ghost" onClick={() => download(strip)}>Lưu ảnh</button>
              <button className="lb-ghost" onClick={() => { setStrip(null); setStep("pick"); }}>Chụp lại</button>
            </div>
          </div>
        )}
      </Stage>
    </>
  );
}

function crop45(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  let w = W, h = Math.round(W * 1.25);
  if (h > H) { h = H; w = Math.round(H / 1.25); }
  const c = document.createElement("canvas");
  c.width = 540; c.height = 675;
  c.getContext("2d")!.drawImage(src, (W - w) / 2, (H - h) / 2, w, h, 0, 0, 540, 675);
  return c;
}

function composeStrip(shots: HTMLCanvasElement[], f: (typeof FRAMES)[number], film: string): string {
  const pad = 30, w = 540, h = 675;
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = pad + shots.length * (h + pad) + 150;
  const g = c.getContext("2d")!;
  g.fillStyle = f.bg;
  g.fillRect(0, 0, c.width, c.height);
  shots.forEach((s, i) => g.drawImage(s, pad, pad + i * (h + pad)));
  const y = pad + shots.length * (h + pad);
  g.fillStyle = f.fg;
  g.textAlign = "center";
  g.font = `400 52px Bungee, "Be Vietnam Pro", sans-serif`;
  g.fillText("RẠP ONLINE", c.width / 2, y + 62);
  g.font = `700 24px "Be Vietnam Pro", sans-serif`;
  const d = new Date();
  g.fillText(`${film} · ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`, c.width / 2, y + 104);
  return c.toDataURL("image/png");
}
function download(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = "rap-online-4cut.png";
  a.click();
}

// ---------- coin karaoke ----------

export function KaraokePanel({ world, booth, coins, pay, onClose, reward }: {
  world: World; booth: number; coins: number; pay: () => boolean; onClose: () => void; reward: (score: number | null) => number;
}) {
  const [song, setSong] = useState<Song>(SONGS[0]);
  const [mic, setMic] = useState(false);
  const [playing, setPlaying] = useState<KaraokePlayer | null>(null);
  const [frame, setFrame] = useState<{ line: number; index: number; t: number; voiced: boolean }>({ line: 0, index: -1, t: 0, voiced: false });
  const [result, setResult] = useState<{ score: number | null; coins: number } | null>(null);
  useEffect(() => () => playing?.stop(), [playing]);

  const start = async () => {
    if (!pay()) return;
    const p = new KaraokePlayer(song, (f) => {
      setFrame(f);
      world.karaokeLyrics(booth, song, f.line, f.index);
      if (f.done) { const score = p.score(); setResult({ score, coins: reward(score) }); setPlaying(null); }
    });
    setPlaying(p);
    setResult(null);
    await p.start(mic);
  };
  const lineNotes = song.lines[frame.line] ?? [];
  return (
    <Stage title={`PHÒNG HÁT ${booth + 1}`} onClose={() => { playing?.stop(); onClose(); }}
      top={playing ? <span className="activity-timer tabular-nums">{Math.max(0, Math.floor(playing.length - frame.t))}s</span> : null}>
      {result ? (
        <div className="prize-card pop-in">
          <p className="text-[12px] font-extrabold tracking-[.2em] text-bulb">{result.score === null ? "HOÀN THÀNH" : "ĐIỂM CỦA BẠN"}</p>
          <p className="font-[family-name:var(--font-display)] text-[56px] leading-none mt-1">{result.score ?? "🎤"}</p>
          <p className="mt-2 text-[14px] text-hall-text/75">{result.coins > 0 ? `+${result.coins} xu thưởng!` : result.score === null ? "Bật mic lần sau để được chấm điểm và nhận xu." : "Hát to hơn chút để được thưởng xu nhé."}</p>
          <div className="mt-4 flex gap-2 justify-center"><button className="lb-cta" onClick={() => setResult(null)}>Hát bài khác</button><button className="lb-ghost" onClick={onClose}>Ra ngoài</button></div>
        </div>
      ) : playing ? (
        <div className="karaoke-lyrics" aria-live="polite">
          <p className="text-[24px] font-extrabold leading-snug">
            {lineNotes.filter((n) => n[2]).map((n, i) => {
              const realIndex = lineNotes.indexOf(n);
              return <span key={i} className={realIndex <= frame.index ? "text-bulb" : "text-hall-text"}>{n[2]} </span>;
            })}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {playing.micOn && <span className={`mic-dot ${frame.voiced ? "mic-dot--on" : ""}`} aria-label={frame.voiced ? "Đang nghe bạn hát" : "Mic đang bật"} />}
            <div className="flex-1 letterbox-progress"><i style={{ width: `${Math.min(100, (frame.t / playing.length) * 100)}%` }} /></div>
            <button className="lb-ghost" onClick={() => { playing.stop(); setPlaying(null); }}>Dừng</button>
          </div>
        </div>
      ) : (
        <div className="hud-panel p-4 w-full max-w-[480px] mx-auto">
          <ul className="grid gap-2" role="radiogroup" aria-label="Chọn bài hát">
            {SONGS.map((s) => (
              <li key={s.id}>
                <button role="radio" aria-checked={s.id === song.id} onClick={() => setSong(s)} className={`song-row ${s.id === song.id ? "song-row--on" : ""}`}>
                  <b>{s.title}</b><span>{s.credit}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} className="w-5 h-5 accent-[var(--color-bulb)]" />
            Chấm điểm bằng mic (chỉ phân tích trên máy bạn, không ghi âm)
          </label>
          <button className="lb-cta w-full mt-3" disabled={coins < 1} onClick={start}>{coins < 1 ? "Hết xu" : "Hát · 1 xu"}</button>
        </div>
      )}
    </Stage>
  );
}

// ---------- quiz ----------

export function QuizPanel({ quiz, onAnswer, onClose }: { quiz: RtQuiz | null; onAnswer: (q: number, choice: number) => void; onClose: () => void }) {
  const [now, setNow] = useState(() => performance.now());
  const got = useRef({ at: performance.now(), endsIn: 0 });
  useEffect(() => { got.current = { at: performance.now(), endsIn: quiz?.endsIn ?? 0 }; }, [quiz]);
  useEffect(() => { const id = setInterval(() => setNow(performance.now()), 250); return () => clearInterval(id); }, []);
  const left = Math.max(0, Math.ceil((got.current.endsIn - (now - got.current.at)) / 1000));
  return (
    <Stage title="ĐỐ VUI" onClose={onClose} top={quiz ? <span className="activity-timer tabular-nums">{left}s</span> : null}>
      {!quiz ? <p className="hud-panel px-4 py-2 self-center">Đang vào phòng đố vui…</p> : (
        <div className="hud-panel p-4 w-full max-w-[520px] mx-auto">
          <p className="text-[12px] font-extrabold tracking-[.18em] text-bulb">CÂU {quiz.q + 1} · {quiz.phase === "ask" ? "CHỌN ĐÁP ÁN" : "ĐÁP ÁN"}</p>
          <p className="mt-1 text-[18px] font-extrabold leading-snug">{quiz.text}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {quiz.options.map((o, i) => {
              const state = quiz.phase === "reveal" ? (i === quiz.answer ? "right" : i === quiz.picked ? "wrong" : "") : i === quiz.picked ? "picked" : "";
              return (
                <button key={i} disabled={quiz.phase !== "ask" || quiz.picked !== undefined} onClick={() => onAnswer(quiz.q, i)} className={`quiz-opt ${state ? `quiz-opt--${state}` : ""}`}>
                  <span className="quiz-key">{"ABCD"[i]}</span>{o}
                </button>
              );
            })}
          </div>
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-hall-text/80" aria-label="Bảng xếp hạng">
            {quiz.board.map((b, i) => <li key={i}><b className="text-bulb">{i + 1}.</b> {b.name} · {b.score}</li>)}
            <li className="ml-auto">Điểm bạn: <b>{quiz.mine ?? 0}</b></li>
          </ol>
        </div>
      )}
    </Stage>
  );
}

// ---------- emotes + bag ----------

const EMOTE_LIST: { id: RtEmote; icon: string; label: string }[] = [
  { id: "wave", icon: "👋", label: "Vẫy tay" },
  { id: "cheer", icon: "🎉", label: "Cổ vũ" },
  { id: "dance", icon: "💃", label: "Nhảy" },
  { id: "clap", icon: "👏", label: "Vỗ tay" },
];
export function EmoteBar({ onEmote }: { onEmote: (e: RtEmote) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) onEmote(EMOTE_LIST[i].id);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onEmote]);
  return (
    <div className="emote-bar">
      {open && EMOTE_LIST.map((e, i) => (
        <button key={e.id} className="emote-btn pop-in" style={{ animationDelay: `${i * 30}ms` }} onClick={() => { onEmote(e.id); setOpen(false); }} aria-label={`${e.label} (phím ${i + 1})`}>
          <span aria-hidden>{e.icon}</span>
        </button>
      ))}
      <button className={`emote-btn emote-btn--main ${open ? "emote-btn--open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Biểu cảm">😀</button>
    </div>
  );
}

export function Bag({ wallet, onClose }: { wallet: Wallet; onClose: () => void }) {
  const plushCount = (id: string) => wallet.plush.filter((p) => p === id).length;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-4" role="dialog" aria-label="Túi đồ" onClick={onClose}>
      <div className="hud-panel w-full max-w-[460px] p-5 pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-[20px]">TÚI ĐỒ</p>
          <button className="lb-btn" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <p className="mt-1 text-[14px] text-hall-text/75"><b className="text-bulb">{wallet.coins} xu</b> · kiếm thêm xu: đố vui đúng, xem hết phim, hát karaoke được chấm điểm.</p>
        <p className="mt-4 text-[12px] font-extrabold tracking-[.18em] text-bulb">GẤU BÔNG</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {PLUSH.map((p) => (
            <div key={p.id} className={`bag-cell ${plushCount(p.id) ? "" : "bag-cell--empty"}`} title={p.name}>
              <span className="bag-swatch" style={{ background: `#${p.color.toString(16).padStart(6, "0")}` }} aria-hidden>🧸</span>
              <span className="text-[11px] leading-tight">{plushCount(p.id) ? `${p.name} ×${plushCount(p.id)}` : "???"}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] font-extrabold tracking-[.18em] text-bulb">HUY HIỆU GACHA · {new Set(wallet.pins).size}/{PINS.length}</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {PINS.map((p) => {
            const has = wallet.pins.includes(p.id);
            return <div key={p.id} className={`bag-cell ${has ? "" : "bag-cell--empty"}`} title={has ? `${p.name} (${p.rarity})` : "Chưa có"}><span className="text-[26px]" aria-hidden>{has ? p.emoji : "❔"}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}
