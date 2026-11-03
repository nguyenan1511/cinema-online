/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @vercel/og's edge build imports "*.wasm?module" (a Vercel edge convention).
// Under Node (vitest, vite dev) compile those files into WebAssembly.Module ourselves.
function wasmModule(): Plugin {
  return {
    name: "wasm-module",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm?module")) return null;
      const file = JSON.stringify(id.slice(0, -"?module".length));
      return `import { readFileSync } from "node:fs";\nexport default new WebAssembly.Module(readFileSync(${file}));`;
    },
  };
}

// Dev only: WebSocket relay at /rt so players on this machine or the LAN see each other and chat.
// Production needs a host that keeps sockets open (Vercel functions can't); see server/relay.ts.
function devRealtime(): Plugin {
  return {
    name: "dev-realtime",
    apply: "serve",
    async configureServer(server) {
      const { WebSocketServer } = await import("ws");
      const { createRelay } = await server.ssrLoadModule("/server/relay.ts");
      const { buildQuestions } = await server.ssrLoadModule("/shared/quiz.ts");
      const films = (await server.ssrLoadModule("/data/films.json")).default;
      const relay = createRelay(Date.now, { questions: buildQuestions(films, 40) });
      setInterval(() => relay.tick(), 250);
      const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (!req.url?.startsWith("/rt")) return; // leave Vite's HMR socket alone
        wss.handleUpgrade(req, socket, head, (ws) => {
          const conn = relay.connect((m: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m)), () => ws.close());
          ws.on("message", (d) => conn.receive(d.toString()));
          ws.on("close", () => conn.close());
          ws.on("error", () => ws.close());
        });
      });
    },
  };
}

// Dev only: run api/stub and api/share in the Vite dev server so the whole flow can be
// clicked through locally without the Vercel CLI. Production uses Vercel functions.
function devApi(): Plugin {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url ?? "/";
        const route = path.startsWith("/api/stub") ? "/api/stub.tsx" : path.startsWith("/s/") || path.startsWith("/api/share") ? "/api/share.ts" : null;
        if (!route) return next();
        try {
          await server.ssrLoadModule("/test/setup-edge-fetch.ts");
          const mod = await server.ssrLoadModule(route);
          let shell: string | undefined;
          if (route === "/api/share.ts") shell = await server.transformIndexHtml(path, (await import("node:fs")).readFileSync("index.html", "utf8"));
          const handler = route === "/api/share.ts"
            ? (await server.ssrLoadModule("/api/_lib/share.ts")).createShareHandler({ films: (await server.ssrLoadModule("/data/films.index.json")).default, shell })
            : mod.default;
          const out: Response = await handler(new Request(`http://${req.headers.host}${path}`));
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await out.arrayBuffer()));
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), wasmModule(), devApi(), devRealtime()],
  test: {
    include: ["shared/**/*.test.ts", "api/**/*.test.ts", "scripts/**/*.test.ts", "server/**/*.test.ts"],
    testTimeout: 30000,
    setupFiles: ["test/setup-edge-fetch.ts"],
    // Test the same @vercel/og build that runs on Vercel's edge runtime
    // (its Node build crashes on import: "Dynamic require of fs").
    server: { deps: { inline: [/@vercel\/og/] } },
  },
  ssr: { noExternal: [/@vercel\/og/], resolve: { conditions: ["edge-light", "import"], externalConditions: ["edge-light"] } },
});
