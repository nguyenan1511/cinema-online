// The walkable cinema: street → facade → lobby (queue at QUẦY VÉ, BẮP NƯỚC, LỊCH CHIẾU board,
// SOÁT VÉ gate) → corridor with PHÒNG 1-3 → tiered hall where you find your seat and sit.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";
import { Character, heroOrFallback, LABEL_LAYER, lookFromSeed, type Look } from "./Character";
import { loadEnv, pbr } from "./materials";
import { ClawMachine, GachaMachine, PhotoBooth, QuizScreen, type Mode } from "./arcade";
import { KaraokeBooth } from "./karaoke";
import { slidingDoors, swingDoors, type Door } from "./details";
import { arcadeCabinet, cupStack, floorDecal, loungeTable, menuBoard, popcornBucket, popcornMachine, posMonitor, prizeShelf, queueDisplay, rowLetter, scannerPodium, sodaFountain, standee, ticketPrinter, turnstile } from "./details";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Song } from "../../shared/songs";
import { Input } from "./Input";
import type { RtEmote, RtPeer, RtState } from "../../shared/rt";

const FONT = '"Be Vietnam Pro", sans-serif';
const COL = {
  hall: 0x2b1216, velvet: 0x6e1f2a, velvetDark: 0x4a1019, ink: 0x2a2320, stamp: 0xc8372d, bulb: 0xf2c14e,
  wood: 0x5a3324, cream: 0xf3e3a1, asphalt: 0x2a2a2e, sidewalk: 0x6d6a66, facade: 0x3a1a1d,
};
import { AISLE_AFTER, COLS, ROWS } from "../../shared/seats";
export { ROWS };
const H = -80; // hall origin (z)
const SCREEN = { z: -14.2, y: 4.8, w: 14, h: 6 };
const QUEUE_SLOTS = [-10.4, -9.3, -8.2, -7.1, -6.0, -4.9, -3.8].map((x) => new THREE.Vector3(x, 0, 10));
const SERVICE_SECONDS = 2.5;
const SPEED = 3.6;
const ACCEL = 14; // 1/s: how fast velocity follows input (smooth starts/stops)
const R = 0.3; // player radius
const TIER = 0.32; // stadium seating rise per row
const ROW_D = 1.25; // row pitch (recliners need legroom)
const SEAT_W = 0.72; // seat pitch inside a block
const FIRST_ROW_Z = -9; // row A, hall-local z
const ROW_N = ROWS.length;
const LAST_EDGE = FIRST_ROW_Z + (ROW_N - 1) * ROW_D + ROW_D / 2; // back edge of the last row
const BACK_Y = (ROW_N - 1) * TIER; // entrance platform behind the last row
const BACK_WALL = 9.5; // hall-local z of the back wall
const HALL_CEIL = 10.5;
const HALL_W = 7.6; // half width (side aisles beyond the seat blocks)
// Wings off the lobby: arcade (west) and coin-karaoke (east).
export const ARCADE = { x0: -28, x1: -14, z0: 4, z1: 18 };
export const KARAOKE = { x0: 14, x1: 28, z0: 4, z1: 18 };
const STAFF_LIFT = 0.42; // raised floor behind the ticket + snack counters, so staff show above the counter
const LOBBY_H = 8; // lobby ceiling: tall and closed in
const WING_H = 7;
/** Inside each zone the follow camera is kept within the room (walls go up to the ceiling). */
const ROOMS: Partial<Record<Zone, { x0: number; x1: number; z0: number; z1: number; ceil: number }>> = {
  lobby: { x0: -14, x1: 14, z0: 2, z1: 18, ceil: LOBBY_H },
  arcade: { x0: -28, x1: -14, z0: 4, z1: 18, ceil: WING_H },
  karaoke: { x0: 14, x1: 28, z0: 4, z1: 18, ceil: WING_H },
  corridor: { x0: 6, x1: 14, z0: -4, z1: 2, ceil: LOBBY_H },
  hall: { x0: -HALL_W, x1: HALL_W, z0: -80 + SCREEN.z - 0.5, z1: -80 + BACK_WALL, ceil: HALL_CEIL },
};

export function seatLocal(id: string): THREE.Vector3 {
  const r = (ROWS as readonly string[]).indexOf(id[0]);
  const c = Number(id.slice(1));
  const x = c <= AISLE_AFTER ? -(1.0 + (AISLE_AFTER - c) * SEAT_W) : 1.0 + (c - AISLE_AFTER - 1) * SEAT_W;
  return new THREE.Vector3(x, r * TIER, FIRST_ROW_Z + r * ROW_D);
}
const seatWorld = (id: string) => seatLocal(id).add(new THREE.Vector3(0, 0, H));

export type Zone = "street" | "lobby" | "corridor" | "hall" | "arcade" | "karaoke";
export type PromptId = "queue" | "board" | "concession" | "checker" | "door" | "seat" | "exit" | "claw" | "gacha" | "booth" | "quiz" | "karaoke";
export interface Prompt { id: PromptId; label: string }
export interface QueueInfo { inQueue: boolean; ahead: number; atFront: boolean }
export interface WorldEvents {
  prompt(p: Prompt | null): void;
  queue(q: QueueInfo): void;
  zone(z: Zone): void;
  fade(on: boolean): void;
  toast(msg: string): void;
  seated(): void;
  /** Left the seat (stood up); the show HUD should close. */
  stood(): void;
}
export interface FilmBoardRow { title: string; room: number; times: string[]; poster?: string }
export interface HallSetup { room: number; seat: string; show: string; occupants: { seat: string; name: string; friend: boolean }[]; filler: string[] }

