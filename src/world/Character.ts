// Heroes: KayKit Adventurers + Skeletons (CC0, Kay Lousberg — www.kaylousberg.com), optimized by
// scripts/optimize-heroes.mjs into public/heroes/*.glb (6 clips, 1 signature prop, meshopt).
// Each Character clones the rigged template (SkeletonUtils) and drives its own AnimationMixer.
// Local forward is +z; root sits at the feet.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

import { buildPerson, CIVIL_STYLES, PUPPET_HIP, STAFF_STYLES } from "./people";

const ADVENTURERS = ["Knight", "Barbarian", "Mage", "Rogue", "Rogue_Hooded"] as const;
/** KayKit Skeletons: same Rig_Medium + clip names as the adventurers, no hand props. */
const SKELETONS = ["Skeleton_Warrior", "Skeleton_Mage", "Skeleton_Rogue", "Skeleton_Minion"] as const;
const RIGGED = [...ADVENTURERS, ...SKELETONS] as const;
const CIVIL = ["SinhVien", "CongSo", "CoNang"] as const;
const STAFF = ["StaffTicket", "StaffSnack", "StaffUsher"] as const;
/**
 * Fan-made model supplied by the project owner (Pikachu is a Nintendo/Game Freak character):
 * offered in dev builds only, unless VITE_FAN_MODELS=1 is set on purpose.
 */
export const FAN_MODELS = import.meta.env.DEV || import.meta.env.VITE_FAN_MODELS === "1";
/**
 * Single-mesh models supplied by the project owner (converted by scripts/convert-obj.mjs).
 * `fan`: a third-party character (not ours to publish) → dev builds only. `turn`: yaw so the
 * model faces +z like every other character. Heights in metres.
 */
const STATIC = {
  Pikachu: { url: "/fan/pikachu.glb", height: 0.95, fan: true, turn: 0 },
  Model1: { url: "/models/model-1.glb", height: 1.5, fan: false, turn: 0 },
  Model2: { url: "/models/model-2.glb", height: 1.45, fan: false, turn: 0 },
  Model3: { url: "/models/model-3.glb", height: 0.75, fan: false, turn: 0 },
} as const;
type StaticId = keyof typeof STATIC;
const STATIC_IDS = Object.keys(STATIC) as StaticId[];
export type HeroId = (typeof RIGGED)[number] | (typeof CIVIL)[number] | (typeof STAFF)[number] | StaticId;
/** What players can pick (staff uniforms are for NPCs only). */
export const HERO_IDS: readonly HeroId[] = [...STATIC_IDS.filter((id) => !STATIC[id].fan), ...CIVIL, ...RIGGED, ...STATIC_IDS.filter((id) => STATIC[id].fan && FAN_MODELS)];
export const HERO_NAMES: Record<HeroId, string> = {
  Knight: "Hiệp sĩ", Barbarian: "Chiến binh", Mage: "Pháp sư", Rogue: "Sát thủ", Rogue_Hooded: "Thích khách",
  SinhVien: "Sinh viên", CongSo: "Dân công sở", CoNang: "Cô nàng",
  StaffTicket: "Nhân viên bán vé", StaffSnack: "Nhân viên bắp nước", StaffUsher: "Nhân viên soát vé", Pikachu: "Pikachu",
  Skeleton_Warrior: "Bộ xương chiến binh", Skeleton_Mage: "Bộ xương pháp sư", Skeleton_Rogue: "Bộ xương lãng khách", Skeleton_Minion: "Bộ xương lính lác",
  Model1: "Anh Râu", Model2: "Chuối Vui", Model3: "Corgi",
};
const PROP: Partial<Record<HeroId, string>> = { Knight: "1H_Sword", Barbarian: "1H_Axe", Mage: "2H_Staff", Rogue: "Knife", Rogue_Hooded: "Knife" };
const HEIGHT = 1.5; // metres, top of hat/helmet (KayKit heads/hats are wide; keeps them inside 0.68 m seats)
const FONT = '"Be Vietnam Pro", sans-serif';

