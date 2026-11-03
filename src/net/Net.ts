// Client side of the realtime relay: reconnects with backoff, throttles state to ~8/s.
// URL: VITE_RT_URL if set (production host), else same-origin /rt (Vite dev server relay).
import type { ClientMsg, RtChat, RtHero, RtPeer, RtQuiz, RtState, ServerMsg } from "../../shared/rt";

export interface NetEvents {
  status(s: "connecting" | "online" | "offline" | "full"): void;
  welcome(id: string, peers: RtPeer[], history: RtChat[]): void;
  join(p: RtPeer): void;
  leave(id: string): void;
  state(id: string, s: RtState): void;
  chat(m: RtChat): void;
  quiz?(s: RtQuiz | null): void;
}

export class Net {
  private ws: WebSocket | null = null;
  private retry = 0;
  private timer = 0;
  private lastSent = "";
  private lastAt = 0;
  private closed = false;
  myId = "";

  constructor(private hello: { name: string; hero: RtHero }, private ev: NetEvents) { this.open(); }

  private url() {
    const env = import.meta.env.VITE_RT_URL as string | undefined;
    if (env) return env;
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/rt`;
  }

  private open() {
    if (this.closed) return;
    this.ev.status("connecting");
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.lastSent = ""; this.raw({ t: "hello", ...this.hello }); };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === "welcome") { this.myId = m.id; this.ev.status("online"); this.ev.welcome(m.id, m.peers, m.history); }
      else if (m.t === "join") this.ev.join(m.peer);
      else if (m.t === "leave") this.ev.leave(m.id);
      else if (m.t === "state") this.ev.state(m.id, m.s);
      else if (m.t === "chat") this.ev.chat(m.msg);
      else if (m.t === "full") { this.ev.status("full"); this.closed = true; }
      else if (m.t === "quiz") this.ev.quiz?.(m.s);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closed) return;
      this.ev.status("offline");
      const wait = Math.min(15000, 1000 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.open(), wait);
    };
  }

  private raw(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  /** Called every frame; sends only when something changed, at most ~8×/s (plus a 2 s heartbeat). */
  sendState(s: RtState) {
    const now = performance.now();
    const key = JSON.stringify(s);
    if (now - this.lastAt < 125 || (key === this.lastSent && now - this.lastAt < 2000)) return;
    this.lastAt = now;
    this.lastSent = key;
    this.raw({ t: "state", s });
  }

  chat(text: string) { this.raw({ t: "chat", text }); }
  quiz(on: boolean) { this.raw({ t: "quiz", on }); }
  answer(q: number, choice: number) { this.raw({ t: "answer", q, choice }); }

  dispose() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}