interface Box { x0: number; x1: number; z0: number; z1: number; on?: () => boolean }
interface Spot { id: PromptId; pos: THREE.Vector3; r: number; label: () => string | null; ref?: number }
interface Agent { lift?: number; ch: Character; path: THREE.Vector3[]; speed: number; onArrive?: () => void; leaving?: boolean; entering?: boolean; serveT?: number; player?: boolean }

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function signTex(text: string, w: number, h: number, bg: string, fg: string, size: number) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + size * 0.06);
  });
}
const std = (c: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...extra });
const flat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false });

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 120);
  readonly input = new Input();
  private timer = new THREE.Timer();
  // Quality tier: phones skip bloom and render at a lower pixel ratio.
  private high = matchMedia("(pointer: fine)").matches;
  private get lite() { return !this.high; } // phones: colour maps only
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private dust!: THREE.Points;
  private frame = 0;
  private disposed = false;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  private player: Agent;
  private npcs: Agent[] = [];
  private queue: Agent[] = [];
  private boxes: Box[] = [];
  private spots: Spot[] = [];
  private floors: THREE.Object3D[] = [];
  private tapTarget: THREE.Vector3 | null = null;
  private camLook = new THREE.Vector3();
  private lastPrompt = "";
  private lastQueue = "";
  private zone: Zone = "street";
  // Game Zone + karaoke
  readonly claws: ClawMachine[] = [];
  gacha!: GachaMachine;
  booth!: PhotoBooth;
  quiz!: QuizScreen;
  readonly karaoke: KaraokeBooth[] = [];
  private mode: Mode | null = null;
  private modeReturn: THREE.Vector3 | null = null;
  /** Which machine/booth the last interaction was with (claw / karaoke index). */
  lastRef = 0;
  private captureCb: ((c: HTMLCanvasElement) => void) | null = null;
  private activeClaw: ClawMachine | null = null;
  // set dressing with state
  private ticker: ((dt: number, t: number) => void)[] = [];
  private roomDoors: Door[] = [];
  private hallExit!: Door;
  /** Auto doors: open while the player is within `r` of `at`. */
  private autoDoors: { door: Door; at: THREE.Vector3; r: number }[] = [];
  private queueNo: ReturnType<typeof queueDisplay> | null = null;
  private served = 21;
  private gateKit: { setGreen: (on: boolean) => void }[] = [];
  private scanner: ReturnType<typeof scannerPodium> | null = null;
  private staff: { ch: Character; home: number; waveCd: number }[] = [];
  private posterLoader = new THREE.TextureLoader().setCrossOrigin("anonymous");
  private envs: { lobby?: THREE.Texture; hall?: THREE.Texture } = {};
  private envBase = 0.22;
  private sky!: THREE.Texture;
  private indoor = new THREE.Color(0x0a0507);

  // story state
  hasTicket = false;
  gateOpen = false;
  myRoom = 0;
  mySeat = "";
  seated = false;
  private atFrontNotified = false;

  private lights: { l: THREE.Light; base: number }[] = [];
  private dim = { v: 0, target: 0 };
  private bulbs: THREE.Mesh[] = [];
  private boardMat!: THREE.MeshBasicMaterial;
  private hallSignMat!: THREE.MeshBasicMaterial;
  private screenMat!: THREE.MeshBasicMaterial;
  private screenMesh!: THREE.Mesh;
  private video: HTMLVideoElement | null = null;
  private trailerKey: string | null = null;
  private baseFov = 55;
  private css: CSS3DRenderer | null = null;
  private trailerObj: CSS3DObject | null = null; // official YouTube trailer, placed on the 3D screen
  private beam!: THREE.Mesh;
  private leader: { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D; start: number } | null = null;
  private seatMesh!: THREE.InstancedMesh;
  private seatIds: string[] = [];
  private hallPeople = new THREE.Group();
  private seatedCrowd: Character[] = [];
  private crowdBySeat = new Map<string, Character>();
  private myShow = "";
  private peers = new Map<string, { ch: Character; s: RtState; name: string; target: THREE.Vector3; seat?: string; en?: number }>();
  private myEmote: { em: RtEmote; en: number } | null = null;
  private seatMarker!: THREE.Group;
  private hallGlow: THREE.MeshStandardMaterial[] = []; // sconces: dim with the house lights
  private gateBar!: THREE.Mesh;
  private beacon!: THREE.Group;
  private vel = new THREE.Vector2();
  // Cut-away: walls between the follow camera and the player are hidden by zone.
  private facade = new THREE.Group();
  private exterior = new THREE.Group(); // street, trees, lamps: hidden once you are inside
  private hallBack = new THREE.Group(); // hall back wall: cut away when the camera is behind it
  private lobbyBack = new THREE.Group();

  constructor(private container: HTMLElement, private events: WorldEvents, opts: { look: Look; name: string; films: FilmBoardRow[] }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.high ? 2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);
    this.sky = canvasTex(2, 512, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, "#0f0a1f");
      grad.addColorStop(0.55, "#3a1d3f");
      grad.addColorStop(1, "#b5593f");
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 512);
    });
    this.scene.background = this.sky; // start on the street
    this.scene.fog = new THREE.Fog(0x2a1626, 34, 80);

    this.scene.add(this.facade, this.lobbyBack);
    // Image-based lighting: soft studio reflections on every PBR surface.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // until the HDRIs arrive
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();
    loadEnv(this.renderer, "cinema_lobby").then((env) => { this.envs.lobby = env; this.applyEnv(); }).catch(() => {});
    this.buildLights();
    const before = new Set(this.scene.children);
    this.buildStreet(opts.films);
    for (const o of [...this.scene.children]) if (!before.has(o) && (o as THREE.Mesh).isMesh) this.exterior.add(o); // lights stay put (no shader recompiles)
    this.scene.add(this.exterior, this.hallBack);
    this.buildLobby(opts.films);
    this.buildCorridor(opts.films);
    this.buildHall();
    this.buildArcade();
    this.buildKaraoke();

    const me = new Character(opts.look);
    me.setTag(opts.name, "me");
    me.root.position.set(0, 0, 30);
    me.root.rotation.y = Math.PI;
    this.scene.add(me.root);
    this.player = { ch: me, path: [], speed: SPEED, player: true };

    for (let i = 0; i < 2; i++) this.spawnQueuer(i, true);
    this.spawnIdlers();
    this.buildGuides();

    this.camera.position.set(0, 7.5, 39);
    this.camera.layers.enable(LABEL_LAYER);
    this.camLook.set(0, 1.2, 28);
    if (this.high) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.95);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    addEventListener("resize", this.resize);
    this.renderer.domElement.addEventListener("pointerdown", this.onDown);
    this.renderer.domElement.addEventListener("pointerup", this.onUp);
    this.loop();
  }

  // ======================= public API (called by the HUD) =======================

  /** Performs world-side actions; returns the prompt id so the HUD can open dialogs. */
  interact(): PromptId | null {
    if (this.mode) { this.mode.action?.(); return null; }
    const spot = this.currentSpot();
    if (!spot) return null;
    this.lastRef = spot.ref ?? 0;
    if (spot.id === "queue") this.joinQueue();
    if (spot.id === "door") this.enterHall();
    if (spot.id === "seat") this.walkToSeat();
    if (spot.id === "exit") this.leaveHall();
    return spot.id;
  }

  leaveQueue() {
    const i = this.queue.indexOf(this.player);
    if (i < 0) return;
    this.queue.splice(i, 1);
    this.player.path = [new THREE.Vector3(-6, 0, 12.4)];
    this.atFrontNotified = false;
    this.emitQueue();
  }

  /** Called after paying at the counter. */
  finishPurchase(hall: HallSetup) {
    this.hasTicket = true;
    this.myRoom = hall.room;
    this.mySeat = hall.seat;
    this.leaveQueue();
    this.player.ch.holdItem(this.ticketItem(false));
    this.player.path = [new THREE.Vector3(-7, 0, 12.6)];
    this.setupHall(hall);
  }

  giveFood() { this.player.ch.holdPopcorn(true); }

  openGate() {
    this.gateOpen = true;
    this.gateBar.visible = false;
    for (const g of this.gateKit) g.setGreen(true);
    this.scanner?.flash();
    this.player.ch.holdItem(this.ticketItem(true)); // the stub is torn off at the gate
  }

  /** The paper ticket you carry after buying (torn = only the stub half is left). */
  private ticketItem(torn: boolean) {
    const tex = canvasTex(256, 128, (g) => {
      g.fillStyle = "#f4c9c4"; g.fillRect(0, 0, 256, 128);
      g.fillStyle = "#6e1f2a"; g.font = `800 26px ${FONT}`; g.fillText("RẠP ONLINE", 14, 36);
      g.font = `700 20px ${FONT}`; g.fillText(`PHÒNG ${this.myRoom} · GHẾ ${this.mySeat}`, 14, 70);
      g.fillStyle = "#2a2320"; for (let i = 0; i < 26; i++) g.fillRect(14 + i * 6, 88, i % 3 ? 2 : 4, 26);
      if (!torn) { g.setLineDash([6, 6]); g.strokeStyle = "#6e1f2a"; g.beginPath(); g.moveTo(196, 0); g.lineTo(196, 128); g.stroke(); }
    });
    if (torn) { tex.repeat.set(196 / 256, 1); }
    const w = torn ? 0.12 : 0.16;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.08), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    m.position.set(0, 0.02, 0.05);
    m.rotation.set(-0.4, 0, 0.2);
    return m;
  }

  /** Lights down + countdown leader; then the film (if any) plays on the screen. */
  startShow(video?: HTMLVideoElement | null, trailerKey?: string | null) {
    this.video = video ?? null;
    this.trailerKey = !video && trailerKey && /^[\w-]{6,20}$/.test(trailerKey) ? trailerKey : null;
    this.dim.target = 1;
    const tex = canvasTex(1024, 428, () => {});
    this.leader = { tex, g: (tex.image as HTMLCanvasElement).getContext("2d")!, start: this.timer.getElapsed() };
    this.screenMat.map = tex;
    this.screenMat.color.setHex(0xffffff);
    this.screenMat.needsUpdate = true;
  }

  // ======================= Game Zone / karaoke modes =======================

  /** Hand the camera (and input) to an attraction; the player stands at `stand` facing `face`. */
  private enterMode(m: Mode, stand?: THREE.Vector3, face?: THREE.Vector3) {
    this.exitMode();
    const p = this.player.ch.root.position;
    this.modeReturn = p.clone();
    this.mode = m;
    this.tapTarget = null;
    this.player.path = [];
    this.vel.set(0, 0);
    if (stand) p.set(stand.x, 0, stand.z);
    if (face) this.player.ch.root.rotation.y = Math.atan2(face.x - p.x, face.z - p.z);
    this.camera.layers.disable(LABEL_LAYER); // no floating name tags in close-ups or photos
    this.player.ch.root.visible = !m.hidePlayer;
  }
  exitMode(back = true) {
    if (!this.mode) return;
    for (const b of this.karaoke) if (Math.hypot(b.stand.x - this.player.ch.root.position.x, b.stand.z - this.player.ch.root.position.z) < 0.5) b.door.open(1.4); // walking out of a booth
    this.mode.exit?.();
    this.mode = null;
    this.activeClaw = null;
    this.camera.layers.enable(LABEL_LAYER);
    this.player.ch.root.visible = true;
    if (back && this.modeReturn) this.player.ch.root.position.copy(this.modeReturn);
    this.modeReturn = null;
  }
  get inMode() { return !!this.mode; }

  playClaw(i: number, onDone: (prize: string | null, note: string) => void) {
    const c = this.claws[i];
    if (!c || c.busy) return null;
    this.enterMode(c.start((prize, note) => { onDone(prize, note); }), c.front, c.group.position);
    this.activeClaw = c;
    return c;
  }
  playGacha(color: number, onDone: () => void) {
    this.enterMode(this.gacha.play(color, onDone), this.gacha.front, this.gacha.group.position);
  }
  enterBooth() {
    this.enterMode(this.booth.mode(), this.booth.stand, new THREE.Vector3(this.booth.group.position.x - 2, 0, this.booth.group.position.z));
  }
  enterKaraoke(i: number) {
    const b = this.karaoke[i];
    if (!b) return;
    b.door.open(1.2);
    setTimeout(() => this.enterMode(b.mode(), b.stand, new THREE.Vector3(b.group.position.x, 0, b.group.position.z)), this.reducedMotion ? 0 : 600);
  }
  karaokeLyrics(i: number, song: Song, line: number, index: number) { this.karaoke[i]?.lyrics(song, line, index); }
  /** Pose for photos / emotes. */
  pose(name: "cheer" | "wave" | "idle") { if (name === "cheer") this.player.ch.cheer(); else if (name === "wave") this.player.ch.wave(); }
  /** Grab the next rendered frame (the booth camera view) as a canvas. */
  capture(): Promise<HTMLCanvasElement> { return new Promise((res) => { this.captureCb = res; }); }
  drawQuiz(v: Parameters<QuizScreen["draw"]>[0]) { this.quiz.draw(v); }

  private buildArcade() {
    const A = ARCADE;
    const floorTex = canvasTex(512, 512, (g) => { // classic neon arcade carpet
      g.fillStyle = "#120a24"; g.fillRect(0, 0, 512, 512);
      const cols = ["#ff4fd8", "#4fd8ff", "#ffd23f", "#7dffa8"];
      let seed = 7;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = cols[i % 4]; g.lineWidth = 5; g.globalAlpha = 0.75;
        const x = r() * 512, y = r() * 512, s = 10 + r() * 18;
        g.beginPath();
        if (i % 3 === 0) { g.arc(x, y, s, 0, Math.PI * 2); }
        else if (i % 3 === 1) { g.moveTo(x, y); g.lineTo(x + s, y + s * 1.6); g.lineTo(x - s, y + s * 1.6); g.closePath(); }
        else { g.moveTo(x - s, y); for (let k = 0; k < 4; k++) g.quadraticCurveTo(x - s + k * s * 0.6 + s * 0.3, y + (k % 2 ? -s : s), x - s + (k + 1) * s * 0.6, y); }
        g.stroke();
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(5, 5);
    const floor = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
    this.buildWingShell(A, floor, std(0x231436, { roughness: 0.9 }));

    [0xff4fa3, 0x3fc1ff, 0xffb02e].forEach((col, i) => {
      const c = new ClawMachine(-26.4 + i * 1.8, A.z0 + 0.9, col);
      this.scene.add(c.group);
      this.claws.push(c);
      this.box(c.group.position.x - 0.62, c.group.position.x + 0.62, c.group.position.z - 0.62, c.group.position.z + 0.62);
      this.spots.push({ id: "claw", ref: i, pos: c.front, r: 1.3, label: () => (this.mode ? null : "Chơi gắp gấu · 1 xu") });
    });
    this.gacha = new GachaMachine(-20.4, A.z0 + 0.7);
    this.scene.add(this.gacha.group);
    this.box(-20.8, -20.0, A.z0, A.z0 + 1.05);
    this.spots.push({ id: "gacha", pos: this.gacha.front, r: 1.3, label: () => (this.mode ? null : "Quay gacha · 2 xu") });

    this.booth = new PhotoBooth(-26.6, 15.2);
    this.scene.add(this.booth.group);
    this.box(-27.75, -25.45, 14.05, 14.2);
    this.box(-27.75, -25.45, 16.2, 16.35);
    this.box(-27.75, -27.5, 14.05, 16.35);
    this.spots.push({ id: "booth", pos: this.booth.front, r: 1.1, label: () => (this.mode ? null : "Chụp photo 4 kiểu") });

    this.quiz = new QuizScreen(A.x0 + 0.17, 9.6, Math.PI / 2);
    this.scene.add(this.quiz.group);
    this.spots.push({ id: "quiz", pos: new THREE.Vector3(A.x0 + 2.6, 0, 9.6), r: 2.2, label: () => (this.mode ? null : "Chơi đố vui") });
    // prize counter + two upright cabinets against the lobby wall
    const shelf = prizeShelf([0x8a5a3c, 0xf29bb6, 0xf3efe6, 0xe9b949, 0x8fd6c0]);
    shelf.position.set(-16.6, 0, A.z0 + 0.45); this.scene.add(shelf);
    this.box(-17.8, -15.4, A.z0, A.z0 + 0.8);
    [["STAR RACER", 0x2f7de1, 7.4], ["ZOMBIE RUN", 0x3ccf7a, 8.4]].forEach(([title, col, z]) => {
      const cab = arcadeCabinet(col as number, title as string);
      cab.group.position.set(A.x1 - 0.55, 0, z as number); cab.group.rotation.y = -Math.PI / 2; this.scene.add(cab.group);
      this.ticker.push((_dt, t) => cab.update(t));
      this.box(A.x1 - 0.95, A.x1, (z as number) - 0.4, (z as number) + 0.4);
    });
    // bean bags in front of the quiz screen
    for (const [x, z, c] of [[-25.6, 8.2, 0xff4fd8], [-25.4, 11, 0x4fd8ff]] as [number, number, number][]) {
      const bag = this.mesh(new THREE.SphereGeometry(0.42, 18, 12), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.8, sheen: 0.6 }), x, 0.28, z);
      bag.scale.y = 0.62;
      this.box(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
    }
  }

  private buildKaraoke() {
    const K = KARAOKE;
    const floor = std(0x16101f, { roughness: 0.3, metalness: 0.3 });
    this.buildWingShell(K, floor, std(0x1d1630, { roughness: 0.9 }));
    const accents = [0x4fd8ff, 0xff4fd8, 0xffd23f];
    [16.4, 21, 25.6].forEach((cx, i) => {
      const b = new KaraokeBooth(i + 1, cx, K.z0 + 0.15, 4.2, 4.0, accents[i]);
      this.scene.add(b.group);
      this.karaoke.push(b);
      this.autoDoors.push({ door: b.door, at: b.door.group.getWorldPosition(new THREE.Vector3()), r: 1.8 });
      this.box(cx - 2.15, cx + 2.15, K.z0, K.z0 + 4.25);
      this.spots.push({ id: "karaoke", ref: i, pos: b.doorSpot, r: 1.1, label: () => (this.mode ? null : `Vào phòng hát ${i + 1} · 1 xu`) });
    });
    this.neonSign("COIN KARAOKE", K.x1 - 0.17, 3.4, 13, -Math.PI / 2, "#4fd8ff", 4.4);
    for (const x of [18.5, 23.5]) { const tb = loungeTable(); tb.position.set(x, 0, 14.1); this.scene.add(tb); this.box(x - 0.45, x + 0.45, 13.65, 14.55); }
    // LED ceiling strips + a warm floor wash so the lounge isn't a dark box
    const led = new THREE.MeshBasicMaterial({ color: 0xb388ff, toneMapped: false });
    for (const z of [9.4, 12, 16.6]) this.mesh(new THREE.BoxGeometry(13, 0.05, 0.08), led, 21, WING_H - 0.05, z);
    const wash = this.mesh(new THREE.CircleGeometry(4.5, 40), new THREE.MeshBasicMaterial({ color: 0x6b2bd9, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false }), 21, 0.02, 13.5);
    wash.rotation.x = -Math.PI / 2;
    // lounge sofas
    const sofa = new THREE.MeshPhysicalMaterial({ color: 0x3b2a6b, roughness: 0.75, sheen: 0.5 });
    for (const x of [18.5, 23.5]) {
      this.mesh(new THREE.BoxGeometry(2.6, 0.42, 0.85), sofa, x, 0.21, 15.4);
      this.mesh(new THREE.BoxGeometry(2.6, 0.55, 0.2), sofa, x, 0.6, 15.85);
      this.box(x - 1.3, x + 1.3, 14.95, 16);
    }
  }

  // ======================= multiplayer =======================

  /** My public state for the relay. */
  snapshot(): RtState {
    const p = this.player.ch.root.position;
    const s: RtState = { x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +this.player.ch.root.rotation.y.toFixed(2), zone: this.zone, moving: this.vel.lengthSq() > 0.05 || this.player.path.length > 0 };
    if (this.myShow) s.show = this.myShow;
    if (this.seated && this.myShow) s.seat = this.mySeat;
    if (this.player.ch.hasPopcorn) s.pop = true;
    if (this.myEmote) { s.em = this.myEmote.em; s.en = this.myEmote.en; }
    return s;
  }

  /** Play an emote locally; it reaches other players through the next state update. */
  emote(em: RtEmote) {
    this.player.ch.emote(em);
    this.myEmote = { em, en: (this.myEmote?.en ?? 0) + 1 };
  }

  upsertPeer(peer: RtPeer) {
    if (this.peers.has(peer.id)) return this.peerState(peer.id, peer.s);
    const ch = new Character({ hero: heroOrFallback(peer.hero) });
    ch.setTag(peer.name, "peer");
    ch.root.position.set(peer.s.x, 0, peer.s.z);
    this.scene.add(ch.root);
    this.peers.set(peer.id, { ch, s: peer.s, name: peer.name, target: new THREE.Vector3(peer.s.x, 0, peer.s.z) });
    this.peerState(peer.id, peer.s);
  }

  peerState(id: string, s: RtState) {
    const p = this.peers.get(id);
    if (!p) return;
    p.s = s;
    p.target.set(s.x, 0, s.z);
    p.ch.holdPopcorn(!!s.pop);
    if (s.em && s.en !== undefined && s.en !== p.en) { if (p.en !== undefined) p.ch.emote(s.em); p.en = s.en; } // skip replay on first sight
    const sameShow = !!s.show && s.show === this.myShow;
    const wantSeat = s.seat && sameShow ? s.seat : undefined;
    if (wantSeat !== p.seat) {
      const freed = p.seat ? this.crowdBySeat.get(p.seat) : undefined;
      if (freed) freed.root.visible = true;
      if (p.ch.seated) { // stand up: a fresh character is simpler than reversing the sit pose
        const hero = p.ch.hero;
        p.ch.dispose();
        p.ch = new Character({ hero });
        p.ch.setTag(p.name, "peer");
        p.ch.root.position.set(s.x, 0, s.z);
        this.scene.add(p.ch.root);
      }
      if (wantSeat) {
        const c = this.crowdBySeat.get(wantSeat);
        if (c) c.root.visible = false; // the real person takes the filler's place
        const sp = seatWorld(wantSeat);
        p.ch.sitAt(new THREE.Vector3(sp.x, sp.y + 0.5, sp.z + 0.05), true);
      }
      p.seat = wantSeat;
    }
  }

  removePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.seat) { const c = this.crowdBySeat.get(p.seat); if (c) c.root.visible = true; }
    p.ch.dispose();
    this.peers.delete(id);
  }

  /** Show a chat line as a speech bubble over whoever said it (me if id is null). */
  say(id: string | null, text: string) {
    const ch = id === null ? this.player.ch : this.peers.get(id)?.ch;
    ch?.say(text);
  }

  private updatePeers(dt: number) {
    for (const p of this.peers.values()) {
      const s = p.s;
      // hall: only people at my screening; elsewhere: everyone
      const visible = s.zone !== "hall" || (!!s.show && s.show === this.myShow);
      p.ch.root.visible = visible;
      if (!visible) continue;
      if (p.ch.seated) { p.ch.animate(dt, 0); continue; }
      const pos = p.ch.root.position;
      const dx = p.target.x - pos.x, dz = p.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 6) pos.set(p.target.x, pos.y, p.target.z); // teleport (zone change)
      else { const k = 1 - Math.exp(-dt * 10); pos.x += dx * k; pos.z += dz * k; }
      let ry = s.ry - p.ch.root.rotation.y;
      ry = Math.atan2(Math.sin(ry), Math.cos(ry));
      p.ch.root.rotation.y += ry * Math.min(1, dt * 10);
      pos.y += (this.heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 12);
      p.ch.setTagScale(s.zone === "hall" ? 0.75 : 1);
      p.ch.animate(dt, s.moving && d > 0.03 ? SPEED : 0);
    }
  }

  /** Dev/demo only: scripted walk through waypoints (ignores walls). */
  debugWalk(points: [number, number][]): Promise<void> {
    return new Promise((done) => {
      this.tapTarget = null;
      this.player.path = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
      this.player.onArrive = () => done();
    });
  }

  /** World z of a seat (for scripted walks). */
  seatZ(seat: string): number { return seatWorld(seat).z; }

  dispose() {
    this.disposed = true;
    this.video?.pause();
    this.css?.domElement.remove();
    cancelAnimationFrame(this.frame);
    removeEventListener("resize", this.resize);
    this.input.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ======================= queue =======================

  private spawnQueuer(i: number, instant = false) {
    const ch = new Character(lookFromSeed(i * 17 + Math.floor(Math.random() * 1000)));
    const a: Agent = { ch, path: [], speed: 1.6 + Math.random() * 0.4 };
    if (instant) ch.root.position.copy(QUEUE_SLOTS[this.queue.length]);
    else {
      ch.root.position.set(-1 + Math.random() * 2, 0, 31);
      a.path = [new THREE.Vector3(0, 0, 19), new THREE.Vector3(-2.5, 0, 14)];
      a.entering = true;
      a.onArrive = () => { a.entering = false; };
    }
    ch.root.rotation.y = -Math.PI / 2;
    this.scene.add(ch.root);
    this.npcs.push(a);
    this.queue.push(a);
  }

  private joinQueue() {
    if (this.queue.includes(this.player) || this.hasTicket) return;
    this.tapTarget = null;
    this.queue.push(this.player);
    this.player.path = [];
    this.emitQueue();
  }

  private updateQueue(dt: number) {
    this.queue.forEach((a, i) => {
      if (a.entering) return;
      const slot = QUEUE_SLOTS[Math.min(i, QUEUE_SLOTS.length - 1)];
      const goal = a.path[a.path.length - 1];
      if (a.ch.root.position.distanceTo(slot) > 0.02 && (!goal || goal.distanceTo(slot) > 0.01)) a.path = [slot.clone()];
    });
    const front = this.queue[0];
    if (!front) return;
    const atSlot = front.ch.root.position.distanceTo(QUEUE_SLOTS[0]) < 0.08;
    if (front.player) {
      if (atSlot && !this.atFrontNotified) {
        this.atFrontNotified = true;
        this.player.ch.root.rotation.y = -Math.PI / 2;
        this.emitQueue();
      }
      return;
    }
    if (!atSlot) return;
    front.ch.face(-1, 0);
    front.serveT = (front.serveT ?? 0) + dt;
    if (front.serveT > SERVICE_SECONDS) {
      this.queue.shift();
      this.queueNo?.set(++this.served);
      front.leaving = true;
      front.path = [new THREE.Vector3(-5, 0, 12.5), new THREE.Vector3(6, 0, 7), new THREE.Vector3(10.7, 0, 4.6), new THREE.Vector3(10.7, 0, 1), new THREE.Vector3(10, 0, -3)];
      front.onArrive = () => { this.scene.remove(front.ch.root); this.npcs.splice(this.npcs.indexOf(front), 1); };
      this.emitQueue();
    }
  }

  private emitQueue() {
    const i = this.queue.indexOf(this.player);
    const info: QueueInfo = { inQueue: i >= 0, ahead: Math.max(0, i), atFront: i === 0 && this.atFrontNotified };
    const key = JSON.stringify(info);
    if (key !== this.lastQueue) { this.lastQueue = key; this.events.queue(info); }
  }

  // ======================= hall =======================

  private setupHall(h: HallSetup) {
    this.hallPeople.clear();
    this.seatedCrowd = [];
    this.crowdBySeat.clear();
    this.myShow = h.show;
    this.hallSignMat.map = signTex(`PHÒNG ${h.room}`, 512, 128, "#2A2320", "#F2C14E", 72);
    this.hallSignMat.needsUpdate = true;
    const taken = new Set([...h.occupants.map((o) => o.seat), ...h.filler]);
    const color = new THREE.Color();
    this.seatIds.forEach((id, i) => {
      color.setHex(id === h.seat ? 0xf2c14e : taken.has(id) ? 0x8a2a32 : 0xb8323c);
      this.seatMesh.setColorAt(i, color);
    });
    this.seatMesh.instanceColor!.needsUpdate = true;
    const seatPerson = (seat: string, look: Look, tag?: { text: string; friend: boolean }) => {
      const c = new Character(look);
      if (tag) { c.setTag(tag.text, tag.friend ? "friend" : "staff"); c.setTagScale(0.7); }
      const p = seatWorld(seat);
      this.crowdBySeat.set(seat, c);
      this.hallPeople.add(c.root);
      c.sitAt(new THREE.Vector3(p.x, p.y + 0.5, p.z + 0.05), false);
      this.seatedCrowd.push(c);
    };
    h.occupants.forEach((o, i) => seatPerson(o.seat, lookFromSeed(i * 31 + 5), { text: o.name, friend: o.friend }));
    h.filler.forEach((s, i) => seatPerson(s, lookFromSeed(i * 13 + 101)));
    const p = seatWorld(h.seat);
    this.seatMarker.position.set(p.x, p.y + 1.6, p.z);
    this.seatMarker.visible = true;
  }

  private enterHall() {
    if (!this.gateOpen) return;
    const door = this.roomDoors[this.myRoom - 1];
    door?.open(2.2);
    const wait = this.reducedMotion ? 0 : 650; // let the doors swing open before the cut
    setTimeout(() => this.events.fade(true), wait);
    setTimeout(() => {
      this.hallExit.open(1.4); // the doors you came through, seen from inside
      door?.close();
      this.player.path = [];
      this.tapTarget = null;
      this.player.ch.root.position.set(0, this.heightAt(0, H + BACK_WALL - 1.6), H + BACK_WALL - 1.6);
      this.player.ch.root.rotation.y = Math.PI;
      this.snapCamera();
      this.setZone("hall");
      this.events.fade(false);
    }, wait + (this.reducedMotion ? 0 : 450));
  }

  /** Get up from the seat into the aisle; the film stops and the house lights come back up. */
  /** "Exit" from the hall (Esc / mobile button): stand up if seated, otherwise walk out the back door. */
  exitHall() {
    if (this.zone !== "hall") return false;
    if (this.seated) this.standUp();
    else this.leaveHall();
    return true;
  }

  standUp() {
    if (!this.seated) return;
    const p = seatWorld(this.mySeat);
    this.seated = false;
    this.stopShow();
    const c = this.player.ch;
    c.root.visible = true;
    c.standUp(new THREE.Vector3(0, p.y, p.z - 0.1));
    c.root.position.x = p.x < 0 ? -0.35 : 0.35; // step out into the centre aisle
    c.root.rotation.y = 0; // facing the exit
    this.hallPeople.children.forEach((o) => o.children.forEach((k) => { if (k instanceof THREE.Sprite) k.visible = true; }));
    this.seatMarker.visible = true;
    this.snapCamera();
    this.events.stood();
  }

  /** Through the hall's back door, back to the corridor outside your room. */
  private leaveHall() {
    this.hallExit.open(2.2);
    const wait = this.reducedMotion ? 0 : 650;
    setTimeout(() => this.events.fade(true), wait);
    setTimeout(() => {
      this.hallExit.close();
      this.roomDoors[Math.max(0, this.myRoom - 1)]?.open(1.4);
      this.player.path = [];
      this.tapTarget = null;
      const doorX = [7.4, 10, 12.6][Math.max(0, this.myRoom - 1)] ?? 10;
      this.player.ch.root.position.set(doorX, 0, -2.4);
      this.player.ch.root.rotation.y = 0;
      this.setZone("corridor");
      this.snapCamera();
      this.events.fade(false);
    }, wait + (this.reducedMotion ? 0 : 450));
  }

  private stopShow() {
    this.dim.target = 0;
    this.leader = null;
    this.video?.pause();
    this.trailerKey = null;
    if (this.trailerObj) { this.scene.remove(this.trailerObj); this.trailerObj = null; }
    this.css?.domElement.remove();
    this.css = null;
    this.screenMat.map = null;
    this.screenMat.color.setHex(0xd9cfc8);
    this.screenMat.needsUpdate = true;
    this.screenMesh.scale.set(1, 1, 1);
  }

  private walkToSeat() {
    const p = seatWorld(this.mySeat);
    const walkZ = p.z - 0.55;
    this.tapTarget = null;
    this.player.path = [new THREE.Vector3(0, 0, walkZ), new THREE.Vector3(p.x, 0, walkZ), new THREE.Vector3(p.x, 0, p.z)];
    this.player.onArrive = () => {
      const c = this.player.ch;
      c.sitAt(new THREE.Vector3(p.x, p.y + 0.5, p.z + 0.05), true);
      c.root.visible = false; // first-person once seated
      this.hallPeople.children.forEach((o) => o.children.forEach((k) => { if (k instanceof THREE.Sprite) k.visible = false; }));
      this.seatMarker.visible = false;
      this.seated = true;
      this.events.seated();
    };
  }

  // ======================= building =======================

  private light<T extends THREE.Light>(l: T): T {
    this.lights.push({ l, base: l.intensity });
    this.scene.add(l);
    return l;
  }

  private box(x0: number, x1: number, z0: number, z1: number, on?: () => boolean) { this.boxes.push({ x0, x1, z0, z1, on }); }

  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = this.scene) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    parent.add(o);
    return o;
  }

  private floor(w: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, y, z);
    this.scene.add(f);
    this.floors.push(f);
    return f;
  }

  private buildLights() {
    this.light(new THREE.HemisphereLight(0xffe6c8, 0x2a1418, 0.85));
    const sun = this.light(new THREE.DirectionalLight(0xffd7b0, 0.8));
    sun.position.set(-10, 20, 30);
    for (const [x, z] of [[-8, 10], [0, 8], [8, 10], [0, 14]]) {
      const p = this.light(new THREE.PointLight(0xffd59a, 11, 14, 1.5));
      p.position.set(x, 4.6, z);
    }
    const corr = this.light(new THREE.PointLight(0xffc98a, 10, 10, 1.6));
    corr.position.set(10, 3.5, -1);
    const hallL = this.light(new THREE.PointLight(0xffc98a, 46, 26, 1.4));
    hallL.position.set(0, 7.5, H - 2);
    for (const x of [-HALL_W + 0.8, HALL_W - 0.8]) for (const z of [-9, -1, 6]) {
      const s = this.light(new THREE.PointLight(0xffb070, 6, 7, 1.8));
      s.position.set(x, 2.8, H + z);
    }
    // wings
    for (const [x, z, c] of [[-21, 9, 0xff7ad9], [-21, 15, 0xffd0a0], [21, 9, 0x7ad8ff], [21, 15, 0xffd0a0]] as [number, number, number][]) {
      const l = this.light(new THREE.PointLight(c, 12, 14, 1.5));
      l.position.set(x, 4.8, z);
    }
  }

  private buildStreet(films: FilmBoardRow[]) {
    this.floor(80, 22, std(COL.asphalt), 0, 0, 35);
    this.floor(80, 6, std(COL.sidewalk), 0, 0.01, 21);
    for (let x = -6; x <= 6; x += 1.5) this.mesh(new THREE.BoxGeometry(0.8, 0.01, 4), std(0xe8e4dc), x, 0.02, 31);
    this.box(-40, 40, 39, 41);
    this.box(-31, -29, 0, 40);
    this.box(29, 31, 0, 40);

    // Facade with entrance (x -2.2..2.2).
    const fac = std(COL.facade, { roughness: 0.7 });
    this.mesh(new THREE.BoxGeometry(26, 9, 0.4), fac, -15.2, 4.5, 18, 0, this.facade);
    this.mesh(new THREE.BoxGeometry(26, 9, 0.4), fac, 15.2, 4.5, 18, 0, this.facade);
    this.mesh(new THREE.BoxGeometry(4.4, 5.6, 0.4), fac, 0, 6.2, 18, 0, this.facade);
    this.box(-28.4, -2.2, 17.8, 18.2);
    this.box(2.2, 28.4, 17.8, 18.2);
    this.mesh(new THREE.BoxGeometry(58, 0.4, 3), std(0x1d0d10), 0, 9.2, 19, 0, this.facade);
    // Automatic sliding glass doors at the entrance.
    const entrance = slidingDoors(4.2, 3.3);
    entrance.group.position.set(0, 0, 18);
    this.facade.add(entrance.group);
    this.autoDoors.push({ door: entrance, at: new THREE.Vector3(0, 0, 18), r: 3.4 });
    // Shop-front glass + neon for the two wings.
    const glassFront = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.05, metalness: 0.6, envMapIntensity: 1.4 });
    for (const x of [-21, 21]) this.mesh(new THREE.BoxGeometry(11, 3.2, 0.05), glassFront, x, 2.0, 18.23, 0, this.facade);
    this.neonSign("GAME ZONE", -21, 5.0, 18.26, 0, "#ff4fd8", 6.4, this.facade);
    this.neonSign("KARAOKE", 21, 5.0, 18.26, 0, "#4fd8ff", 6.4, this.facade);

    // Marquee with chasing bulbs.
    this.mesh(new THREE.PlaneGeometry(7, 1.5), flat(signTex("RẠP ONLINE", 1400, 300, "#2A2320", "#F2C14E", 210)), 0, 5.2, 18.25, 0, this.facade);
    const neon = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3a2a, emissiveIntensity: 3 });
    for (const [w, h, x, y] of [[7.6, 0.07, 0, 6.0], [7.6, 0.07, 0, 4.4], [0.07, 1.6, -3.8, 5.2], [0.07, 1.6, 3.8, 5.2]]) {
      this.mesh(new THREE.BoxGeometry(w, h, 0.05), neon, x, y, 18.3, 0, this.facade);
    }
    const bulbGeo = new THREE.SphereGeometry(0.07, 10, 8);
    for (let i = 0; i < 40; i++) {
      const top = i < 20;
      const t = (i % 20) / 19;
      const b = this.mesh(bulbGeo, std(COL.bulb, { emissive: COL.bulb, emissiveIntensity: 1 }), -3.6 + t * 7.2, top ? 6.2 : 4.2, 18.3, 0, this.facade);
      this.bulbs.push(b);
    }
    // Poster light boxes on the facade.
    films.slice(0, 4).forEach((f, i) => {
      const x = [-11, -6.5, 6.5, 11][i];
      this.mesh(new THREE.PlaneGeometry(2.2, 3.2), flat(this.posterTex(f.title, `PHÒNG ${f.room}`)), x, 3.2, 18.22, 0, this.facade);
    });
    // Street lamps + trees.
    for (const x of [-14, 14]) {
      this.mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.6, 8), std(0x222222), x, 2.3, 23);
      this.mesh(new THREE.SphereGeometry(0.3, 12, 8), std(0xfff1c8, { emissive: 0xffd88a, emissiveIntensity: 1.5 }), x, 4.7, 23);
      const l = this.light(new THREE.PointLight(0xffd88a, 8, 10, 1.6));
      l.position.set(x, 4.4, 23);
    }
    for (const x of [-22, -9, 9, 22]) {
      this.mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 8), std(0x4a3020), x, 0.8, 22.5);
      this.mesh(new THREE.SphereGeometry(1.1, 12, 10), std(0x2f5a32), x, 2.4, 22.5);
      this.box(x - 0.3, x + 0.3, 22.2, 22.8);
    }
  }

  /** Real poster (TMDB / Commons, CORS-enabled) with the typographic poster until it loads. */
  private realPoster(f: FilmBoardRow): THREE.Texture {
    const fallback = this.posterTex(f.title, `PHÒNG ${f.room}`);
    if (!f.poster) return fallback;
    const holder = new THREE.Texture<TexImageSource>(fallback.image as HTMLCanvasElement);
    holder.colorSpace = THREE.SRGBColorSpace;
    holder.anisotropy = 4;
    holder.needsUpdate = true;
    this.posterLoader.load(f.poster, (t) => { holder.image = t.image; holder.needsUpdate = true; }, undefined, () => {});
    return holder;
  }

  private posterTex(title: string, sub: string) {
    return canvasTex(440, 640, (g) => {
      g.fillStyle = "#6E1F2A";
      g.fillRect(0, 0, 440, 640);
      g.strokeStyle = "#F2C14E";
      g.lineWidth = 10;
      g.strokeRect(14, 14, 412, 612);
      g.fillStyle = "#F6E9E4";
      g.font = `800 52px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const words = title.split(" ");
      const lines: string[] = [];
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (g.measureText(test).width > 360 && line) { lines.push(line); line = w; } else line = test;
      }
      lines.push(line);
      lines.forEach((l, i) => g.fillText(l, 220, 280 + (i - (lines.length - 1) / 2) * 62));
      g.fillStyle = "#F2C14E";
      g.font = `800 34px ${FONT}`;
      g.fillText(sub, 220, 560);
    });
  }

  /** Cut-away wall: wood wainscot, cream plaster, brass cap. 3.4 m tall so the camera sees over it. */
  private wall(x: number, z: number, w: number, d: number, parent: THREE.Object3D = this.scene, upper: THREE.Material = this.mats().plaster, top = LOBBY_H) {
    const m = this.mats();
    const len = Math.max(w, d);
    const oak = pbr("oak_veneer_01", { repeat: [len / 2, 0.55], tint: 0xb07a52, lite: this.lite });
    this.mesh(new THREE.BoxGeometry(w, 1.1, d), oak, x, 0.55, z, 0, parent);
    this.mesh(new THREE.BoxGeometry(w, 2.3, d), upper, x, 2.25, z, 0, parent);
    this.mesh(new THREE.BoxGeometry(w + 0.04, 0.1, d + 0.08), m.brass, x, 3.45, z, 0, parent);
    this.mesh(new THREE.BoxGeometry(w + 0.03, 0.05, d + 0.05), m.brass, x, 1.12, z, 0, parent);
    if (top > 3.5) { // upholstered upper wall closes the room in
      const fabric = pbr("fabric_pattern_07", { repeat: [len / 1.5, (top - 3.5) / 1.5], tint: 0x5a2430, lite: this.lite });
      this.mesh(new THREE.BoxGeometry(w, top - 3.5, d), fabric, x, 3.5 + (top - 3.5) / 2, z, 0, parent);
    }
  }

  /** Lintel over an opening (doorway into a wing / the gate), from `y0` up to the ceiling. */
  private lintel(x: number, z: number, w: number, d: number, y0: number, top = LOBBY_H, parent: THREE.Object3D = this.scene) {
    const m = this.mats();
    this.mesh(new THREE.BoxGeometry(w, top - y0, d), m.plaster, x, y0 + (top - y0) / 2, z, 0, parent);
    this.mesh(new THREE.BoxGeometry(w + 0.04, 0.12, d + 0.08), m.brass, x, y0 + 0.06, z, 0, parent);
  }

  private _mats: Record<string, THREE.MeshStandardMaterial> | null = null;
  /** Shared materials (built once; PBR maps skipped on phones). */
  private mats() {
    if (this._mats) return this._mats;
    const lite = this.lite;
    this._mats = {
      plaster: std(0xd9c6a8, { roughness: 0.9 }),
      brass: std(0xc9a14a, { metalness: 0.9, roughness: 0.28 }),
      oak: pbr("oak_veneer_01", { repeat: [2, 1], tint: 0xb07a52, lite }),
      marbleTop: pbr("marble_01", { repeat: [1, 1], tint: 0xf3ece2, lite }),
      velvet: pbr("velour_velvet", { repeat: [4, 2], tint: 0x9c1f2c, lite }),
      leather: pbr("leather_red_02", { repeat: [1, 1], tint: 0xb8323c, lite }),
      carpet: pbr("quatrefoil_jacquard_fabric", { repeat: [8, 10], tint: 0x6a1d28, lite, roughness: 1 }),
      acoustic: pbr("fabric_pattern_07", { repeat: [2, 3], tint: 0x3a2228, lite }),
      dark: std(0x161012, { roughness: 0.6 }),
      blackGloss: std(0x0d0b0c, { roughness: 0.25, metalness: 0.2 }),
    };
    return this._mats;
  }

  private hangingSign(text: string, x: number, y: number, z: number, ry: number, bg: string, fg: string, w = 3) {
    this.mesh(new THREE.BoxGeometry(w + 0.16, 0.86, 0.08), std(0x2a2320, { roughness: 0.5 }), x, y, z, ry);
    const face = this.mesh(new THREE.PlaneGeometry(w, 0.7), flat(signTex(text, 900, 210, bg, fg, 120)), x, y, z, ry);
    face.translateZ(0.045);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) {
      const cord = this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.4, 4), std(0x222222), x, y + 1.6, z, ry);
      cord.translateX(dx);
    }
  }

  /** Glowing neon text on a dark backer (bloom picks it up on desktop). */
  private neonSign(text: string, x: number, y: number, z: number, ry: number, color: string, w: number, parent: THREE.Object3D = this.scene) {
    const h = w * 0.24;
    const t = canvasTex(1024, 246, (g) => {
      g.fillStyle = "#08060a";
      g.fillRect(0, 0, 1024, 246);
      g.font = `800 150px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = color;
      g.shadowBlur = 38;
      g.fillStyle = color;
      g.fillText(text, 512, 132);
      g.shadowBlur = 0;
      g.fillStyle = "#fff";
      g.globalAlpha = 0.85;
      g.fillText(text, 512, 132);
    });
    const m = this.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), x, y, z, ry, parent);
    return m;
  }

  private buildLobby(films: FilmBoardRow[]) {
    const M = this.mats();
    // Polished marble (real PBR set) with an HDRI from an actual cinema lobby reflecting in it.
    const marble = pbr("marble_01", { repeat: [7, 4], tint: 0xf1e7da, envMapIntensity: 1.1, lite: this.lite });
    this.floor(28, 16, marble, 0, 0.01, 10);
    const carpet = pbr("quatrefoil_jacquard_fabric", { repeat: [1.4, 6.7], tint: 0x8e1f2c, lite: this.lite, roughness: 1 });
    const c1 = this.mesh(new THREE.PlaneGeometry(2.8, 13.4), carpet, 0, 0.014, 11.3);
    c1.rotation.x = -Math.PI / 2;
    const carpet2 = pbr("quatrefoil_jacquard_fabric", { repeat: [5.7, 1.2], tint: 0x8e1f2c, lite: this.lite, roughness: 1 });
    const c2 = this.mesh(new THREE.PlaneGeometry(11.4, 2.4), carpet2, 5.4, 0.014, 4.9);
    c2.rotation.x = -Math.PI / 2;
    for (const x of [-1.45, 1.45]) { const t = this.mesh(new THREE.PlaneGeometry(0.06, 13.4), M.brass, x, 0.016, 11.3); t.rotation.x = -Math.PI / 2; }

    // Walls: oak wainscot + plaster, with arched openings into the wings (z 14.4..17.6).
    this.wall(-14, 8.2, 0.3, 12.4);
    this.wall(14, 8.4, 0.3, 12.8);
    this.wall(-14, 17.8, 0.3, 0.4);
    this.wall(14, 17.8, 0.3, 0.4);
    this.lintel(-14, 16, 0.3, 3.2, 3.3);
    this.lintel(14, 16.2, 0.3, 2.8, 3.3);
    this.lintel(10.75, 2, 2.5, 0.3, 3.0, LOBBY_H, this.lobbyBack);
    // closed ceiling with recessed downlights and a warm cove around the edge
    const ceil = this.mesh(new THREE.PlaneGeometry(28, 16), std(0x1a0f12, { roughness: 0.9 }), 0, LOBBY_H, 10);
    ceil.rotation.x = Math.PI / 2;
    const cove = new THREE.MeshBasicMaterial({ color: 0xffc98a, toneMapped: false });
    for (const [w, d, x, z] of [[27.4, 0.08, 0, 2.35], [27.4, 0.08, 0, 17.65], [0.08, 15.3, -13.65, 10], [0.08, 15.3, 13.65, 10]]) this.mesh(new THREE.BoxGeometry(w, 0.06, d), cove, x, LOBBY_H - 0.25, z);
    this.box(-14.2, -13.8, 2, 14.4);
    this.box(13.8, 14.2, 2, 14.8);
    this.wall(-2.25, 2, 23.5, 0.3, this.lobbyBack);
    this.wall(13, 2, 2, 0.3, this.lobbyBack);
    this.box(-14, 9.5, 1.8, 2.2);
    this.box(12, 14, 1.8, 2.2);
    this.neonSign("GAME ZONE ›", -13.8, 3.9, 16, Math.PI / 2, "#ff4fd8", 3);
    this.neonSign("‹ KARAOKE", 13.8, 3.9, 16.2, -Math.PI / 2, "#4fd8ff", 3);

    // Recessed downlights in the closed ceiling.
    const disc = new THREE.CircleGeometry(0.22, 20);
    const discMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffe2b0, emissiveIntensity: 1.6 });
    for (let x = -12; x <= 12; x += 4) for (const z of [4.5, 9, 13.5]) { const d = this.mesh(disc, discMat, x, LOBBY_H - 0.02, z); d.rotation.x = Math.PI / 2; }

    // Film posters in lit frames.
    films.slice(0, 2).forEach((f, i) => {
      const left = i === 0;
      const x = left ? -13.8 : 13.8, z = left ? 4.2 : 6.2;
      this.mesh(new THREE.BoxGeometry(0.1, 2.4, 1.7), M.brass, x, 2.0, z);
      this.mesh(new THREE.PlaneGeometry(1.5, 2.2), flat(this.realPoster(f)), x + (left ? 0.06 : -0.06), 2.0, z, left ? Math.PI / 2 : -Math.PI / 2);
    });

    // Film standees by the entrance (first three films: Vietnamese releases first).
    films.slice(0, 3).forEach((f, i) => {
      const st = standee(this.realPoster(f), f.title);
      st.position.set(4.6 + i * 1.9, 0, 15.0);
      st.rotation.y = -0.15;
      this.scene.add(st);
      this.box(4.6 + i * 1.9 - 0.7, 4.6 + i * 1.9 + 0.7, 14.7, 15.4);
    });

    // LỊCH CHIẾU: free-standing LED board.
    this.boardMat = flat(this.boardTex(films));
    this.mesh(new THREE.BoxGeometry(8.4, 3.9, 0.16), M.blackGloss, -3, 3.5, 2.55);
    this.mesh(new THREE.PlaneGeometry(8, 3.5), this.boardMat, -3, 3.5, 2.64);
    for (const x of [-6.6, 0.6]) this.mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 10), M.brass, x, 0.8, 2.55);
    this.spots.push({ id: "board", pos: new THREE.Vector3(-3, 0, 4.6), r: 2.6, label: () => "Xem lịch chiếu" });

    // QUẦY VÉ: oak counter, marble top, glass screen, light box.
    this.mesh(new THREE.BoxGeometry(1.6, 1.1, 6.4), M.oak, -11.8, 0.55, 10);
    this.mesh(new THREE.BoxGeometry(1.8, 0.08, 6.6), M.marbleTop, -11.8, 1.14, 10);
    this.mesh(new THREE.BoxGeometry(0.2, 2.6, 6.4), M.velvet, -13.4, 2.4, 10);
    const glass = this.mesh(new THREE.BoxGeometry(0.05, 1.1, 6.2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1 }), -11.2, 1.75, 10);
    glass.renderOrder = 3;
    for (const z of [8.4, 11.6]) { // POS monitors face the cashier, printers face the customer
      const pos = posMonitor(); pos.position.set(-11.9, 1.18, z); pos.rotation.y = -Math.PI / 2; this.scene.add(pos);
      const pr = ticketPrinter(); pr.position.set(-11.35, 1.18, z + 0.55); pr.rotation.y = Math.PI / 2; this.scene.add(pr);
    }
    const prices = menuBoard("GIÁ VÉ HÔM NAY", [["Vé 2D", "0đ"], ["Vé 3D", "0đ"], ["Ghế đôi Sweetbox", "0đ"], ["Combo bắp + nước", "tặng"], ["Thành viên U22", "−100%"]], 2.6, 1.4);
    prices.position.set(-13.25, 2.75, 10); prices.rotation.y = Math.PI / 2; this.scene.add(prices);
    this.queueNo = queueDisplay();
    this.queueNo.group.position.set(-10.9, 3.9, 7.0); this.queueNo.group.rotation.y = Math.PI / 2 - 0.5; this.scene.add(this.queueNo.group);
    const decal = floorDecal("XẾP HÀNG TẠI ĐÂY", 2.2); decal.position.set(-2.4, 0.02, 11.4); this.scene.add(decal);
    this.hangingSign("QUẦY VÉ", -11.4, 3.0, 10, Math.PI / 2, "#F3E3A1", "#C8372D", 3);
    this.box(-12.6, -11.0, 6.8, 13.2);
    const cashier = new Character({ hero: "StaffTicket", staff: true });
    cashier.setTag("Bán vé", "staff");
    cashier.root.position.set(-12.9, STAFF_LIFT, 10);
    this.mesh(new THREE.BoxGeometry(1.0, STAFF_LIFT, 6.4), M.dark, -12.85, STAFF_LIFT / 2, 10); // raised floor behind the counter
    cashier.root.rotation.y = Math.PI / 2;
    this.scene.add(cashier.root);
    this.npcs.push({ ch: cashier, path: [], speed: 0, lift: STAFF_LIFT });
    this.staff.push({ ch: cashier, home: Math.PI / 2, waveCd: 0 });
    const post = new THREE.CylinderGeometry(0.05, 0.07, 1, 10);
    for (const z of [9.3, 10.7]) {
      for (let x = -10.6; x <= -3.4; x += 1.8) {
        this.mesh(post, M.brass, x, 0.5, z);
        this.mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 16), M.brass, x, 0.025, z);
      }
      const rope = this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 7.2, 8), M.velvet, -7, 0.9, z);
      rope.rotation.z = Math.PI / 2;
    }
    this.spots.push({ id: "queue", pos: new THREE.Vector3(-7.4, 0, 10), r: 5, label: () => (this.hasTicket || this.queue.includes(this.player) ? null : "Xếp hàng mua vé") });

    // BẮP NƯỚC: counter, popcorn machine with a warm glow, drinks fridge.
    this.mesh(new THREE.BoxGeometry(1.6, 1.1, 5.4), M.oak, 11.8, 0.55, 11.5);
    this.mesh(new THREE.BoxGeometry(1.8, 0.08, 5.6), M.marbleTop, 11.8, 1.14, 11.5);
    this.mesh(new THREE.BoxGeometry(0.2, 2.6, 5.4), std(COL.stamp), 13.4, 2.4, 11.5);
    this.hangingSign("BẮP NƯỚC", 11.4, 3.0, 11.5, -Math.PI / 2, "#C8372D", "#F6E9E4", 3);
    const pm = popcornMachine(); pm.group.position.set(12.0, 1.18, 13.2); pm.group.rotation.y = -Math.PI / 2; this.scene.add(pm.group);
    this.ticker.push((dt) => pm.update(dt));
    const soda = sodaFountain(); soda.position.set(12.15, 1.18, 10.2); soda.rotation.y = -Math.PI / 2; this.scene.add(soda);
    for (const [z, col] of [[9.15, 0xc8372d], [9.4, 0x2f7de1]] as [number, number][]) { const cs = cupStack(9, col); cs.position.set(11.35, 1.18, z); this.scene.add(cs); }
    for (const z of [11.2, 11.65, 12.1]) { const bk = popcornBucket(1); bk.position.set(11.3, 1.18, z); this.scene.add(bk); }
    const combos = menuBoard("BẮP NƯỚC", [["Bắp caramel + Coca", "tặng"], ["Bắp phô mai + Coca", "tặng"], ["Bắp ngọt + Coca", "tặng"], ["Combo đôi", "tặng"]], 2.4, 1.3, "#ffd27a");
    combos.position.set(13.25, 2.75, 11.5); combos.rotation.y = -Math.PI / 2; this.scene.add(combos);
    this.mesh(new THREE.BoxGeometry(0.7, 1.9, 1.0), new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0x9fd8ff, emissiveIntensity: 0.35, roughness: 0.1 }), 13.2, 0.95, 9.4);
    this.box(11.0, 12.6, 8.8, 14.2);
    const staff = new Character({ hero: "StaffSnack", staff: true });
    staff.setTag("Bắp nước", "staff");
    staff.root.position.set(12.9, STAFF_LIFT, 11.5);
    this.mesh(new THREE.BoxGeometry(1.0, STAFF_LIFT, 5.4), M.dark, 12.85, STAFF_LIFT / 2, 11.5);
    staff.root.rotation.y = -Math.PI / 2;
    staff.holdItem(popcornBucket(0.7));
    this.scene.add(staff.root);
    this.npcs.push({ ch: staff, path: [], speed: 0, lift: STAFF_LIFT });
    this.staff.push({ ch: staff, home: -Math.PI / 2, waveCd: 0 });
    this.spots.push({ id: "concession", pos: new THREE.Vector3(10.0, 0, 11.5), r: 2.4, label: () => "Mua bắp nước" });

    // SOÁT VÉ gate: brass stanchions + turnstile bar.
    this.mesh(new THREE.BoxGeometry(0.7, 1.0, 0.6), M.oak, 8.6, 0.5, 3.6);
    this.hangingSign("SOÁT VÉ", 10.75, 3.0, 2.45, 0, "#2A2320", "#F2C14E", 2.4);
    this.gateBar = this.mesh(new THREE.BoxGeometry(2.5, 0.1, 0.1), M.velvet, 10.75, 0.95, 3.2);
    for (const x of [9.35, 12.15]) { const ts = turnstile(); ts.group.position.set(x, 0, 3.2); this.scene.add(ts.group); this.gateKit.push(ts); }
    this.scanner = scannerPodium(); this.scanner.group.position.set(9.05, 0, 4.15); this.scanner.group.rotation.y = Math.PI / 2; this.scene.add(this.scanner.group);
    const gdecal = floorDecal("CHUẨN BỊ VÉ", 2.0, "#7dffa8"); gdecal.position.set(10.75, 0.02, 5.6); this.scene.add(gdecal);
    this.box(9.3, 12.2, 3.0, 3.4, () => !this.gateOpen);
    this.box(8.2, 9.0, 3.3, 3.9);
    const scannerGun = new THREE.Group(); // handheld ticket scanner
    scannerGun.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.04), std(0x1d1f24, { roughness: 0.4 })));
    const scanLed = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }));
    scanLed.position.set(0, 0.07, 0.015);
    scannerGun.add(scanLed);
    const checker = new Character({ hero: "StaffUsher", staff: true });
    checker.holdItem(scannerGun);
    checker.setTag("Soát vé", "staff");
    checker.root.position.set(8.6, 0, 4.4);
    checker.root.rotation.y = Math.PI / 2;
    this.scene.add(checker.root);
    this.npcs.push({ ch: checker, path: [], speed: 0 });
    this.staff.push({ ch: checker, home: Math.PI / 2, waveCd: 0 });
    this.spots.push({ id: "checker", pos: new THREE.Vector3(10.7, 0, 4.8), r: 2.2, label: () => (this.gateOpen ? null : "Đưa vé soát") });

    // Leather benches + planters, kept out of the walking lanes.
    for (const [x, z] of [[-6.5, 16.6], [6.5, 16.6]] as [number, number][]) {
      this.mesh(new THREE.BoxGeometry(2.6, 0.42, 0.75), M.leather, x, 0.32, z);
      this.mesh(new THREE.BoxGeometry(2.6, 0.12, 0.75), M.oak, x, 0.06, z);
      this.box(x - 1.3, x + 1.3, z - 0.4, z + 0.4);
    }
    for (const [x, z] of [[-13, 3], [-3.6, 16.8], [3.6, 16.8], [7, 3]]) {
      this.mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.65, 16), M.blackGloss, x, 0.33, z);
      this.mesh(new THREE.IcosahedronGeometry(0.62, 1), std(0x2f6a3a), x, 1.15, z);
      this.box(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
    }
  }

  /** West wing shell: neon arcade carpet, low walls. Machines are added by buildArcade(). */
  private buildWingShell(w: { x0: number; x1: number; z0: number; z1: number }, floor: THREE.Material, upper: THREE.Material) {
    const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2, W = w.x1 - w.x0, D = w.z1 - w.z0;
    this.floor(W, D, floor, cx, 0.012, cz);
    this.wall(cx, w.z0, W, 0.3, this.scene, upper, WING_H); // north
    const outerX = w.x0 < 0 ? w.x0 : w.x1;
    this.wall(outerX, cz, 0.3, D, this.scene, upper, WING_H); // outer side
    const innerX = w.x0 < 0 ? w.x1 : w.x0; // close the gap above the lobby wall (lobby is taller)
    this.mesh(new THREE.BoxGeometry(0.3, LOBBY_H - WING_H, D), std(0x1a0f12), innerX, WING_H + (LOBBY_H - WING_H) / 2, cz);
    this.box(w.x0, w.x1, w.z0 - 0.2, w.z0 + 0.2);
    this.box(outerX - 0.2, outerX + 0.2, w.z0, w.z1);
    // the lobby wall between z 2 and the wing's north edge already exists; close the gap z 2..z0
    const ceil = this.mesh(new THREE.PlaneGeometry(W, D), std(0x0c090c), cx, WING_H, cz);
    ceil.rotation.x = Math.PI / 2;
  }

  /** Quest beacon: pillar of light at the next objective. */
  private buildGuides() {
    this.beacon = new THREE.Group();
    // Light pillar fading out upward (vertical alpha gradient), so it reads as a glow, not a solid tube.
    const fadeTex = canvasTex(4, 128, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, "#000");
      grad.addColorStop(1, "#fff");
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 128);
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 6, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xf2c14e, alphaMap: fadeTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    pillar.position.y = 3;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.9, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0xf2c14e, emissiveIntensity: 2 }));
    gem.position.y = 2.6;
    gem.name = "gem";
    this.beacon.add(pillar, ring, gem);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  /** Where the story wants the player to go next (null = nothing to point at). */
  private objective(): THREE.Vector3 | null {
    if (this.seated) return null;
    if (!this.hasTicket) {
      if (this.queue.includes(this.player)) return null;
      const tail = QUEUE_SLOTS[Math.min(this.queue.length, QUEUE_SLOTS.length - 1)];
      return new THREE.Vector3(tail.x + 0.6, 0, tail.z);
    }
    if (!this.gateOpen) return new THREE.Vector3(10.7, 0, 4.8);
    if (this.zone !== "hall") return new THREE.Vector3([7.4, 10, 12.6][this.myRoom - 1], 0, -2.9);
    return new THREE.Vector3(0, this.heightAt(0, seatWorld(this.mySeat).z), seatWorld(this.mySeat).z);
  }

  private updateGuides(t: number) {
    const target = this.objective();
    this.beacon.visible = !!target;
    this.beacon.children[0].visible = this.zone !== "hall"; // the light pillar would cover the screen
    if (!target) return;
    this.beacon.position.copy(target);
    const gem = this.beacon.getObjectByName("gem")!;
    gem.position.y = 2.5 + Math.sin(t * 2.5) * 0.15;
    gem.rotation.y = t * 1.5;
  }

  private boardTex(films: FilmBoardRow[]) {
    return canvasTex(2048, 900, (g) => {
      g.fillStyle = "#120607";
      g.fillRect(0, 0, 2048, 900);
      g.fillStyle = "#F2C14E";
      g.font = `800 92px ${FONT}`;
      g.textBaseline = "middle";
      g.fillText("LỊCH CHIẾU HÔM NAY", 70, 90);
      const rows = films.slice(0, 6);
      const rh = Math.min(118, 700 / Math.max(1, rows.length));
      rows.forEach((f, i) => {
        const y = 210 + i * rh;
        g.fillStyle = i % 2 ? "#1d0b0e" : "#26101a";
        g.fillRect(50, y - rh / 2 + 6, 1948, rh - 12);
        g.fillStyle = "#C8372D";
        g.font = `800 46px ${FONT}`;
        g.fillText(`P${f.room}`, 80, y);
        g.fillStyle = "#F6E9E4";
        g.font = `800 54px ${FONT}`;
        g.fillText(f.title.length > 22 ? f.title.slice(0, 21) + "…" : f.title, 190, y);
        g.fillStyle = "#F2C14E";
        g.font = `500 50px ${FONT}`;
        g.fillText(f.times.map((t) => `${t.slice(0, 2)}:${t.slice(2)}`).join("   "), 980, y);
      });
    });
  }

  private buildCorridor(films: FilmBoardRow[]) {
    const M = this.mats();
    const carpet = pbr("quatrefoil_jacquard_fabric", { repeat: [4, 3], tint: 0x5a1822, lite: this.lite, roughness: 1 });
    this.floor(8, 6, carpet, 10, 0.01, -1);
    this.mesh(new THREE.PlaneGeometry(8, 6), M.dark, 10, 4, -1).rotation.x = Math.PI / 2;
    for (const x of [6, 14]) this.mesh(new THREE.BoxGeometry(0.4, 4, 6), M.acoustic, x, 2, -1);
    this.mesh(new THREE.BoxGeometry(8, 4, 0.4), M.acoustic, 10, 2, -4);
    this.box(5.8, 6.2, -4, 2);
    this.box(13.8, 14.2, -4, 2);
    this.box(6, 14, -4.2, -3.8);
    // cove light strip along the ceiling edge
    for (const x of [6.25, 13.75]) this.mesh(new THREE.BoxGeometry(0.06, 0.06, 6), new THREE.MeshBasicMaterial({ color: 0xffb36b, toneMapped: false }), x, 3.9, -1);
    // runner carpet, LED skirting, wall sconces, and a lit "now showing" box beside each door
    const runner = pbr("quatrefoil_jacquard_fabric", { repeat: [1, 4], tint: 0x8e1f2c, lite: this.lite, roughness: 1 });
    const rn = this.mesh(new THREE.PlaneGeometry(1.6, 5.6), runner, 10, 0.016, -1);
    rn.rotation.x = -Math.PI / 2;
    const skirt = new THREE.MeshBasicMaterial({ color: 0xffb36b, toneMapped: false });
    for (const x of [6.22, 13.78]) this.mesh(new THREE.BoxGeometry(0.03, 0.03, 5.6), skirt, x, 0.08, -1);
    for (const [x, z] of [[6.22, 0.6], [13.78, 0.6], [6.22, -2.2], [13.78, -2.2]]) {
      const sc = this.mesh(new THREE.BoxGeometry(0.08, 0.36, 0.2), new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffb870, emissiveIntensity: 1.4 }), x, 2.4, z);
      sc.rotation.y = x < 10 ? 0 : Math.PI;
    }
    [7.4, 10, 12.6].forEach((x, i) => {
      const room = i + 1;
      const now = films.find((f) => f.room === room);
      if (now) {
        const px = [6.55, 8.7, 13.45][i]; // wall gaps beside each door (doors are 1.6 m wide)
        this.mesh(new THREE.BoxGeometry(0.5, 0.74, 0.08), std(0x0e0d0f, { roughness: 0.3 }), px, 1.55, -3.72);
        this.mesh(new THREE.PlaneGeometry(0.44, 0.66), flat(this.realPoster(now)), px, 1.55, -3.67);
      }
      const door = swingDoors(1.6, 2.6, M.leather, M.brass); // padded double doors, swing into the corridor
      door.group.position.set(x, 0, -3.72);
      this.scene.add(door.group);
      this.roomDoors.push(door);
      this.mesh(new THREE.PlaneGeometry(1.5, 2.5), new THREE.MeshBasicMaterial({ color: 0x050304 }), x, 1.25, -3.8); // dark behind the doors
      this.mesh(new THREE.PlaneGeometry(1.4, 0.45), flat(signTex(`PHÒNG ${room}`, 420, 136, "#111", "#F2C14E", 78)), x, 2.95, -3.74);
      this.spots.push({
        id: "door",
        pos: new THREE.Vector3(x, 0, -2.9),
        r: 1.2,
        label: () => (room === this.myRoom && this.gateOpen ? `Vào Phòng ${room}` : null),
      });
    });
  }

  private buildHall() {
    const M = this.mats();
    const front = SCREEN.z - 0.6; // just behind the screen
    const depth = BACK_WALL - front, zc = H + (BACK_WALL + front) / 2;
    const WH = HALL_CEIL; // wall height
    const HW = HALL_W;
    // Carpeted floor + stadium risers (real jacquard texture), acoustic fabric side walls.
    const carpet = pbr("quatrefoil_jacquard_fabric", { repeat: [7, 11], tint: 0x4a1620, lite: this.lite, roughness: 1 });
    this.floor(HW * 2, depth, carpet, 0, 0, zc);
    const wallPanel = pbr("fabric_pattern_07", { repeat: [6, 3], tint: 0x2a1a20, lite: this.lite });
    for (const sx of [-1, 1]) {
      this.mesh(new THREE.BoxGeometry(0.3, WH, depth), wallPanel, sx * (HW + 0.15), WH / 2, zc);
      // vertical acoustic ribs + warm sconces
      for (let z = H - 13; z <= H + 8; z += 2.6) {
        this.mesh(new THREE.BoxGeometry(0.08, 7.5, 0.12), M.oak, sx * (HW - 0.02), 4.7, z);
        const sconce = this.mesh(new THREE.BoxGeometry(0.1, 0.5, 0.26), new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xffb870, emissiveIntensity: 1.6 }), sx * (HW - 0.06), 2.7, z + 1.3);
        this.hallGlow.push(sconce.material as THREE.MeshStandardMaterial);
      }
    }
    // Velvet curtains framing the screen + masking pelmet.
    const curtain = pbr("velour_velvet", { repeat: [6, 3], tint: 0x8c1424, lite: this.lite });
    this.mesh(new THREE.PlaneGeometry(HW * 2, WH), curtain, 0, WH / 2, H + SCREEN.z - 0.35);
    for (const sx of [-1, 1]) {
      const swag = this.mesh(new THREE.BoxGeometry(0.6, 8.6, 0.4), curtain, sx * (SCREEN.w / 2 + 0.45), 4.3, H + SCREEN.z - 0.1);
      swag.scale.z = 1.6;
    }
    this.mesh(new THREE.BoxGeometry(HW * 2, 1.2, 0.5), M.dark, 0, SCREEN.y + SCREEN.h / 2 + 0.75, H + SCREEN.z - 0.05);
    this.mesh(new THREE.PlaneGeometry(HW * 2, depth), M.dark, 0, WH - 0.05, zc).rotation.x = Math.PI / 2;
    // back wall with the projection-booth window and the exit doors
    this.mesh(new THREE.BoxGeometry(HW * 2, WH, 0.3), wallPanel, 0, WH / 2, H + BACK_WALL + 0.15, 0, this.hallBack);
    this.mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff1d0, toneMapped: false }), 0, 9.3, H + BACK_WALL - 0.01, 0, this.hallBack);
    this.hallExit = swingDoors(1.8, 2.4, M.leather, M.brass);
    this.hallExit.group.position.set(0, BACK_Y, H + BACK_WALL - 0.08);
    this.hallExit.group.rotation.y = Math.PI; // swings into the hall
    this.hallBack.add(this.hallExit.group);
    this.mesh(new THREE.PlaneGeometry(0.9, 0.32), new THREE.MeshBasicMaterial({ map: signTex("LỐI RA", 256, 92, "#063d1f", "#7dffa8", 56), toneMapped: false }), 0, BACK_Y + 2.7, H + BACK_WALL - 0.02, 0, this.hallBack);
    // stage lip under the screen
    this.mesh(new THREE.BoxGeometry(HW * 2, 0.5, 1.2), M.dark, 0, 0.25, H + SCREEN.z + 0.5);
    this.box(-HW - 0.2, -HW + 0.2, H + front, H + BACK_WALL + 0.5);
    this.box(HW - 0.2, HW + 0.2, H + front, H + BACK_WALL + 0.5);
    this.box(-HW, HW, H + BACK_WALL - 0.2, H + BACK_WALL + 0.2);
    this.box(-HW, HW, H + SCREEN.z + 0.4, H + SCREEN.z + 1.2);
    // EXIT signs in the front corners
    for (const sx of [-1, 1]) {
      this.mesh(new THREE.PlaneGeometry(0.9, 0.32), new THREE.MeshBasicMaterial({ map: signTex("EXIT", 256, 92, "#063d1f", "#7dffa8", 70), toneMapped: false }), sx * (HW - 0.32), 3.2, H + FIRST_ROW_Z - 2.4, -sx * Math.PI / 2);
    }

    this.screenMat = new THREE.MeshBasicMaterial({ color: 0xd9cfc8, toneMapped: false });
    this.screenMesh = this.mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), this.screenMat, 0, SCREEN.y, H + SCREEN.z);
    this.hallSignMat = flat(signTex("PHÒNG", 512, 128, "#111", "#F2C14E", 72));
    this.mesh(new THREE.PlaneGeometry(2, 0.5), this.hallSignMat, 0, SCREEN.y + SCREEN.h / 2 + 0.75, H + SCREEN.z + 0.21);

    const len = 18;
    const beamGeo = new THREE.ConeGeometry(SCREEN.w * 0.42, len, 32, 1, true);
    beamGeo.translate(0, -len / 2, 0);
    // Projector near the ceiling, outside faces only: seated cameras sit inside the cone and
    // must not get washed out by it.
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }));
    this.beam.position.set(0, 9.3, H + BACK_WALL - 0.3);
    this.beam.lookAt(0, SCREEN.y, H + SCREEN.z);
    this.beam.rotateX(-Math.PI / 2);
    this.scene.add(this.beam);
    const n = this.high ? 420 : 180;
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = Math.random();
      pts[i * 3] = (Math.random() - 0.5) * SCREEN.w * 0.8 * k;
      pts[i * 3 + 1] = 9.3 - (9.3 - SCREEN.y) * k + (Math.random() - 0.5) * SCREEN.h * 0.8 * k;
      pts[i * 3 + 2] = H + BACK_WALL - (BACK_WALL - SCREEN.z) * k;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xfff4dc, size: 0.035, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dust);

    // Stadium risers with LED step lights on the aisle edges.
    const riserMat = pbr("quatrefoil_jacquard_fabric", { repeat: [8, 0.6], tint: 0x4a1620, lite: this.lite, roughness: 1 });
    const stepLight = new THREE.MeshBasicMaterial({ color: 0xffc27a, toneMapped: false });
    ROWS.forEach((r) => {
      const p = seatWorld(`${r}1`);
      if (p.y > 0) {
        const step = this.mesh(new THREE.BoxGeometry(HW * 2, p.y, ROW_D), riserMat, 0, p.y / 2, p.z);
        this.floors.push(step);
        for (const x of [-0.7, 0.7, -HW + 0.5, HW - 0.5]) this.mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), stepLight, x, p.y - 0.06, p.z + ROW_D / 2 + 0.016);
      }
    });
    const back = this.mesh(new THREE.BoxGeometry(HW * 2, BACK_Y, BACK_WALL - LAST_EDGE), riserMat, 0, BACK_Y / 2, H + (BACK_WALL + LAST_EDGE) / 2);
    this.floors.push(back);
    // Seat blocks are solid; the centre and side aisles stay walkable.
    const blockX = 1.0 + (AISLE_AFTER - 1) * SEAT_W + SEAT_W / 2;
    const zA = H + FIRST_ROW_Z - ROW_D / 2 + 0.1, zH = H + LAST_EDGE - 0.1;
    this.box(-blockX, -0.64, zA, zH);
    this.box(0.64, blockX, zA, zH);

    // Leather recliners: cushion + back + headrest (instanced, colour per seat) and arms/cupholders.
    for (const r of ROWS) for (let c = 1; c <= COLS; c++) this.seatIds.push(`${r}${c}`);
    const parts = [
      new RoundedBoxGeometry(0.6, 0.2, 0.62, 3, 0.07).translate(0, 0.42, -0.02), // cushion
      new RoundedBoxGeometry(0.6, 0.74, 0.18, 3, 0.07).rotateX(-0.16).translate(0, 0.83, 0.3), // back
      new RoundedBoxGeometry(0.5, 0.22, 0.2, 3, 0.08).rotateX(-0.16).translate(0, 1.27, 0.37), // headrest
      new RoundedBoxGeometry(0.58, 0.28, 0.1, 2, 0.04).translate(0, 0.25, -0.33), // leg rest
      new RoundedBoxGeometry(0.56, 0.12, 0.06, 2, 0.03).translate(0, 0.62, 0.21), // lumbar roll
    ];
    const seatGeo = mergeGeometries(parts)!;
    const leather = pbr("leather_red_02", { repeat: [1, 1], tint: 0xffffff, lite: this.lite });
    this.seatMesh = new THREE.InstancedMesh(seatGeo, leather, this.seatIds.length);
    const armGeo = mergeGeometries([
      new THREE.BoxGeometry(0.1, 0.5, 0.66).translate(-SEAT_W / 2, 0.36, 0),
      new THREE.CylinderGeometry(0.05, 0.04, 0.08, 10).translate(-SEAT_W / 2, 0.64, -0.24), // cupholder
    ])!;
    const arms = new THREE.InstancedMesh(armGeo, M.dark, this.seatIds.length + ROW_N * 2);
    const m = new THREE.Matrix4();
    let ai = 0;
    this.seatIds.forEach((id, i) => {
      const p = seatWorld(id);
      m.makeTranslation(p.x, p.y, p.z);
      this.seatMesh.setMatrixAt(i, m);
      this.seatMesh.setColorAt(i, new THREE.Color(0xb8323c));
      arms.setMatrixAt(ai++, m);
      const c = Number(id.slice(1));
      if (c === AISLE_AFTER || c === COLS) { m.makeTranslation(p.x + SEAT_W, p.y, p.z); arms.setMatrixAt(ai++, m); }
    });
    arms.count = ai;
    this.scene.add(this.seatMesh, arms, this.hallPeople);
    // drinks left in some cup holders, and lit row letters at both aisle ends
    const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.032, 0.14, 10), std(0xc8372d, { roughness: 0.5 }), 60);
    let ci = 0;
    this.seatIds.forEach((id, i) => {
      if (ci >= 60 || (i * 7919) % 5 !== 0) return;
      const p = seatWorld(id);
      m.makeTranslation(p.x - SEAT_W / 2, p.y + 0.7, p.z - 0.24);
      cups.setMatrixAt(ci++, m);
    });
    cups.count = ci;
    this.scene.add(cups);
    for (const r of ROWS) for (const c of [AISLE_AFTER, AISLE_AFTER + 1]) {
      const p = seatWorld(`${r}${c}`);
      const lt = rowLetter(r);
      const left = c === AISLE_AFTER;
      lt.position.set(left ? -0.58 : 0.58, p.y + 0.62, p.z + 0.05);
      lt.rotation.y = left ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(lt);
    }

    // Floating marker over my seat.
    this.seatMarker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 16), std(COL.bulb, { emissive: COL.bulb, emissiveIntensity: 1.2 }));
    cone.rotation.x = Math.PI;
    this.seatMarker.add(cone);
    this.seatMarker.visible = false;
    this.scene.add(this.seatMarker);

    this.spots.push({
      id: "exit",
      pos: new THREE.Vector3(0, 0, H + BACK_WALL - 1.0),
      r: 1.6,
      label: () => (this.zone === "hall" && !this.seated ? "Ra sảnh" : null),
    });
    this.spots.push({
      id: "seat",
      pos: new THREE.Vector3(0, 0, 0),
      r: 1.3,
      label: () => (this.mySeat && !this.seated && this.zone === "hall" ? `Ngồi vào ghế ${this.mySeat}` : null),
    });
  }

  private spawnIdlers() {
    const spots: [number, number, number][] = [[-5.6, 4.9, 0.3], [-3.4, 5.3, -0.2], [-0.9, 5.0, 0.2], [-12.4, 16, Math.PI / 2], [12.4, 6.6, -Math.PI / 2], [6.5, 14.5, -2.4]];
    spots.forEach(([x, z, ry], i) => {
      const c = new Character(lookFromSeed(i * 7 + 300));
      c.root.position.set(x, 0, z);
      c.root.rotation.y = i < 3 ? Math.PI : ry; // the first three read the board
      this.scene.add(c.root);
      this.npcs.push({ ch: c, path: [], speed: 0 });
      this.box(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    });
  }

  // ======================= movement =======================

  private heightAt(_x: number, z: number): number {
    if (z > -40) return 0;
    const local = z - H;
    if (local > LAST_EDGE) return BACK_Y;
    if (local < FIRST_ROW_Z - ROW_D / 2) return 0;
    const r = Math.max(0, Math.min(ROW_N - 1, Math.round((local - FIRST_ROW_Z) / ROW_D)));
    return r * TIER;
  }

  private blocked(x: number, z: number): boolean {
    for (const b of this.boxes) {
      if (b.on && !b.on()) continue;
      if (x > b.x0 - R && x < b.x1 + R && z > b.z0 - R && z < b.z1 + R) return true;
    }
    return false;
  }

  private stepAgent(a: Agent, dt: number) {
    const pos = a.ch.root.position;
    let speed = 0;
    if (a.path.length) {
      const t = a.path[0];
      const dx = t.x - pos.x, dz = t.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = a.speed * dt;
      if (d <= step || d < 0.02) {
        pos.x = t.x;
        pos.z = t.z;
        a.path.shift();
        if (!a.path.length) { const cb = a.onArrive; a.onArrive = undefined; cb?.(); }
      } else {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        a.ch.face(dx, dz);
      }
      speed = a.speed;
    }
    if (!a.ch.seated) pos.y += (this.heightAt(pos.x, pos.z) + (a.lift ?? 0) - pos.y) * Math.min(1, dt * 12);
    a.ch.animate(dt, speed);
  }

  private stepPlayer(dt: number) {
    const a = this.player;
    if (this.seated) return;
    if (this.mode) { a.ch.animate(dt, 0); return; }
    const inQueue = this.queue.includes(a);
    let v = this.input.vector();
    if (inQueue || a.path.length) {
      if (!inQueue && (v.x || v.z)) { a.path = []; a.onArrive = undefined; } // manual input cancels a scripted walk
      else return this.stepAgent(a, dt);
    }
    if (v.x || v.z) this.tapTarget = null;
    else if (this.tapTarget) {
      const dx = this.tapTarget.x - a.ch.root.position.x, dz = this.tapTarget.z - a.ch.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) this.tapTarget = null;
      else v = { x: dx / d, z: dz / d };
    }
    // Velocity eases toward the input (no instant starts/stops).
    const k = 1 - Math.exp(-ACCEL * dt);
    this.vel.x += (v.x * SPEED - this.vel.x) * k;
    this.vel.y += (v.z * SPEED - this.vel.y) * k;
    const pos = a.ch.root.position;
    let sp = Math.hypot(this.vel.x, this.vel.y);
    let moved = false;
    if (sp > 0.02) {
      // Steering: if the straight step is blocked, try slightly rotated directions so the
      // player slides around benches and counters instead of sticking to them.
      const base = Math.atan2(this.vel.y, this.vel.x);
      for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.25, -1.25]) {
        const ang = base + off;
        const nx = pos.x + Math.cos(ang) * sp * dt, nz = pos.z + Math.sin(ang) * sp * dt;
        if (!this.blocked(nx, nz)) {
          pos.x = nx;
          pos.z = nz;
          moved = true;
          if (off !== 0) { this.vel.set(Math.cos(ang) * sp, Math.sin(ang) * sp); }
          break;
        }
      }
      if (!moved) { this.vel.set(0, 0); sp = 0; if (this.tapTarget) this.tapTarget = null; }
      if (moved) a.ch.face(this.vel.x, this.vel.y);
    }
    pos.y += (this.heightAt(pos.x, pos.z) - pos.y) * Math.min(1, dt * 12);
    a.ch.animate(dt, moved ? sp : 0);
  }

  private currentSpot(): Spot | null {
    if (this.seated || this.mode) return null;
    const p = this.player.ch.root.position;
    // the seat prompt sits in the aisle beside my row
    const seatSpot = this.spots.find((s) => s.id === "seat")!;
    if (this.mySeat) seatSpot.pos.set(0, 0, seatWorld(this.mySeat).z);
    let best: Spot | null = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < s.r && d < bestD && s.label()) { best = s; bestD = d; }
    }
    return best;
  }

  /** Real-cinema HDRIs: lobby light out front, the auditorium's own light in the corridor + hall. */
  private applyEnv() {
    const inside = this.zone === "hall" || this.zone === "corridor";
    const env = inside ? this.envs.hall : this.envs.lobby;
    if (env) { this.scene.environment = env; this.envBase = inside ? 0.55 : 0.7; }
  }

  private setZone(z: Zone) {
    if (z === this.zone) return;
    this.zone = z;
    if (z === "corridor" && !this.envs.hall) loadEnv(this.renderer, "cinema_hall").then((env) => { this.envs.hall = env; this.applyEnv(); }).catch(() => {});
    this.applyEnv();
    this.scene.background = z === "street" ? this.sky : this.indoor;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.setHex(z === "street" ? 0x2a1626 : 0x0a0507);
    this.lobbyBack.visible = z !== "corridor";
    this.exterior.visible = z === "street";
    this.player.ch.setTagScale(z === "hall" ? 0.75 : 1);
    this.events.zone(z);
  }

  private updateZone() {
    const p = this.player.ch.root.position;
    this.setZone(p.z < -40 ? "hall" : p.z > 18 ? "street" : p.z < 2 ? "corridor" : p.x < ARCADE.x1 ? "arcade" : p.x > KARAOKE.x0 ? "karaoke" : "lobby");
  }

  // ======================= camera / loop =======================

  private camTarget(): { pos: THREE.Vector3; look: THREE.Vector3; fov?: number } {
    if (this.mode) return this.mode.camera();
    const p = this.player.ch.root.position;
    if (this.seated) {
      const s = seatWorld(this.mySeat);
      return { pos: new THREE.Vector3(s.x, s.y + 1.75, s.z + 0.15), look: new THREE.Vector3(0, SCREEN.y, H + SCREEN.z) };
    }
    const portrait = this.container.clientWidth < this.container.clientHeight;
    const room = ROOMS[this.zone];
    if (!room) { // street: high establishing view of the facade
      const off = portrait ? new THREE.Vector3(0, 10, 10.5) : new THREE.Vector3(0, 8.2, 10);
      return { pos: p.clone().add(off), look: new THREE.Vector3(p.x, p.y + 0.8, p.z - 1.5) };
    }
    // Indoors ("dollhouse" cutaway): high and well back for a wide view, kept between the side
    // walls and under the ceiling. The wall nearest the camera is hidden in cutaway() instead.
    const off = this.zone === "hall" ? new THREE.Vector3(0, 8.4, 6.6) : portrait ? new THREE.Vector3(0, 8.6, 10.5) : new THREE.Vector3(0, 7.4, 10);
    const pos = p.clone().add(off);
    const m = 0.6;
    pos.x = THREE.MathUtils.clamp(pos.x, room.x0 + m, room.x1 - m);
    pos.z = THREE.MathUtils.clamp(pos.z, room.z0 + m, room.z1 + 2); // may back through the cut-away near wall, but not into the void
    pos.y = Math.min(pos.y, room.ceil - 0.3);
    return { pos, look: new THREE.Vector3(p.x, p.y + 0.9, p.z - (this.zone === "hall" ? 2.4 : 1.6)) };
  }

  /** Staff turn to face you when you come close and wave hello (then go back to their post). */
  private updateStaff(dt: number) {
    const p = this.player.ch.root.position;
    for (const s of this.staff) {
      s.waveCd -= dt;
      const r = s.ch.root;
      const dx = p.x - r.position.x, dz = p.z - r.position.z;
      const near = Math.hypot(dx, dz) < 3.6 && !this.seated && this.zone === "lobby";
      const want = near ? Math.atan2(dx, dz) : s.home;
      let d = want - r.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      r.rotation.y += d * Math.min(1, dt * 4);
      if (near && s.waveCd <= 0) { s.ch.wave(); s.waveCd = 25; }
    }
  }

  /** Hide only the walls that stand between the camera and the room it is looking into. */
  private cutaway() {
    const c = this.camera.position;
    this.facade.visible = this.zone === "street" || c.z < 17.8; // south facade: behind the camera once it backs out of the lobby
    this.hallBack.visible = c.z < H + BACK_WALL - 0.1;
  }

  private snapCamera() {
    const t = this.camTarget();
    this.camera.position.copy(t.pos);
    this.camLook.copy(t.look);
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const t = this.timer.getElapsed();

    this.updateQueue(dt);
    for (const c of this.claws) if (c !== this.activeClaw) c.update(dt, { x: 0, z: 0 }); // the played one is driven by its mode
    this.gacha.update(dt);
    for (const f of this.ticker) f(dt, t);
    const pp = this.player.ch.root.position;
    for (const a of this.autoDoors) {
      if (Math.hypot(pp.x - a.at.x, pp.z - a.at.z) < a.r && !this.seated) a.door.open(0.8);
      a.door.update(dt);
    }
    for (const d of this.roomDoors) d.update(dt);
    this.hallExit.update(dt);
    this.updateStaff(dt);
    for (const b of this.karaoke) b.update(dt, t);
    if (this.mode) this.mode.update(dt, this.input.vector());
    for (const a of [...this.npcs]) this.stepAgent(a, dt);
    if (this.zone === "hall") for (const c of this.seatedCrowd) c.animate(dt, 0);
    this.stepPlayer(dt);
    this.updatePeers(dt);
    this.updateZone();
    this.emitQueue();
    this.updateGuides(t);

    const spot = this.currentSpot();
    const key = spot ? `${spot.id}:${spot.label()}` : "";
    if (key !== this.lastPrompt) { this.lastPrompt = key; this.events.prompt(spot ? { id: spot.id, label: spot.label()! } : null); }

    const ct = this.camTarget();
    const fov = ct.fov ?? this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 6); this.camera.updateProjectionMatrix(); }
    const k = this.seated ? 1 - Math.exp(-dt * 2.5) : 1 - Math.exp(-dt * 4.5);
    this.camera.position.lerp(ct.pos, k);
    this.camLook.lerp(ct.look, k);
    this.camera.lookAt(this.camLook);
    this.cutaway();

    // lights dim
    this.dim.v += (this.dim.target - this.dim.v) * (this.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4));
    const keep = 1 - this.dim.v * 0.94;
    for (const { l, base } of this.lights) l.intensity = base * keep;
    this.scene.environmentIntensity = this.envBase * keep; // image-based light dims with the house lights
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.06 * this.dim.v;
    for (const g of this.hallGlow) g.emissiveIntensity = 1.6 * (1 - this.dim.v * 0.85);
    this.bulbs.forEach((b, i) => {
      const on = (Math.sin(t * 6 - i * 0.7) + 1) / 2;
      (b.material as THREE.MeshStandardMaterial).emissiveIntensity = this.reducedMotion ? 1.4 : 0.4 + on * 2.2;
    });
    if (this.seatMarker.visible) {
      this.seatMarker.position.y += Math.sin(t * 3) * 0.004;
      this.seatMarker.rotation.y += dt * 2;
    }
    if (this.leader) this.drawLeader(t - this.leader.start);

    // occasionally someone new walks in and queues
    if (Math.floor(t / 9) !== Math.floor((t - dt) / 9) && this.queue.length < QUEUE_SLOTS.length - 1 && !this.seated) this.spawnQueuer(Math.floor(t));

    if (this.dust.visible) {
      (this.dust.material as THREE.PointsMaterial).opacity = 0.55 * this.dim.v;
      this.dust.rotation.y = t * 0.02;
      this.dust.position.y = Math.sin(t * 0.3) * 0.15;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.css?.render(this.scene, this.camera);
    if (this.captureCb) { const cb = this.captureCb; this.captureCb = null; cb(this.renderer.domElement); } // same task as the draw: buffer still valid
  };

  private drawLeader(elapsed: number) {
    const { g, tex } = this.leader!;
    const W = 1024, Hh = 428;
    // Roll the film once the countdown is over and the browser actually has frames; if the
    // video failed to load (network/blocked), stay on the "enjoy the show" card.
    if (this.trailerKey && elapsed >= 6.5) return this.rollTrailer();
    const v = this.video;
    if (v && elapsed >= 6.5 && !v.error && v.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return this.rollFilm();
    if (elapsed < 5) {
      const n = 5 - Math.floor(elapsed);
      g.fillStyle = "#d8d0c4";
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = "#b9ae9f";
      g.beginPath();
      g.moveTo(W / 2, Hh / 2);
      g.arc(W / 2, Hh / 2, 600, -Math.PI / 2, -Math.PI / 2 + (elapsed % 1) * Math.PI * 2);
      g.fill();
      g.strokeStyle = "#2a2320";
      g.lineWidth = 6;
      for (const r of [150, 180]) { g.beginPath(); g.arc(W / 2, Hh / 2, r, 0, Math.PI * 2); g.stroke(); }
      g.beginPath();
      g.moveTo(0, Hh / 2); g.lineTo(W, Hh / 2); g.moveTo(W / 2, 0); g.lineTo(W / 2, Hh);
      g.stroke();
      g.fillStyle = "#2a2320";
      g.font = `800 180px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(n), W / 2, Hh / 2 + 12);
    } else {
      g.fillStyle = "#2a2320";
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = "#F2C14E";
      g.font = `800 40px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const waiting = v && !v.error && v.networkState !== HTMLMediaElement.NETWORK_NO_SOURCE;
      g.fillText(waiting ? "ĐANG TẢI PHIM…" : "CHÚC QUÝ KHÁCH", W / 2, Hh / 2 - 26);
      g.fillText(waiting ? "" : "XEM PHIM VUI VẺ", W / 2, Hh / 2 + 26);
    }
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
    g.fillRect(0, 0, W, Hh);
    tex.needsUpdate = true;
  }

  /** Embed the distributor's official YouTube trailer on the screen plane (no copy is hosted here). */
  private rollTrailer() {
    this.leader = null;
    const key = this.trailerKey!;
    this.trailerKey = null;
    this.screenMat.map = null;
    this.screenMat.color.setHex(0x000000);
    this.screenMat.needsUpdate = true;
    const css = new CSS3DRenderer();
    css.domElement.style.position = "absolute";
    css.domElement.style.inset = "0";
    css.domElement.style.pointerEvents = "none";
    this.container.appendChild(css.domElement);
    this.css = css;
    this.resize();
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
    frame.allow = "autoplay; encrypted-media; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.title = "Trailer chính thức";
    Object.assign(frame.style, { width: "1280px", height: "720px", border: "0", background: "#000", pointerEvents: "auto" });
    const obj = new CSS3DObject(frame);
    this.trailerObj = obj;
    obj.position.set(0, SCREEN.y, H + SCREEN.z + 0.01);
    obj.scale.setScalar(SCREEN.h / 720); // 16:9 fitted to the screen height
    this.scene.add(obj);
  }

  private rollFilm() {
    const v = this.video!;
    this.leader = null;
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat.map = tex;
    this.screenMat.needsUpdate = true;
    // Keep the picture's aspect: shrink the screen width for 16:9 films (masking, like a real cinema).
    const fit = () => {
      if (!v.videoWidth) return;
      const aspect = v.videoWidth / v.videoHeight;
      this.screenMesh.scale.x = Math.min(1, (SCREEN.h * aspect) / SCREEN.w);
      this.screenMesh.scale.y = Math.min(1, SCREEN.w / aspect / SCREEN.h);
    };
    fit();
    v.addEventListener("loadedmetadata", fit, { once: true });
    if (v.ended) v.currentTime = 0; // standing up and sitting back down resumes the film
    v.play().catch(() => this.events.toast("Bấm 🔊 để bật phim"));
  }

  // ======================= input =======================

  private resize = () => {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.baseFov = w < h ? 62 : 50;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.css?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
  };

  private down: { x: number; y: number } | null = null;
  private onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
  private onUp = (e: PointerEvent) => {
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8 || this.seated) return;
    if (this.queue.includes(this.player)) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.floors, false)[0];
    if (hit) { this.player.path = []; this.tapTarget = hit.point.clone(); }
  };
}
