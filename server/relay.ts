// Transport-agnostic relay: one shared cinema. Plug any socket in via `connect(send, close)`.
// Used by the Vite dev server (vite.config.ts) and testable without a network.
import { MAX_PEERS, sanitizeChat, sanitizeHello, sanitizeState, type ClientMsg, type RtChat, type RtPeer, type RtQuiz, type ServerMsg } from "../shared/rt";
import type { QuizQ } from "../shared/quiz";

const HISTORY = 20;
const CHAT_GAP_MS = 1200; // one message per 1.2 s per person
const STATE_GAP_MS = 50; // ≤ 20 state updates/s
const MAX_FRAME = 2048; // bytes

export interface Conn { receive(data: string): void; close(): void }

export const QUIZ_ASK_MS = 15000;
export const QUIZ_REVEAL_MS = 5000;

export function createRelay(now: () => number = Date.now, opts: { questions?: QuizQ[] } = {}) {
  const peers = new Map<string, { peer: RtPeer | null; send: (m: ServerMsg) => void; lastChat: number; lastState: number; quiz: boolean; score: number; picked?: number; pickedQ?: number }>();
  const questions = opts.questions ?? [];
  const quiz = { q: -1, phase: "ask" as "ask" | "reveal", endsAt: 0, running: false };
  const history: RtChat[] = [];
  let seq = 0;

  const broadcast = (m: ServerMsg, except?: string) => {
    for (const [id, p] of peers) if (id !== except && p.peer) p.send(m);
  };

  const players = () => [...peers.values()].filter((p) => p.peer && p.quiz);
  function quizView(p: { score: number; picked?: number; pickedQ?: number }, t: number): RtQuiz {
    const q = questions[quiz.q];
    const board = players().map((x) => ({ name: x.peer!.name, score: x.score })).sort((a, b) => b.score - a.score).slice(0, 5);
    return {
      q: quiz.q, text: q.text, options: q.options, phase: quiz.phase, endsIn: Math.max(0, quiz.endsAt - t),
      ...(quiz.phase === "reveal" ? { answer: q.answer } : {}), board, mine: p.score, ...(p.pickedQ === quiz.q ? { picked: p.picked } : {}),
    };
  }
  function startRound(t: number) {
    quiz.running = true;
    quiz.q = (quiz.q + 1) % questions.length;
    quiz.phase = "ask";
    quiz.endsAt = t + QUIZ_ASK_MS;
  }
  function pushQuiz(t: number) { for (const p of players()) p.send({ t: "quiz", s: quizView(p, t) }); }
  /** Advance the quiz clock; the host calls this a few times per second. */
  function tick() {
    if (!quiz.running) return;
    const t = now();
    if (players().length === 0) { quiz.running = false; return; }
    if (t < quiz.endsAt) return;
    if (quiz.phase === "ask") { quiz.phase = "reveal"; quiz.endsAt = t + QUIZ_REVEAL_MS; }
    else startRound(t);
    pushQuiz(t);
  }

  function connect(send: (m: ServerMsg) => void, kick: () => void): Conn {
    const id = (++seq).toString(36) + Math.random().toString(36).slice(2, 6);
    const me = { peer: null as RtPeer | null, send, lastChat: 0, lastState: 0, quiz: false, score: 0, picked: undefined as number | undefined, pickedQ: undefined as number | undefined };
    peers.set(id, me);
    return {
      receive(data) {
        if (data.length > MAX_FRAME) return;
        let m: ClientMsg;
        try { m = JSON.parse(data); } catch { return; }
        if (!m || typeof m !== "object") return;
        if (m.t === "hello" && !me.peer) {
          const h = sanitizeHello(m);
          if (!h) return kick();
          const joined = [...peers.values()].filter((p) => p.peer).length;
          if (joined >= MAX_PEERS) { send({ t: "full" }); return kick(); }
          me.peer = { id, name: h.name, hero: h.hero, s: { x: 0, z: 30, ry: Math.PI, zone: "street", moving: false } };
          send({ t: "welcome", id, peers: [...peers.values()].flatMap((p) => (p.peer && p.peer.id !== id ? [p.peer] : [])), history: [...history] });
          broadcast({ t: "join", peer: me.peer }, id);
          return;
        }
        if (!me.peer) return;
        const t = now();
        if (m.t === "state") {
          if (t - me.lastState < STATE_GAP_MS) return;
          const s = sanitizeState(m.s);
          if (!s) return;
          me.lastState = t;
          me.peer.s = s;
          broadcast({ t: "state", id, s }, id);
        } else if (m.t === "chat") {
          if (t - me.lastChat < CHAT_GAP_MS) return;
          const c = sanitizeChat(m.text);
          if (!c.ok) return;
          me.lastChat = t;
          const msg: RtChat = { id, name: me.peer.name, text: c.value, ts: t };
          history.push(msg);
          if (history.length > HISTORY) history.shift();
          broadcast({ t: "chat", msg }); // echo to the sender too: one source of truth
        } else if (m.t === "quiz") {
          me.quiz = m.on === true && questions.length > 0;
          if (me.quiz && !quiz.running) startRound(t);
          send({ t: "quiz", s: me.quiz ? quizView(me, t) : null });
        } else if (m.t === "answer") {
          if (!me.quiz || quiz.phase !== "ask" || m.q !== quiz.q || me.pickedQ === quiz.q) return;
          const q = questions[quiz.q];
          if (!Number.isInteger(m.choice) || m.choice < 0 || m.choice >= q.options.length) return;
          me.picked = m.choice;
          me.pickedQ = quiz.q;
          if (m.choice === q.answer) me.score += 100 + Math.round(50 * Math.max(0, quiz.endsAt - t) / QUIZ_ASK_MS); // faster = more
          send({ t: "quiz", s: quizView(me, t) });
        }
      },
      close() {
        const had = !!me.peer;
        peers.delete(id);
        if (had) broadcast({ t: "leave", id });
      },
    };
  }

  return { connect, tick, count: () => [...peers.values()].filter((p) => p.peer).length };
}
