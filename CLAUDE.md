## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. Route only to skills in the session's available-skills list; answer directly for quick questions or small scoped edits.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Testing
- `npm test` (Vitest): shared/ticket.ts rules, film merge, api/share and api/stub handlers. The stub tests render real PNGs; set `STUB_PREVIEW_DIR=/some/dir` to save them.
- `npm run typecheck`, `npm run build` (build-index → tsc → vite build → inline index.html into api/_lib/shell.generated.ts).
- `npm run dev` serves the SPA AND /api/stub + /s/{token} locally (vite.config.ts devApi plugin), so the whole flow works without the Vercel CLI.
- Design plan + review decisions: ~/.gstack/projects/annguyen/annguyen-cinema-online-design-20261102-102820.md. Tokens: DESIGN.md.

- 3D walkable cinema is the default UI: src/WorldApp.tsx (HUD) + src/world/World.ts (street, lobby, queue, counters, gate, corridor, hall) + Character.ts + Input.ts. `?2d` or no WebGL falls back to the 2D flow (src/App.tsx). Schedules: shared/schedule.ts.
- `npm run demo` (with `npm run dev` running) records demo/walkthrough.mp4 + .gif + step PNGs via Playwright + system ffmpeg. Set CHROME_PATH to reuse a cached Chromium if Playwright's browser build doesn't match.

- Heroes: KayKit Adventurers (CC0) sources in assets-src/kaykit/; `node scripts/optimize-heroes.mjs` writes public/heroes/*.glb (6 clips, 1 prop, meshopt, ~300 KB each). Characters clone templates with SkeletonUtils; call preloadHeroes() before `new Character`.

- Multiplayer: shared/rt.ts (protocol + sanitizers), server/relay.ts (transport-agnostic relay, tested in server/relay.test.ts), src/net/Net.ts (client). `npm run dev` mounts the relay at ws /rt (vite.config.ts devRealtime), so LAN players see each other and chat. Production: Vercel can't hold sockets; host the relay elsewhere and set VITE_RT_URL.
- Films: TMDB now-playing in Vietnam + recent Vietnamese productions (`vn: true`, listed first) via `npm run refresh-films` (key in gitignored .env; v3 key or v4 read token), plus real CC-licensed Blender open movies (data/films.json `video`, streamed from Wikimedia Commons). Old sample films stay with nowPlaying:false so old invite links resolve. `predev`/`build` regenerate data/films.index.json (the /s/ route validates film ids against it).

- Game Zone (west wing) + coin karaoke (east wing): src/world/arcade.ts (ClawMachine, GachaMachine, PhotoBooth, QuizScreen), src/world/karaoke.ts (booths + lyric TV), src/lib/karaoke.ts (Web Audio synth + optional mic scoring, nothing recorded), src/hud/Activities.tsx (HUD). Attractions take over the camera through World "modes" (enterMode/exitMode). Pure rules: shared/economy.ts (coins, claw odds, gacha), shared/songs.ts (public-domain songs), shared/quiz.ts (trivia from films.json); the relay runs synced quiz rounds (tick()).
- Wallet: src/lib/wallet.ts (localStorage, parsed defensively with parseWallet; `apply` decides synchronously from a ref).
- Booking UI: src/hud/Booking.tsx (real posters from Wikimedia Commons with a typographic fallback, kiosk sheet, e-ticket).
- Materials: Poly Haven CC0 textures/HDRIs in assets-src/polyhaven → `./scripts/optimize-textures.sh` (macOS sips) → public/tex, public/env. src/world/materials.ts `pbr()`; phones get colour maps only (`lite`).

- Set dressing lives in src/world/details.ts (POS, printer, menus, queue number, popcorn machine with popping kernels, soda fountain, turnstiles + scanner podium, standees, arcade cabinets, prize shelf, lounge tables, row letters). Stateful props register in World.ticker / gateKit / queueNo. Real posters on 3D surfaces go through World.realPoster() (TMDB/Commons, CORS) with the typographic poster as fallback.
- Character.holdItem(obj) puts an object in the right hand (staff scanner, popcorn bucket, player ticket → torn stub at the gate).

- Seat layout lives in shared/seats.ts (12 rows A–L × 16, aisle between 8|9); ticket rules, relay, seat chart and the 3D hall all read it.
- Characters: Character.ts has three template kinds: "rig" (KayKit, clips), "puppet" (src/world/people.ts: procedural people with limb pivots; staff uniforms StaffTicket/StaffSnack/StaffUsher and player looks SinhVien/CongSo/CoNang) and "static" (fan model). Pikachu (public/fan/pikachu.glb, converted from assets-src/pikachu-model by scripts/convert-obj.mjs) is a Nintendo character: offered only in dev builds unless VITE_FAN_MODELS=1.
- Hall: seated players can stand up (World.standUp → events.stood) and leave through the back door ("exit" spot → leaveHall → corridor). Re-sitting resumes the film.

- Owner-supplied OBJ models (Meshy/Tripo-style folders: base.obj + texture_*.png) live in assets-src/<name>; convert with `node scripts/convert-obj.mjs assets-src/<name> public/models/<name>.glb 0.6` and register in STATIC (Character.ts) with a height and `fan` flag. Current: Model1 "Anh Râu", Model2 "Chuối Vui", Model3 "Corgi" (public) + Pikachu (fan, dev only).
- Doors (details.ts swingDoors/slidingDoors): corridor room doors + hall exit swing during enterHall/leaveHall; entrance and karaoke booths are auto sliding doors (World.autoDoors, opened by proximity).

## Gotchas
- The dev relay is loaded once at server start: after editing shared/rt.ts or server/relay.ts, restart `npm run dev` (otherwise new heroes/messages are rejected and presence stays "Đang kết nối").
- Name tags + chat bubbles live on LABEL_LAYER (Character.ts); close-up modes disable it on the camera. Any extra camera (CharacterPreview) must enable it or tags vanish.
- Character one-shot clips (cheer/wave) need `oneShot`; otherwise animate() switches back to Idle on the next frame.
- Photo booth capture reads renderer.domElement right after render() in the same task (no preserveDrawingBuffer needed).
- Wikimedia returns 403 to headless Chromium, so the demo can't show the film playing; don't spoof the UA to get around it.
- gltf-transform: disposing an Animation does not dispose its channels/samplers; dispose them explicitly or prune() keeps every keyframe (3.5 MB → 1.9 MB instead of ~300 KB).
- GLTFLoader sanitizes node names ("handslot.l" → "handslotl").
- Indoors are closed rooms (walls up to the ceiling, ROOMS in World.ts) with a "dollhouse" camera: high and well back, clamped between the side walls, under the ceiling and at most 2 m behind the near wall; cutaway() hides only the wall between camera and room (south facade, hall back wall). Ceilings are single planes facing down. The street (exterior group) is hidden indoors. New rooms need a ROOMS entry and a zone in updateZone().
- Dev-only hooks: window.__world (debugWalk, seatZ) for scripts/demo-3d.mjs; stripped from production builds.
- Flat images in 3D (ticket, screen, signs) use toneMapped:false, otherwise ACES washes them out.
- @vercel/og is pinned to 0.11.1: 1.0.3's edge build loads hb.wasm, which isn't in the package, and its Node build crashes on import.
- Tests run @vercel/og's edge build under Node via the wasm-module plugin + test/setup-edge-fetch.ts (file: URL fetch shim).
- Satori: a div with more than one child needs display:flex; build text labels as one template string.
- Never btoa() raw text: tokens are UTF-8 bytes → base64url (Vietnamese names).