export interface Look { hero: HeroId; staff?: boolean }
const CROWD: HeroId[] = [...ADVENTURERS, ...CIVIL]; // NPC crowd stays human; skeletons are player picks
export function lookFromSeed(seed: number): Look {
  return { hero: CROWD[Math.abs(Math.floor(Math.sin(seed * 9301 + 49297) * 233280)) % CROWD.length] };
}

// ---------- template library ----------
/** rig = KayKit skinned + clips; puppet = procedural person with limb pivots; static = one mesh (fan model). */
interface Template { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; scale: number; kind: "rig" | "puppet" | "static"; height: number }
const lib = new Map<HeroId, Template>();
const pending = new Map<HeroId, Promise<Template>>();
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

function loadHero(id: HeroId): Promise<Template> {
  if (lib.has(id)) return Promise.resolve(lib.get(id)!);
  const style = (CIVIL_STYLES as Record<string, Parameters<typeof buildPerson>[0]>)[id] ?? (STAFF_STYLES as Record<string, Parameters<typeof buildPerson>[0]>)[id];
  if (style) {
    const t: Template = { scene: buildPerson(style), clips: new Map(), scale: 1, kind: "puppet", height: HEIGHT };
    lib.set(id, t);
    return Promise.resolve(t);
  }
  if (id in STATIC) {
    const def = STATIC[id as StaticId];
    if (!pending.has(id)) pending.set(id, loader.loadAsync(def.url).then((g) => {
      g.scene.rotation.y = def.turn;
      const box = new THREE.Box3().setFromObject(g.scene);
      const h = def.height;
      const t: Template = { scene: g.scene, clips: new Map(), scale: h / Math.max(0.01, box.max.y - box.min.y), kind: "static", height: h };
      lib.set(id, t);
      return t;
    }));
    return pending.get(id)!;
  }
  if (!pending.has(id)) {
    pending.set(id, loader.loadAsync(`/heroes/${id}.glb`).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.frustumCulled = false; // skinned bounds don't follow animation
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.roughness = Math.max(0.55, mat.roughness ?? 1);
        }
      });
      const box = new THREE.Box3().setFromObject(g.scene);
      const t: Template = { scene: g.scene, clips: new Map(g.animations.map((c) => [c.name, c])), scale: HEIGHT / Math.max(0.01, box.max.y - box.min.y), kind: "rig", height: HEIGHT };
      lib.set(id, t);
      return t;
    }));
  }
  return pending.get(id)!;
}

/** A remote player's model, or a safe stand-in if this build doesn't have it loaded. */
export const heroOrFallback = (id: HeroId): HeroId => (lib.has(id) ? id : "SinhVien");

/** Load hero templates before constructing Characters. */
export function preloadHeroes(ids: readonly HeroId[] = [...HERO_IDS, ...CROWD, ...STAFF]): Promise<void> {
  return Promise.all(ids.map(loadHero)).then(() => undefined);
}

let shadowMat: THREE.MeshBasicMaterial | null = null;
function blobShadow(): THREE.Mesh {
  if (!shadowMat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.5)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.renderOrder = 1;
  return m;
}

export type TagStyle = "me" | "friend" | "staff" | "peer";
/** Name tags + chat bubbles render on this layer, so close-up cameras (booth, machines) can skip them. */
export const LABEL_LAYER = 1;

