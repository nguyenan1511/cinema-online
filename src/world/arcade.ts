// Game Zone attractions: claw machine (gắp gấu), gacha, 4-cut photo booth, quiz screen.
// Each builds its own meshes into a Group and, when played, drives a camera "mode" that the
// World follows instead of the third-person camera.
import * as THREE from "three";
import { CLAW_REACH, CLAW_SLIP, grabChance, PLUSH } from "../../shared/economy";

const FONT = '"Be Vietnam Pro", sans-serif';

export interface CamPose { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }
export interface Mode {
  camera(): CamPose;
  update(dt: number, input: { x: number; z: number }): void;
  /** Primary action (E / big button). */
  action?(): void;
  /** Called when the World leaves this mode. */
  exit?(): void;
  /** Hide the player's own body (it would sit between the camera and the machine). */
  hidePlayer?: boolean;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function neonText(text: string, color: string, w = 1024, h = 256, size = 140) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = "#0b0610";
    g.fillRect(0, 0, w, h);
    g.font = `800 ${size}px ${FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = color;
    g.shadowBlur = 36;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 8);
    g.shadowBlur = 0;
    g.fillStyle = "rgba(255,255,255,.9)";
    g.fillText(text, w / 2, h / 2 + 8);
  });
}
const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.14, metalness: 0, envMapIntensity: 1.2, depthWrite: false });

/** Plush teddy with a soft "sheen" (velvet-like fuzz) material. */
export function makeBear(color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Color(color);
  const fur = new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.95, sheen: 1, sheenRoughness: 0.45, sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.5) });
  const muzzle = new THREE.MeshPhysicalMaterial({ color: base.clone().lerp(new THREE.Color(0xfff4e6), 0.6), roughness: 0.9, sheen: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const ball = (r: number, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    g.add(o);
    return o;
  };
  ball(0.1, fur, 0, 0.1, 0, 1, 1.1, 0.9); // body
  ball(0.078, fur, 0, 0.245, 0.01); // head
  for (const sx of [-1, 1]) {
    ball(0.028, fur, sx * 0.058, 0.31, 0); // ears
    ball(0.032, fur, sx * 0.085, 0.13, 0.03, 0.8, 1.2, 0.8); // arms
    ball(0.038, fur, sx * 0.055, 0.025, 0.05, 0.9, 0.8, 1.2); // feet
    ball(0.009, black, sx * 0.026, 0.262, 0.07); // eyes
  }
  ball(0.032, muzzle, 0, 0.228, 0.065, 1, 0.8, 0.8);
  ball(0.011, black, 0, 0.236, 0.093);
  g.scale.setScalar(scale);
  return g;
}

// ======================= claw machine =======================

type ClawState = "idle" | "aim" | "descend" | "close" | "ascend" | "travel" | "open" | "done";

export class ClawMachine {
  readonly group = new THREE.Group();
  private claw = new THREE.Group();
  private prongs: THREE.Object3D[] = [];
  private cable: THREE.Mesh;
  private carriage: THREE.Mesh;
  private plush: { obj: THREE.Group; id: string; vy: number; falling: boolean }[] = [];
  private held: (typeof this.plush)[number] | null = null;
  private state: ClawState = "idle";
  private t = 0;
  private timeLeft = 0;
  private cx = -0.36;
  private cz = 0.36;
  private cy = TOP;
  private fx = 0; // claw position when the carry to the chute starts
  private fz = 0;
  private onDone: ((prize: string | null, note: string) => void) | null = null;
  private note = "";

  constructor(x: number, z: number, private color: number, private rand: () => number = Math.random) {
    this.group.position.set(x, 0, z);
    const cab = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.2, metalness: 0.95 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      this.group.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(1.2, 0.95, 1.2), cab, 0, 0.475, 0);
    add(new THREE.BoxGeometry(1.24, 0.04, 1.24), chrome, 0, 0.95, 0);
    // glass box with chrome posts
    const glass = glassMat();
    for (const [w, d, px, pz] of [[1.16, 0.02, 0, 0.58], [1.16, 0.02, 0, -0.58], [0.02, 1.16, 0.58, 0], [0.02, 1.16, -0.58, 0]]) {
      const pane = add(new THREE.BoxGeometry(w, 1.3, d), glass, px, 1.6, pz);
      pane.renderOrder = 4;
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.04, 1.3, 0.04), chrome, sx * 0.59, 1.6, sz * 0.59);
    // header with neon title
    add(new THREE.BoxGeometry(1.24, 0.42, 1.24), cab, 0, 2.46, 0);
    add(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: neonText("GẮP GẤU", "#fff3a8"), toneMapped: false }), 0, 2.46, 0.625);
    // prize floor + chute (front-left)
    add(new THREE.BoxGeometry(1.14, 0.02, 1.14), new THREE.MeshStandardMaterial({ color: 0xf6d6e4, roughness: 0.8 }), 0, 0.97, 0);
    const chute = add(new THREE.BoxGeometry(0.34, 0.25, 0.34), new THREE.MeshStandardMaterial({ color: 0x111111 }), CHUTE.x, 1.0, CHUTE.z);
    chute.scale.y = 0.2;
    add(new THREE.BoxGeometry(0.36, 0.2, 0.02), glass, CHUTE.x, 1.08, CHUTE.z - 0.18).renderOrder = 4;
    add(new THREE.BoxGeometry(0.02, 0.2, 0.36), glass, CHUTE.x + 0.18, 1.08, CHUTE.z).renderOrder = 4;
    // prize door + control panel on the cabinet front
    add(new THREE.BoxGeometry(0.3, 0.26, 0.02), new THREE.MeshStandardMaterial({ color: 0x222222 }), CHUTE.x, 0.32, 0.61);
    add(new THREE.BoxGeometry(1.0, 0.14, 0.22), cab, 0, 0.9, 0.68);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), chrome, -0.2, 1.0, 0.7);
    add(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xe0352b }), -0.2, 1.06, 0.7);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa200, emissiveIntensity: 0.6 }), 0.2, 0.985, 0.7);
    // gantry, carriage, cable, claw
    add(new THREE.BoxGeometry(1.1, 0.03, 0.05), chrome, 0, 2.22, 0);
    this.carriage = add(new THREE.BoxGeometry(0.12, 0.06, 0.12), chrome, this.cx, 2.2, this.cz);
    this.cable = add(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }), 0, 0, 0);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 14), chrome);
    this.claw.add(hub);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 3) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.02), chrome);
      arm.position.set(0, -0.06, 0.04);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), chrome);
      tip.position.set(0, -0.12, 0.04);
      tip.rotation.x = 0.7;
      const hinge = new THREE.Group();
      hinge.position.set(0, -0.03, 0.03);
      hinge.add(arm, tip);
      pivot.add(hinge);
      this.prongs.push(hinge);
      this.claw.add(pivot);
    }
    this.group.add(this.claw);
    for (let i = 0; i < 10; i++) this.stock();
    this.setProngs(0.55);
    this.placeClaw();
  }

  /** Front of the machine, for the interaction prompt. */
  get front() { return new THREE.Vector3(this.group.position.x, 0, this.group.position.z + 1.05); }
  get busy() { return this.state !== "idle"; }

  private stock() {
    const def = PLUSH[Math.floor(this.rand() * PLUSH.length)];
    const bear = makeBear(def.color, 0.85 + this.rand() * 0.3);
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = -0.42 + this.rand() * 0.84;
      z = -0.42 + this.rand() * 0.84;
      if (Math.hypot(x - CHUTE.x, z - CHUTE.z) > 0.3 && this.plush.every((p) => Math.hypot(p.obj.position.x - x, p.obj.position.z - z) > 0.15)) break;
    }
    bear.position.set(x, 0.98, z);
    bear.rotation.set((this.rand() - 0.5) * 0.5, this.rand() * Math.PI * 2, (this.rand() - 0.5) * 0.5);
    this.group.add(bear);
    this.plush.push({ obj: bear, id: def.id, vy: 0, falling: false });
  }

  private setProngs(open: number) { for (const h of this.prongs) h.rotation.x = -open; }
  private placeClaw() {
    this.carriage.position.set(this.cx, 2.2, this.cz);
    this.claw.position.set(this.cx, this.cy, this.cz);
    const len = 2.18 - this.cy;
    this.cable.position.set(this.cx, this.cy + len / 2, this.cz);
    this.cable.scale.y = Math.max(0.01, len);
  }

  start(onDone: (prize: string | null, note: string) => void): Mode {
    this.onDone = onDone;
    this.state = "aim";
    this.timeLeft = 20;
    this.note = "";
    const p = this.group.position;
    return {
      camera: () => ({ pos: new THREE.Vector3(p.x, 1.95, p.z + 1.7), look: new THREE.Vector3(p.x, 1.45, p.z) }),
      update: (dt, input) => this.update(dt, input),
      action: () => this.drop(),
      hidePlayer: true,
    };
  }

  get secondsLeft() { return this.state === "aim" ? Math.ceil(this.timeLeft) : 0; }
  get phase() { return this.state; }

  drop() { if (this.state === "aim") { this.state = "descend"; this.t = 0; } }

  update(dt: number, input: { x: number; z: number }) {
    this.t += dt;
    const ease = (k: number) => k * k * (3 - 2 * k);
    switch (this.state) {
      case "aim": {
        this.timeLeft -= dt;
        this.cx = THREE.MathUtils.clamp(this.cx + input.x * 0.45 * dt, -0.42, 0.42);
        this.cz = THREE.MathUtils.clamp(this.cz + input.z * 0.45 * dt, -0.42, 0.42);
        if (this.timeLeft <= 0) this.drop();
        break;
      }
      case "descend": {
        const k = Math.min(1, this.t / 1.1);
        this.cy = TOP - (TOP - LOW) * ease(k);
        this.setProngs(0.55 + 0.25 * k);
        if (k >= 1) { this.state = "close"; this.t = 0; }
        break;
      }
      case "close": {
        const k = Math.min(1, this.t / 0.45);
        this.setProngs(0.8 - 0.75 * k);
        if (k >= 1) {
          let best: (typeof this.plush)[number] | null = null, bd = Infinity;
          for (const p of this.plush) {
            if (p.falling) continue;
            const d = Math.hypot(p.obj.position.x - this.cx, p.obj.position.z - this.cz);
            if (d < bd) { bd = d; best = p; }
          }
          if (best && bd <= CLAW_REACH && this.rand() < grabChance(bd)) this.held = best;
          else this.note = best && bd <= CLAW_REACH ? "Móc trúng mà kẹp không chặt!" : "Trượt rồi, nhắm lại nhé";
          this.state = "ascend";
          this.t = 0;
        }
        break;
      }
      case "ascend": {
        const k = Math.min(1, this.t / 1.1);
        this.cy = LOW + (TOP - LOW) * ease(k);
        if (this.held && k > 0.5 && !this.note && this.rand() < CLAW_SLIP * dt * 4) {
          this.held.falling = true; // slipped on the way up
          this.held = null;
          this.note = "Ối, tuột mất rồi!";
        }
        if (k >= 1) { this.state = this.held ? "travel" : "open"; this.t = 0; this.fx = this.cx; this.fz = this.cz; }
        break;
      }
      case "travel": {
        const k = Math.min(1, this.t / 1.2);
        this.cx = this.fx + (CHUTE.x - this.fx) * ease(k);
        this.cz = this.fz + (CHUTE.z - this.fz) * ease(k);
        if (k >= 1) { this.state = "open"; this.t = 0; }
        break;
      }
      case "open": {
        const k = Math.min(1, this.t / 0.4);
        this.setProngs(0.05 + 0.5 * k);
        if (k >= 1) {
          let prize: string | null = null;
          if (this.held) {
            prize = this.held.id;
            this.held.falling = true;
            this.held = null;
            this.note = "Gắp được rồi!";
          }
          this.state = "done";
          this.t = 0;
          const cb = this.onDone;
          const note = this.note;
          setTimeout(() => cb?.(prize, note), 900);
        }
        break;
      }
      case "done": {
        if (this.t > 1.2) {
          this.state = "idle";
          this.cx = -0.36; this.cz = 0.36; this.cy = TOP;
          this.onDone = null;
        }
        break;
      }
    }
    if (this.held) this.held.obj.position.set(this.cx, this.cy - 0.24, this.cz);
    for (const p of [...this.plush]) {
      if (!p.falling) continue;
      p.vy -= 9.8 * dt;
      p.obj.position.y += p.vy * dt;
      const overChute = Math.hypot(p.obj.position.x - CHUTE.x, p.obj.position.z - CHUTE.z) < 0.17;
      const floorY = overChute ? 0.2 : 0.98;
      if (p.obj.position.y <= floorY) {
        p.obj.position.y = floorY;
        p.vy = 0;
        p.falling = false;
        if (overChute) { // won: leaves the machine, restock
          this.group.remove(p.obj);
          this.plush.splice(this.plush.indexOf(p), 1);
          this.stock();
        }
      }
    }
    this.placeClaw();
  }
}
const TOP = 2.08;
const LOW = 1.2;
const CHUTE = { x: -0.38, z: 0.38 };

// ======================= gacha =======================

export class GachaMachine {
  readonly group = new THREE.Group();
  private knob: THREE.Mesh;
  private capsule: THREE.Mesh;
  private spinT = -1;
  private onDone: (() => void) | null = null;

  constructor(x: number, z: number) {
    this.group.position.set(x, 0, z);
    const red = new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.3, metalness: 0.2 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, roughness: 0.2, metalness: 0.9 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      this.group.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(0.7, 1.0, 0.6), red, 0, 0.5, 0);
    add(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 32), chrome, 0, 1.04, 0);
    const dome = add(new THREE.SphereGeometry(0.36, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2 + 0.3), glassMat(), 0, 1.08, 0);
    dome.renderOrder = 4;
    const colors = [0xff5d8f, 0x4fc3f7, 0xffd23f, 0x7ee081, 0xb388ff, 0xff8a65];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.26, y = 1.12 + Math.random() * 0.22;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.25 }));
      cap.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      this.group.add(cap);
    }
    add(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshBasicMaterial({ map: neonText("GACHA", "#ffd23f", 512, 160, 110), toneMapped: false }), 0, 0.86, 0.305);
    this.knob = add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20), chrome, 0, 0.6, 0.32);
    this.knob.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.2, 0.04, 0.12), chrome, 0, 0.27, 0.33);
    this.capsule = add(new THREE.SphereGeometry(0.06, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.2 }), 0, 0.33, 0.36);
    this.capsule.visible = false;
  }
  get front() { return new THREE.Vector3(this.group.position.x, 0, this.group.position.z + 1.0); }

  /** Turn the knob; `onDone` fires when the capsule lands in the tray. */
  play(color: number, onDone: () => void): Mode {
    this.spinT = 0;
    this.onDone = onDone;
    (this.capsule.material as THREE.MeshStandardMaterial).color.setHex(color);
    this.capsule.visible = false;
    const p = this.group.position;
    return {
      camera: () => ({ pos: new THREE.Vector3(p.x + 0.2, 1.15, p.z + 1.35), look: new THREE.Vector3(p.x, 0.7, p.z) }),
      update: (dt) => this.update(dt),
      hidePlayer: true,
    };
  }
  update(dt: number) {
    if (this.spinT < 0) return;
    this.spinT += dt;
    this.knob.rotation.y = Math.min(1, this.spinT / 1.2) * Math.PI * 2;
    if (this.spinT > 1.2) {
      this.capsule.visible = true;
      const k = Math.min(1, (this.spinT - 1.2) / 0.35);
      this.capsule.position.set(0, 0.55 - 0.22 * k, 0.36 + 0.02 * k);
    }
    if (this.spinT > 1.9) { this.spinT = -1; const cb = this.onDone; this.onDone = null; cb?.(); }
  }
  reset() { this.capsule.visible = false; }
}

// ======================= photo booth =======================

/** Booth opening faces +x. The preview camera on the back wall is also the capture camera. */
export class PhotoBooth {
  readonly group = new THREE.Group();
  readonly stand: THREE.Vector3;
  private backdrop: THREE.Mesh;

  constructor(x: number, z: number) {
    this.group.position.set(x, 0, z);
    const shell = new THREE.MeshStandardMaterial({ color: 0xcfc4b8, roughness: 0.55 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number, ry = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(px, py, pz);
      o.rotation.y = ry;
      this.group.add(o);
      return o;
    };
    add(new THREE.BoxGeometry(0.1, 2.4, 2.2), shell, -1.1, 1.2, 0); // back (camera wall)
    add(new THREE.BoxGeometry(2.2, 2.4, 0.1), shell, 0, 1.2, -1.1);
    add(new THREE.BoxGeometry(2.2, 2.4, 0.1), shell, 0, 1.2, 1.1);
    add(new THREE.BoxGeometry(2.3, 0.12, 2.3), shell, 0, 2.46, 0);
    add(new THREE.PlaneGeometry(2.0, 0.4), new THREE.MeshBasicMaterial({ map: neonText("PHOTO 4 KIỂU", "#ff7eb6", 1024, 200, 110), toneMapped: false }), 1.16, 2.2, 0, Math.PI / 2);
    // ring light + camera on the back wall
    const ring = add(new THREE.TorusGeometry(0.22, 0.025, 10, 40), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 }), -1.03, 1.55, 0, Math.PI / 2);
    ring.rotation.y = Math.PI / 2;
    add(new THREE.BoxGeometry(0.06, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }), -1.03, 1.55, 0);
    // curtain half-open on the entrance side
    const curtain = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1 });
    add(new THREE.BoxGeometry(0.04, 2.1, 0.7), curtain, 1.08, 1.25, 0.72);
    // Pink curtain that closes over the entrance while shooting: it is the photo backdrop.
    const drape = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 256; i++) { const v = 0.82 + 0.18 * Math.sin(i / 6) ** 2; g.fillStyle = `rgb(${Math.round(255 * v)},${Math.round(170 * v)},${Math.round(200 * v)})`; g.fillRect(i, 0, 1, 256); }
    });
    this.backdrop = add(new THREE.PlaneGeometry(2.1, 2.3), new THREE.MeshStandardMaterial({ map: drape, roughness: 1 }), 1.12, 1.17, 0, -Math.PI / 2);
    this.backdrop.visible = false;
    this.stand = new THREE.Vector3(x + 0.85, 0, z);
  }
  get front() { return new THREE.Vector3(this.group.position.x + 1.7, 0, this.group.position.z); }

  /** Camera on the back wall looking at whoever stands in the booth. */
  mode(): Mode {
    const p = this.group.position;
    this.backdrop.visible = true;
    return {
      camera: () => ({ pos: new THREE.Vector3(p.x - 0.98, 1.4, p.z), look: new THREE.Vector3(p.x + 0.85, 0.95, p.z), fov: 48 }),
      update: () => {},
      exit: () => { this.backdrop.visible = false; },
    };
  }
}

// ======================= quiz screen =======================

export class QuizScreen {
  readonly group = new THREE.Group();
  private tex: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;

  constructor(x: number, z: number, ry: number) {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = ry;
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 576;
    this.g = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.9, 2.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x0d0b0c, roughness: 0.3 }));
    frame.position.y = 2.2;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.08), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    screen.position.set(0, 2.2, 0.065);
    this.group.add(frame, screen);
    this.draw({ title: "ĐỐ VUI ĐIỆN ẢNH", lines: ["Lại gần và bấm \"Chơi đố vui\"", "Trả lời đúng được xu thưởng"] });
  }

  draw(v: { title: string; lines: string[]; timer?: number; highlight?: number }) {
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, 1024, 576);
    grad.addColorStop(0, "#1b0f3a");
    grad.addColorStop(1, "#3a0f2c");
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 576);
    g.fillStyle = "#ffd23f";
    g.font = `800 34px ${FONT}`;
    g.textBaseline = "top";
    g.fillText("ĐỐ VUI ĐIỆN ẢNH", 40, 32);
    if (v.timer !== undefined) {
      g.textAlign = "right";
      g.fillText(`${v.timer}s`, 984, 32);
      g.textAlign = "left";
    }
    g.fillStyle = "#fff";
    g.font = `800 44px ${FONT}`;
    wrap(g, v.title, 40, 100, 944, 54).forEach((l, i) => g.fillText(l, 40, 100 + i * 54));
    g.font = `600 34px ${FONT}`;
    v.lines.forEach((l, i) => {
      const y = 280 + i * 64;
      if (v.highlight === i) { g.fillStyle = "rgba(127,255,168,.25)"; g.fillRect(30, y - 10, 964, 56); }
      g.fillStyle = v.highlight === i ? "#7dffa8" : "#f3e9ff";
      g.fillText(l, 40, y);
    });
    this.tex.needsUpdate = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, _x: number, _y: number, maxW: number, _lh: number) {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}
