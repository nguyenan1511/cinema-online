// Production realtime relay: one Node process holding WebSockets (presence, chat, emotes, quiz).
// Vercel functions can't keep sockets open, so this runs on a host that can (Render, Railway,
// Fly.io, a VPS…). The SPA connects to it via VITE_RT_URL (wss://<host>/rt).
//
// Env: PORT (default 8787) · ALLOWED_ORIGINS (comma-separated, e.g. https://rap.vercel.app;
// empty = allow all, fine for testing only).
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import films from "../data/films.json";
import { createRelay } from "./relay";
import { buildQuestions } from "../shared/quiz";
import type { Film } from "../shared/films";

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const relay = createRelay(Date.now, { questions: buildQuestions(films as Film[], 40) });
setInterval(() => relay.tick(), 250);

const http = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, players: relay.count() }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
http.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/rt")) return socket.destroy();
  const origin = req.headers.origin ?? "";
  if (ALLOWED.length && !ALLOWED.includes(origin)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    const conn = relay.connect((m) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), () => ws.close());
    let alive = true;
    ws.on("pong", () => { alive = true; });
    const ping = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 30000); // drop dead sockets
    ws.on("message", (d) => conn.receive(d.toString()));
    ws.on("close", () => { clearInterval(ping); conn.close(); });
    ws.on("error", () => ws.close());
  });
});

http.listen(PORT, () => console.log(`relay listening on :${PORT} (origins: ${ALLOWED.length ? ALLOWED.join(", ") : "any"})`));