export class Character {
  readonly root = new THREE.Group();
  readonly hero: HeroId;
  private model: THREE.Object3D;
  private scale: number;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private prop: THREE.Object3D | null;
  private handL: THREE.Object3D | null;
  private handR: THREE.Object3D | null;
  private item: THREE.Object3D | null = null;
  private shadow: THREE.Mesh;
  private tag: THREE.Sprite | null = null;
  private popcorn: THREE.Group | null = null;
  private bubble: THREE.Sprite | null = null;
  private bubbleLeft = 0;
  private oneShot = 0; // seconds left of a one-off clip (cheer/wave) that idle must not cut off
  private staff: boolean;
  private kind: Template["kind"];
  private height: number;
  private limbs: Record<"armL" | "armR" | "legL" | "legR", THREE.Object3D | undefined>;
  private phase = Math.random() * 6;
  private gesture: "" | "wave" | "cheer" = "";
  seated = false;

  constructor(look: Look) {
    const t = lib.get(look.hero);
    if (!t) throw new Error(`Hero ${look.hero} not loaded; call preloadHeroes() first`);
    this.hero = look.hero;
    this.staff = !!look.staff;
    this.scale = t.scale;
    this.model = cloneSkinned(t.scene);
    this.model.scale.setScalar(t.scale);
    this.root.add(this.model);
    this.kind = t.kind;
    this.height = t.height;
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [name, clip] of t.clips) this.actions.set(name, this.mixer.clipAction(clip));
    const prop = PROP[look.hero];
    this.prop = prop ? this.model.getObjectByName(prop) ?? null : null;
    this.limbs = { armL: this.model.getObjectByName("armL"), armR: this.model.getObjectByName("armR"), legL: this.model.getObjectByName("legL"), legR: this.model.getObjectByName("legR") };
    this.handL = this.model.getObjectByName("handslotl") ?? this.model.getObjectByName("handslot.l") ?? null;
    this.handR = this.model.getObjectByName("handslotr") ?? this.model.getObjectByName("handslot.r") ?? null;
    if (this.kind === "static" && !this.handR) { // fan model: hold things in front of the belly
      this.handR = new THREE.Object3D();
      this.handR.position.set(0.15 / t.scale, 0.35 / t.scale, 0.25 / t.scale);
      this.handL = this.handR;
      this.model.add(this.handR);
    }
    if (this.staff && this.prop) this.prop.visible = false;
    this.shadow = blobShadow();
    this.root.add(this.shadow);
    this.play("Idle", 0);
    this.mixer.setTime(Math.random() * 2); // de-sync idle loops
  }

  private play(name: string, fade = 0.25, once = false) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return;
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current) this.current.stop();
    this.current = next;
  }

  setTag(text: string, style: TagStyle) {
    if (this.tag) { this.root.remove(this.tag); (this.tag.material as THREE.SpriteMaterial).map?.dispose(); }
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const fontPx = 40;
    g.font = `800 ${fontPx}px ${FONT}`;
    const w = Math.ceil(g.measureText(text).width) + 56;
    const h = 72, tip = 12;
    c.width = w;
    c.height = h + tip + 8;
    g.shadowColor = "rgba(0,0,0,.35)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 3;
    g.fillStyle = style === "me" ? "#F2C14E" : style === "friend" ? "#F4C9C4" : style === "peer" ? "#1D0B0E" : "#F6E9E4";
    g.beginPath();
    g.roundRect(2, 2, w - 4, h - 4, (h - 4) / 2);
    g.moveTo(w / 2 - tip, h - 3);
    g.lineTo(w / 2, h + tip - 2);
    g.lineTo(w / 2 + tip, h - 3);
    g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = style === "staff" ? "#C8372D" : style === "peer" ? "#F6E9E4" : "#2A2320";
    g.font = `800 ${fontPx}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
    if (style === "peer") { // other real players: dark pill + gold rim, reads apart from NPC/staff
      g.strokeStyle = "rgba(242,193,78,.85)";
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(3.5, 3.5, w - 7, h - 7, (h - 7) / 2);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false }));
    const k = 0.3 / h;
    s.scale.set(w * k, c.height * k, 1);
    s.position.y = this.height + 0.32;
    s.renderOrder = 20;
    s.layers.set(LABEL_LAYER);
    this.tag = s;
    this.root.add(s);
  }

  /** Scale the name tag (smaller in the crowded hall). */
  setTagScale(k: number) { if (this.tag) this.tag.scale.multiplyScalar(k / (this.tag.userData.k ?? 1)), (this.tag.userData.k = k); }

  /** Speech bubble above the head for a few seconds (chat). */
  say(text: string, seconds = 6) {
    if (this.bubble) { this.root.remove(this.bubble); (this.bubble.material as THREE.SpriteMaterial).map?.dispose(); }
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    const px = 34, maxW = 460, pad = 24, lh = px * 1.3;
    g.font = `600 ${px}px ${FONT}`;
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (g.measureText(next).width > maxW && line) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3);
    if (lines.length > 3) shown[2] = shown[2].replace(/.{0,2}$/, "…");
    const w = Math.ceil(Math.max(...shown.map((l) => g.measureText(l).width))) + pad * 2;
    const h = Math.ceil(shown.length * lh + pad * 1.4), tip = 16;
    c.width = w + 8;
    c.height = h + tip + 8;
    g.fillStyle = "#FFF8EC";
    g.shadowColor = "rgba(0,0,0,.35)";
    g.shadowBlur = 10;
    g.shadowOffsetY = 3;
    g.beginPath();
    g.roundRect(4, 4, w, h, 22);
    g.moveTo(w / 2 - tip, h + 2);
    g.lineTo(w / 2 + 4, h + tip + 2);
    g.lineTo(w / 2 + tip, h + 2);
    g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = "#2A2320";
    g.font = `600 ${px}px ${FONT}`;
    g.textBaseline = "middle";
    shown.forEach((l, i) => g.fillText(l, 4 + pad, 4 + pad * 0.7 + lh * (i + 0.5)));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, toneMapped: false, transparent: true }));
    const k = 0.0042;
    sp.scale.set(c.width * k, c.height * k, 1);
    sp.center.set(0.5, 0);
    sp.position.y = this.height + 0.62;
    sp.renderOrder = 21;
    sp.layers.set(LABEL_LAYER);
    this.bubble = sp;
    this.bubbleLeft = seconds;
    this.root.add(sp);
  }

  get hasPopcorn() { return !!this.popcorn; }

  /** Hold an object in the right hand (ticket, scanner…); null puts it away. Sizes are in metres. */
  holdItem(obj: THREE.Object3D | null) {
    if (this.item) this.item.parent?.remove(this.item);
    this.item = obj;
    if (obj && this.handR) {
      obj.scale.setScalar(1 / this.scale); // the hand bone lives inside the scaled model
      this.handR.add(obj);
    }
    if (this.prop) this.prop.visible = !obj && !this.staff && !this.seated && !this.popcorn;
  }

  /** Popcorn goes in the left hand; the signature weapon is put away meanwhile. */
  holdPopcorn(on: boolean) {
    if (!on) {
      if (this.popcorn) this.popcorn.parent?.remove(this.popcorn);
      this.popcorn = null;
      if (this.prop && !this.staff && !this.seated) this.prop.visible = true;
      return;
    }
    if (this.popcorn || !this.handL) return;
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xc8372d, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf6e9e4, roughness: 0.5 });
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.2, 14), red));
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.012), white);
      const a = (i / 4) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.096, 0, Math.sin(a) * 0.096);
      st.rotation.y = -a;
      g.add(st);
    }
    const corn = new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: 0xfbe3b0, roughness: 0.8 }));
    corn.scale.y = 0.6;
    corn.position.y = 0.11;
    g.add(corn);
    g.scale.setScalar(1 / this.scale); // the hand bone lives inside the scaled model
    g.position.y = 0.08 / this.scale;
    this.popcorn = g;
    this.handL.add(g);
    if (this.prop) this.prop.visible = false;
  }

  face(dx: number, dz: number) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    const target = Math.atan2(dx, dz);
    let d = target - this.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.root.rotation.y += d * 0.2;
  }

  /**
   * Sit on a seat: `cushion` is the cushion's top-centre in world space, facing -z.
   * The pose is applied first, then the root is shifted so the hips land on the cushion.
   */
  sitAt(cushion: THREE.Vector3, animate = true) {
    this.seated = true;
    this.shadow.visible = false;
    if (this.prop) this.prop.visible = false;
    this.root.rotation.y = Math.PI;
    this.root.position.copy(cushion);
    if (this.kind === "puppet") { // hips on the cushion, legs forward, hands on the lap
      this.root.position.y = cushion.y + 0.04 - PUPPET_HIP;
      this.root.position.z = cushion.z + 0.06;
      if (this.limbs.legL) this.limbs.legL.rotation.x = -1.45;
      if (this.limbs.legR) this.limbs.legR.rotation.x = -1.45;
      if (this.limbs.armL) this.limbs.armL.rotation.x = -0.6;
      if (this.limbs.armR) this.limbs.armR.rotation.x = -0.6;
      return;
    }
    if (this.kind === "static") { this.root.position.y = cushion.y - 0.08; return; }
    // Measure the seated pose alone (Sit_Chair_Idle at t=0), then put the hips on the cushion.
    this.mixer.stopAllAction();
    const idle = this.actions.get("Sit_Chair_Idle");
    this.current = null;
    if (idle) {
      idle.reset().play();
      this.current = idle;
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      const hips = this.model.getObjectByName("hips");
      if (hips) {
        const p = hips.getWorldPosition(new THREE.Vector3());
        this.root.position.x += cushion.x - p.x;
        this.root.position.y += cushion.y + 0.06 - p.y;
        this.root.position.z += cushion.z - p.z;
      }
    }
    if (animate && this.actions.has("Sit_Chair_Down")) {
      this.play("Sit_Chair_Down", 0, true);
      const onDone = (e: { action: THREE.AnimationAction }) => {
        if (e.action !== this.actions.get("Sit_Chair_Down")) return;
        this.mixer.removeEventListener("finished", onDone);
        this.play("Sit_Chair_Idle", 0.3);
      };
      this.mixer.addEventListener("finished", onDone);
    }
  }

  /** Leave the seat: back to the standing idle pose at `at` (feet position). */
  standUp(at: THREE.Vector3) {
    if (!this.seated) return;
    this.seated = false;
    this.shadow.visible = true;
    this.root.position.copy(at);
    this.model.position.set(0, 0, 0);
    for (const l of Object.values(this.limbs)) if (l) l.rotation.set(0, 0, 0);
    if (this.kind === "rig") { this.mixer.stopAllAction(); this.current = null; this.play("Idle", 0); }
    if (this.prop) this.prop.visible = !this.staff && !this.item && !this.popcorn;
  }

  /** speed in m/s; 0 = idle. */
  animate(dt: number, speed: number) {
    if (this.oneShot > 0) this.oneShot -= dt;
    if (this.danceT > 0) {
      this.danceT -= dt;
      const k = Math.max(0, this.danceT);
      this.model.position.y = Math.abs(Math.sin(k * 9)) * 0.12;
      this.model.rotation.y = Math.sin(k * 4.5) * 0.9;
      if (this.danceT <= 0) { this.model.position.y = 0; this.model.rotation.y = 0; }
    }
    if (this.kind !== "rig") this.procedural(dt, speed);
    else if (!this.seated && !(this.oneShot > 0 && speed <= 0.05)) {
      if (speed > 0.05) {
        this.play("Walking_A", 0.2);
        this.current!.timeScale = THREE.MathUtils.clamp(speed / 1.6, 0.6, 2.2);
      } else {
        this.play("Idle", 0.25);
      }
    }
    this.mixer.update(dt);
    if (this.bubble) {
      this.bubbleLeft -= dt;
      (this.bubble.material as THREE.SpriteMaterial).opacity = Math.min(1, this.bubbleLeft / 0.5);
      if (this.bubbleLeft <= 0) { this.root.remove(this.bubble); (this.bubble.material as THREE.SpriteMaterial).map?.dispose(); this.bubble = null; }
    }
  }

  /** Code-driven animation for puppets (limbs) and static fan models (hop + sway). */
  private procedural(dt: number, speed: number) {
    const moving = speed > 0.05 && !this.seated;
    this.phase += dt * (moving ? 2.2 + speed * 1.6 : 1.6);
    const ph = this.phase;
    if (this.oneShot <= 0) this.gesture = "";
    if (this.kind === "static") {
      if (this.danceT > 0 || this.seated) return;
      this.model.position.y = moving ? Math.abs(Math.sin(ph * 1.2)) * 0.09 : Math.max(0, Math.sin(ph)) * 0.01;
      this.model.rotation.z = moving ? Math.sin(ph * 1.2) * 0.12 : this.gesture ? Math.sin(ph * 6) * 0.2 : 0;
      if (this.gesture === "cheer") this.model.position.y = Math.abs(Math.sin(ph * 3)) * 0.15;
      return;
    }
    const L = this.limbs;
    const swing = moving ? Math.sin(ph * 1.4) * 0.7 : 0;
    if (!this.seated) {
      if (L.legL) L.legL.rotation.x = swing;
      if (L.legR) L.legR.rotation.x = -swing;
      if (this.danceT <= 0) this.model.position.y = moving ? Math.abs(Math.cos(ph * 1.4)) * 0.03 : Math.sin(ph) * 0.004;
    }
    let aL = this.seated ? -0.6 : -swing * 0.8 + Math.sin(ph) * 0.03, aR = this.seated ? -0.6 : swing * 0.8 - Math.sin(ph) * 0.03, zR = 0, zL = 0;
    if (this.item || this.popcorn) aR = Math.min(aR, -0.9); // forearm up when holding something
    if (this.gesture === "wave") { aR = -2.7; zR = Math.sin(ph * 9) * 0.35; }
    if (this.gesture === "cheer") { aL = -2.9; aR = -2.9; zL = -0.3 + Math.sin(ph * 8) * 0.15; zR = 0.3 - Math.sin(ph * 8) * 0.15; }
    const k = Math.min(1, dt * 12);
    if (L.armL) { L.armL.rotation.x += (aL - L.armL.rotation.x) * k; L.armL.rotation.z += (zL - L.armL.rotation.z) * k; }
    if (L.armR) { L.armR.rotation.x += (aR - L.armR.rotation.x) * k; L.armR.rotation.z += (zR - L.armR.rotation.z) * k; }
  }

  /** Stand back up (a remote player who left their seat). */
  dispose() {
    this.mixer.stopAllAction();
    this.root.parent?.remove(this.root);
  }

  /** Short cheer (used when the lights go down, photo poses, emotes). */
  cheer() { this.oneOff("Cheer"); }
  /** Wave / interact gesture. */
  wave() { this.oneOff("Interact"); }

  private danceT = 0;
  /** Emotes shared with other players. Dance is procedural until the rig has a dance clip. */
  emote(name: "wave" | "cheer" | "dance" | "clap") {
    if (name === "wave" || name === "clap") this.wave();
    else if (name === "cheer") this.cheer();
    else { this.cheer(); this.danceT = 2.6; this.oneShot = 2.6; }
  }

  private oneOff(clip: string) {
    if (this.kind !== "rig") { if (!this.seated) { this.gesture = clip === "Cheer" ? "cheer" : "wave"; this.oneShot = 1.6; } return; }
    const a = this.actions.get(clip);
    if (this.seated || !a) return;
    this.current = null; // force a restart even if the same clip just played
    this.play(clip, 0.2, true);
    this.oneShot = a.getClip().duration;
  }
}
