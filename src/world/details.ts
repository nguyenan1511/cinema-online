// Set dressing: the small things that make the cinema read as a real place — POS screens,
// ticket printer, backlit menus, queue number display, popcorn machine with popping kernels,
// soda fountain, cup stacks, turnstiles with status LEDs, QR scanner podium, film standees,
// arcade cabinets with live attract screens, prize shelves and lounge furniture.
// Every builder returns a Group in local space (front faces +z unless noted).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { makeBear } from "./arcade";

const FONT = '"Be Vietnam Pro", sans-serif';

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const flat = (map: THREE.Texture) => new THREE.MeshBasicMaterial({ map, toneMapped: false });
const std = (color: number, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const CHROME = std(0xd8d8d8, { metalness: 0.95, roughness: 0.22 });
const BLACK = std(0x0e0d0f, { roughness: 0.35, metalness: 0.2 });
const add = (g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, rx = 0, ry = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, 0);
  g.add(o);
  return o;
};

// ---------------- ticket counter ----------------

/** Point-of-sale monitor on a stand, screen showing a seat map + total. */
export function posMonitor(accent = "#f2c14e") {
  const g = new THREE.Group();
  const screen = canvasTex(256, 160, (c) => {
    c.fillStyle = "#101828"; c.fillRect(0, 0, 256, 160);
    c.fillStyle = accent; c.fillRect(0, 0, 256, 22);
    c.fillStyle = "#101828"; c.font = `800 14px ${FONT}`; c.fillText("RẠP ONLINE · POS", 8, 16);
    for (let r = 0; r < 6; r++) for (let s = 0; s < 12; s++) {
      c.fillStyle = (r * 7 + s * 3) % 5 === 0 ? "#555d6e" : "#b8323c";
      c.fillRect(14 + s * 14 + (s > 5 ? 8 : 0), 34 + r * 14, 10, 9);
    }
    c.fillStyle = "#e8eef8"; c.font = `700 13px ${FONT}`; c.fillText("Tổng: 0đ", 14, 146);
    c.fillStyle = "#3ccf7a"; c.fillRect(170, 132, 74, 20);
    c.fillStyle = "#08131c"; c.fillText("IN VÉ", 186, 147);
  });
  add(g, new THREE.CylinderGeometry(0.05, 0.08, 0.02, 16), BLACK, 0, 0.01, 0);
  add(g, new THREE.BoxGeometry(0.03, 0.22, 0.03), BLACK, 0, 0.12, -0.02);
  const body = add(g, new THREE.BoxGeometry(0.42, 0.28, 0.03), BLACK, 0, 0.32, 0, -0.18);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.25), flat(screen));
  s.position.z = 0.016;
  body.add(s);
  return g;
}

/** Thermal ticket printer with a ticket half out. */
export function ticketPrinter() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.22, 0.12, 0.26, 3, 0.02), std(0x2b2d33, { roughness: 0.5 }), 0, 0.06, 0);
  add(g, new THREE.BoxGeometry(0.16, 0.004, 0.02), BLACK, 0, 0.12, 0.1);
  const tkt = canvasTex(128, 64, (c) => { c.fillStyle = "#f4c9c4"; c.fillRect(0, 0, 128, 64); c.fillStyle = "#6e1f2a"; c.font = `800 14px ${FONT}`; c.fillText("RẠP ONLINE", 10, 22); c.fillRect(10, 34, 70, 3); c.fillRect(10, 44, 50, 3); });
  add(g, new THREE.PlaneGeometry(0.14, 0.08), new THREE.MeshStandardMaterial({ map: tkt, side: THREE.DoubleSide, roughness: 0.8 }), 0, 0.16, 0.11, -0.4);
  const led = add(g, new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3ccf7a, toneMapped: false }), 0.08, 0.121, 0.08);
  led.scale.y = 0.4;
  return g;
}

/** Backlit menu / price board (lightbox). */
export function menuBoard(title: string, rows: [string, string][], w: number, h: number, accent = "#f2c14e") {
  const g = new THREE.Group();
  const tex = canvasTex(1024, Math.round((1024 * h) / w), (c) => {
    const H = c.canvas.height;
    const grad = c.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#1b0b10"); grad.addColorStop(1, "#0d0507");
    c.fillStyle = grad; c.fillRect(0, 0, 1024, H);
    c.fillStyle = accent; c.font = `800 70px ${FONT}`; c.fillText(title, 48, 96);
    c.fillRect(48, 120, 928, 4);
    const lh = Math.min(86, (H - 170) / Math.max(1, rows.length));
    rows.forEach(([name, price], i) => {
      const y = 190 + i * lh;
      c.fillStyle = "#f6e9e4"; c.font = `700 ${Math.round(lh * 0.48)}px ${FONT}`; c.textAlign = "left"; c.fillText(name, 48, y);
      c.fillStyle = accent; c.textAlign = "right"; c.fillText(price, 976, y);
      c.fillStyle = "rgba(246,233,228,.12)"; c.fillRect(48, y + lh * 0.28, 928, 2);
    });
  });
  add(g, new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.1), BLACK, 0, 0, 0);
  add(g, new THREE.PlaneGeometry(w, h), flat(tex), 0, 0, 0.051);
  return g;
}

/** "Now serving" number display; call set(n) as the queue advances. */
export function queueDisplay() {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 512; c.height = 192;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const set = (n: number) => {
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = "#ff5a3c"; ctx.font = `700 34px ${FONT}`; ctx.fillText("ĐANG PHỤC VỤ SỐ", 24, 52);
    ctx.font = `800 110px ui-monospace, monospace`; ctx.shadowColor = "#ff5a3c"; ctx.shadowBlur = 18;
    ctx.fillText(String(n).padStart(3, "0"), 24, 168);
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  set(21);
  add(g, new THREE.BoxGeometry(1.1, 0.44, 0.08), BLACK, 0, 0, 0);
  add(g, new THREE.PlaneGeometry(1.02, 0.38), flat(tex), 0, 0, 0.041);
  return { group: g, set };
}

/** Floor decal (queue line / footprints / arrow). Lies flat; text reads from +z. */
export function floorDecal(text: string, w: number, color = "#f2c14e") {
  const tex = canvasTex(512, 128, (c) => {
    c.strokeStyle = color; c.lineWidth = 10; c.strokeRect(8, 8, 496, 112);
    c.fillStyle = color; c.font = `800 54px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, 256, 66);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

// ---------------- concession ----------------

export function popcornBucket(scale = 1) {
  const g = new THREE.Group();
  const stripes = canvasTex(128, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? "#f6efe6" : "#c8372d"; c.fillRect(i * 16, 0, 16, 64); } });
  add(g, new THREE.CylinderGeometry(0.11, 0.08, 0.22, 16, 1, true), new THREE.MeshStandardMaterial({ map: stripes, side: THREE.DoubleSide, roughness: 0.6 }), 0, 0.11, 0);
  const corn = add(g, new THREE.IcosahedronGeometry(0.11, 1), std(0xfbe3a8, { roughness: 0.9, flatShading: true }), 0, 0.23, 0);
  corn.scale.y = 0.55;
  g.scale.setScalar(scale);
  return g;
}

/** Popcorn machine: red cart, glass case, kettle, a heap of popcorn and kernels that pop. */
export function popcornMachine() {
  const g = new THREE.Group();
  const red = std(0xc8372d, { roughness: 0.35, metalness: 0.2 });
  add(g, new THREE.BoxGeometry(0.8, 0.35, 0.6), red, 0, 0.175, 0);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
  add(g, new THREE.BoxGeometry(0.8, 0.7, 0.6), glass, 0, 0.7, 0).renderOrder = 4;
  for (const [x, z] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) add(g, new THREE.BoxGeometry(0.03, 0.72, 0.03), red, x, 0.7, z);
  add(g, new THREE.BoxGeometry(0.84, 0.14, 0.64), red, 0, 1.12, 0);
  const sign = canvasTex(512, 96, (c) => { c.fillStyle = "#f2c14e"; c.fillRect(0, 0, 512, 96); c.fillStyle = "#c8372d"; c.font = `800 64px ${FONT}`; c.textAlign = "center"; c.fillText("POPCORN", 256, 72); });
  add(g, new THREE.PlaneGeometry(0.78, 0.13), flat(sign), 0, 1.12, 0.321);
  add(g, new THREE.CylinderGeometry(0.09, 0.07, 0.1, 16), CHROME, 0.05, 0.98, 0);
  add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), CHROME, 0.05, 1.07, 0);
  const pile = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.022, 0), std(0xfde7b0, { roughness: 0.95, flatShading: true }), 140);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 140; i++) {
    const r = Math.sqrt(Math.random()) * 0.34, a = Math.random() * Math.PI * 2;
    const h = 0.38 + (0.34 - r) * 0.35 * Math.random();
    m.makeRotationFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0)).setPosition(Math.cos(a) * r, h, Math.sin(a) * r * 0.75);
    pile.setMatrixAt(i, m);
  }
  g.add(pile);
  const warm = add(g, new THREE.PlaneGeometry(0.7, 0.04), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }), 0, 1.04, 0.29);
  warm.rotation.x = Math.PI / 2;
  // kernels popping out of the kettle
  const pops = Array.from({ length: 10 }, () => {
    const k = add(g, new THREE.IcosahedronGeometry(0.02, 0), std(0xfff2cc, { flatShading: true }), 0, -1, 0);
    return { k, vy: 0, vx: 0, vz: 0, t: Math.random() * 2 };
  });
  const update = (dt: number) => {
    for (const p of pops) {
      p.t -= dt;
      if (p.t <= 0 && p.k.position.y < 0) { p.k.position.set(0.05, 0.95, 0); p.vy = 1.2 + Math.random(); p.vx = (Math.random() - 0.5) * 0.8; p.vz = (Math.random() - 0.5) * 0.6; }
      if (p.k.position.y >= 0) {
        p.vy -= 6 * dt;
        p.k.position.x = THREE.MathUtils.clamp(p.k.position.x + p.vx * dt, -0.36, 0.36);
        p.k.position.z = THREE.MathUtils.clamp(p.k.position.z + p.vz * dt, -0.26, 0.26);
        p.k.position.y += p.vy * dt;
        p.k.rotation.x += dt * 8;
        if (p.k.position.y < 0.42 && p.vy < 0) { p.k.position.y = -1; p.t = 0.3 + Math.random() * 1.6; }
      }
    }
  };
  return { group: g, update };
}

/** Soda fountain with four branded valves, drip tray and an ice lever. */
export function sodaFountain() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.9, 0.7, 0.5, 3, 0.04), std(0x1d1f24, { roughness: 0.3, metalness: 0.3 }), 0, 0.35, 0);
  const brands = ["#e0352b", "#2f7de1", "#f2a33a", "#3ccf7a"];
  brands.forEach((col, i) => {
    const x = -0.3 + i * 0.2;
    const lbl = canvasTex(64, 96, (c) => { c.fillStyle = col; c.fillRect(0, 0, 64, 96); c.fillStyle = "#fff"; c.beginPath(); c.arc(32, 40, 18, 0, Math.PI * 2); c.fill(); c.fillStyle = col; c.font = `800 22px ${FONT}`; c.textAlign = "center"; c.fillText(["C", "P", "O", "L"][i], 32, 48); });
    add(g, new THREE.PlaneGeometry(0.15, 0.22), flat(lbl), x, 0.5, 0.252);
    add(g, new THREE.CylinderGeometry(0.018, 0.012, 0.06, 10), CHROME, x, 0.34, 0.24);
  });
  add(g, new THREE.BoxGeometry(0.86, 0.03, 0.18), CHROME, 0, 0.12, 0.3);
  return g;
}

export function cupStack(n = 8, color = 0xc8372d) {
  const g = new THREE.Group();
  const m = std(color, { roughness: 0.5 });
  for (let i = 0; i < n; i++) add(g, new THREE.CylinderGeometry(0.045, 0.035, 0.12, 14, 1, true), m, 0, 0.06 + i * 0.022, 0);
  return g;
}

// ---------------- ticket gate ----------------

/** Waist-high turnstile pillar with a status LED on top; setGreen(true) after a valid ticket. */
export function turnstile() {
  const g = new THREE.Group();
  add(g, new RoundedBoxGeometry(0.28, 1.0, 0.7, 3, 0.04), std(0xb8bcc4, { metalness: 0.85, roughness: 0.25 }), 0, 0.5, 0);
  add(g, new THREE.BoxGeometry(0.24, 0.02, 0.64), BLACK, 0, 1.01, 0);
  const led = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
  add(g, new THREE.BoxGeometry(0.2, 0.025, 0.12), led, 0, 1.03, 0.2);
  const reader = canvasTex(64, 64, (c) => { c.fillStyle = "#111"; c.fillRect(0, 0, 64, 64); c.strokeStyle = "#7dffa8"; c.lineWidth = 4; c.strokeRect(10, 10, 44, 44); c.fillStyle = "#7dffa8"; c.fillRect(14, 30, 36, 3); });
  add(g, new THREE.PlaneGeometry(0.16, 0.16), flat(reader), 0, 1.022, -0.12, -Math.PI / 2);
  return { group: g, setGreen: (on: boolean) => led.color.setHex(on ? 0x34c759 : 0xff3b30) };
}

/** QR scanner podium with an angled screen; flash() turns it green for a moment. */
export function scannerPodium() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.06, 0.16, 1.0, 16), std(0x2a2320, { metalness: 0.4, roughness: 0.4 }), 0, 0.5, 0);
  const c = document.createElement("canvas");
  c.width = 256; c.height = 192;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (ok: boolean) => {
    ctx.fillStyle = ok ? "#0f3d22" : "#0d1117"; ctx.fillRect(0, 0, 256, 192);
    ctx.strokeStyle = ok ? "#7dffa8" : "#f2c14e"; ctx.lineWidth = 6; ctx.strokeRect(78, 34, 100, 100);
    ctx.fillStyle = ok ? "#7dffa8" : "#f6e9e4"; ctx.font = `800 22px ${FONT}`; ctx.textAlign = "center";
    ctx.fillText(ok ? "HỢP LỆ ✓" : "QUÉT VÉ TẠI ĐÂY", 128, 170);
    if (!ok) { ctx.fillStyle = "#f2c14e"; ctx.fillRect(84, 82, 88, 3); }
    tex.needsUpdate = true;
  };
  draw(false);
  const head = add(g, new RoundedBoxGeometry(0.34, 0.06, 0.28, 2, 0.02), BLACK, 0, 1.03, 0, 0.35);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), flat(tex));
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.031;
  head.add(s);
  let t = 0;
  return { group: g, flash: () => { draw(true); clearTimeout(t); t = window.setTimeout(() => draw(false), 2500); } };
}

// ---------------- lobby ----------------

/** Life-size film standee: poster on a cut board with a base and a title strip. */
export function standee(poster: THREE.Texture, title: string, accent = "#f2c14e") {
  const g = new THREE.Group();
  const board = new THREE.MeshStandardMaterial({ map: poster, roughness: 0.55 });
  add(g, new THREE.BoxGeometry(1.2, 1.8, 0.04), [std(0x111111), std(0x111111), std(0x111111), std(0x111111), board, std(0x222222)], 0, 1.25, 0);
  const strip = canvasTex(512, 96, (c) => { c.fillStyle = "#0b0507"; c.fillRect(0, 0, 512, 96); c.fillStyle = accent; c.font = `800 40px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(title.length > 22 ? title.slice(0, 21) + "…" : title, 256, 50); });
  add(g, new THREE.BoxGeometry(1.3, 0.3, 0.3), BLACK, 0, 0.15, 0);
  add(g, new THREE.PlaneGeometry(1.24, 0.24), flat(strip), 0, 0.15, 0.151);
  add(g, new THREE.BoxGeometry(0.06, 0.4, 0.5), BLACK, 0, 0.5, -0.2);
  return g;
}

// ---------------- game zone + karaoke ----------------

/** Upright arcade cabinet with an animated attract-mode screen; call update(t). */
export function arcadeCabinet(color: number, title: string) {
  const g = new THREE.Group();
  const body = std(color, { roughness: 0.4 });
  add(g, new THREE.BoxGeometry(0.75, 1.0, 0.7), body, 0, 0.5, 0);
  add(g, new THREE.BoxGeometry(0.75, 0.9, 0.45), body, 0, 1.45, -0.12);
  add(g, new THREE.BoxGeometry(0.78, 0.08, 0.36), BLACK, 0, 1.02, 0.18, -0.2);
  const marquee = canvasTex(512, 128, (c) => { c.fillStyle = "#0b0610"; c.fillRect(0, 0, 512, 128); c.font = `800 64px ${FONT}`; c.textAlign = "center"; c.shadowColor = "#ff4fd8"; c.shadowBlur = 24; c.fillStyle = "#ffe14f"; c.fillText(title, 256, 86); });
  add(g, new THREE.PlaneGeometry(0.7, 0.17), flat(marquee), 0, 1.84, 0.105);
  const c = document.createElement("canvas");
  c.width = 256; c.height = 192;
  const ctx = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  add(g, new THREE.PlaneGeometry(0.6, 0.45), flat(tex), 0, 1.45, 0.106, -0.12);
  for (const [x, col] of [[-0.18, 0xe0352b], [0.05, 0xffd23f], [0.17, 0x2f7de1]] as [number, number][]) add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), std(col, { emissive: col, emissiveIntensity: 0.4 }), x, 1.07, 0.2);
  add(g, new THREE.SphereGeometry(0.035, 10, 8), std(0xe0352b), -0.18 - 0.12, 1.12, 0.2);
  let last = -1;
  const update = (t: number) => {
    const f = Math.floor(t * 12);
    if (f === last) return;
    last = f;
    ctx.fillStyle = "#05030a"; ctx.fillRect(0, 0, 256, 192);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = "#ffffff"; ctx.fillRect((i * 53 + f * 3) % 256, (i * 37) % 192, 2, 2); }
    const x = 128 + Math.sin(t * 2) * 80, y = 140;
    ctx.fillStyle = "#4fd8ff"; ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 12, y + 10); ctx.lineTo(x + 12, y + 10); ctx.fill();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = ["#ff4fd8", "#ffd23f", "#7dffa8"][i % 3]; ctx.fillRect(30 + i * 36, 30 + Math.sin(t * 3 + i) * 10, 18, 12); }
    if (f % 24 < 12) { ctx.fillStyle = "#ffe14f"; ctx.font = `800 18px ${FONT}`; ctx.textAlign = "center"; ctx.fillText("INSERT COIN", 128, 104); }
    tex.needsUpdate = true;
  };
  return { group: g, update };
}

/** Prize counter: glass case with plush bears on three shelves and price tags. */
export function prizeShelf(colors: number[]) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(2.4, 0.9, 0.6), std(0x2a1840, { roughness: 0.5 }), 0, 0.45, 0);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false });
  add(g, new THREE.BoxGeometry(2.4, 1.3, 0.04), glass, 0, 1.55, 0.28).renderOrder = 4;
  for (let s = 0; s < 3; s++) {
    add(g, new THREE.BoxGeometry(2.36, 0.03, 0.5), std(0xf6efe6, { roughness: 0.3 }), 0, 0.95 + s * 0.42, 0);
    for (let i = 0; i < 6; i++) {
      const b = makeBear(colors[(i + s * 2) % colors.length], 0.9);
      b.position.set(-1.0 + i * 0.4, 0.97 + s * 0.42, -0.02);
      b.rotation.y = (Math.random() - 0.5) * 0.4;
      g.add(b);
    }
  }
  const sign = canvasTex(512, 96, (c) => { c.fillStyle = "#0b0610"; c.fillRect(0, 0, 512, 96); c.font = `800 48px ${FONT}`; c.textAlign = "center"; c.shadowColor = "#ff4fd8"; c.shadowBlur = 20; c.fillStyle = "#ffd6f5"; c.fillText("ĐỔI QUÀ · PRIZES", 256, 66); });
  add(g, new THREE.PlaneGeometry(2.2, 0.4), flat(sign), 0, 2.45, 0.05);
  return g;
}

/** Lounge coffee table with a song book and two drinks. */
export function loungeTable() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.04, 28), std(0x111014, { roughness: 0.15, metalness: 0.3 }), 0, 0.42, 0);
  add(g, new THREE.CylinderGeometry(0.06, 0.12, 0.4, 14), CHROME, 0, 0.2, 0);
  const book = canvasTex(128, 160, (c) => { c.fillStyle = "#6b2bd9"; c.fillRect(0, 0, 128, 160); c.fillStyle = "#fff"; c.font = `800 22px ${FONT}`; c.fillText("SONG", 14, 60); c.fillText("BOOK ♪", 14, 88); });
  add(g, new THREE.BoxGeometry(0.2, 0.03, 0.26), new THREE.MeshStandardMaterial({ map: book }), -0.1, 0.455, 0.05, 0, 0.3);
  for (const [x, col] of [[0.2, 0x4fd8ff], [0.1, 0xff4fd8]] as [number, number][]) {
    add(g, new THREE.CylinderGeometry(0.035, 0.03, 0.12, 12), new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: 0.7, roughness: 0.1 }), x, 0.5, -0.12);
    add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), std(0xffffff), x + 0.01, 0.56, -0.12);
  }
  return g;
}

/** Glowing row letter for the aisle end of a seat row. */
export function rowLetter(letter: string) {
  const tex = canvasTex(64, 64, (c) => { c.fillStyle = "#1a0b0e"; c.fillRect(0, 0, 64, 64); c.fillStyle = "#ffc27a"; c.font = `800 44px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(letter, 32, 36); });
  return new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flat(tex));
}

// ---------------- doors ----------------

export interface Door {
  group: THREE.Group;
  /** Open now; closes again after `holdSeconds` (Infinity = stays open). */
  open(holdSeconds?: number): void;
  close(): void;
  update(dt: number): void;
  readonly amount: number; // 0 closed … 1 open
}

/** Eased open/close driver shared by every door. */
function doorDriver(apply: (k: number) => void, speed = 2.6) {
  let k = 0, target = 0, hold = 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  return {
    open(holdSeconds = 1.6) { target = 1; hold = holdSeconds; },
    close() { target = 0; hold = 0; },
    update(dt: number) {
      if (target === 1 && k >= 1 && Number.isFinite(hold)) { hold -= dt; if (hold <= 0) target = 0; }
      const next = THREE.MathUtils.clamp(k + Math.sign(target - k) * dt * speed, 0, 1);
      if (next !== k) { k = next; apply(ease(k)); }
    },
    get amount() { return k; },
  };
}

/**
 * Padded double doors hinged at the outer edges (cinema auditorium doors). Local +z is the
 * side they swing towards; push bars + round porthole windows.
 */
export function swingDoors(width: number, height: number, leaf: THREE.Material, trim: THREE.Material): Door {
  const g = new THREE.Group();
  const hinges: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.x = side * width / 2;
    const w = width / 2 - 0.01;
    add(hinge, new THREE.BoxGeometry(w, height, 0.08), leaf, -side * w / 2, height / 2, 0);
    add(hinge, new THREE.BoxGeometry(0.04, 0.5, 0.06), trim, -side * (w - 0.12), height * 0.47, 0.06);
    const win = add(hinge, new THREE.CircleGeometry(0.13, 20), new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.1, metalness: 0.4 }), -side * w / 2, height * 0.72, 0.045);
    add(hinge, new THREE.TorusGeometry(0.13, 0.015, 6, 20), trim, -side * w / 2, height * 0.72, 0.046);
    void win;
    hinges.push(hinge);
    g.add(hinge);
  }
  add(g, new THREE.BoxGeometry(width + 0.16, 0.12, 0.14), trim, 0, height + 0.06, 0); // frame head
  const d = doorDriver((k) => { hinges[0].rotation.y = -k * 1.35; hinges[1].rotation.y = k * 1.35; });
  return { group: g, open: d.open, close: d.close, update: d.update, get amount() { return d.amount; } };
}

/** Automatic sliding glass doors (two panes sliding apart along x). */
export function slidingDoors(width: number, height: number, tint = 0xbfe6ff, frameColor = 0x1b1b1f): Door {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
  const frame = std(frameColor, { metalness: 0.7, roughness: 0.3 });
  const panes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pane = new THREE.Group();
    const w = width / 2;
    add(pane, new THREE.BoxGeometry(w - 0.02, height - 0.04, 0.03), glass, 0, height / 2, 0).renderOrder = 4;
    for (const [bw, bh, x, y] of [[w, 0.05, 0, height - 0.025], [w, 0.05, 0, 0.025], [0.05, height, side * (w / 2 - 0.025), height / 2], [0.05, height, -side * (w / 2 - 0.025), height / 2]] as [number, number, number, number][]) add(pane, new THREE.BoxGeometry(bw, bh, 0.05), frame, x, y, 0);
    add(pane, new THREE.BoxGeometry(0.03, 0.5, 0.06), CHROME, -side * (w / 2 - 0.12), height * 0.5, 0.05);
    pane.userData.home = side * w / 2;
    pane.position.x = pane.userData.home;
    panes.push(pane);
    g.add(pane);
  }
  add(g, new THREE.BoxGeometry(width + 0.2, 0.18, 0.2), frame, 0, height + 0.09, 0); // track housing
  const sensor = add(g, new THREE.BoxGeometry(0.16, 0.04, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }), 0, height + 0.08, 0.11);
  const d = doorDriver((k) => {
    panes.forEach((p, i) => { p.position.x = p.userData.home + (i ? 1 : -1) * k * (width / 2 - 0.06); });
    (sensor.material as THREE.MeshBasicMaterial).color.setHex(k > 0.05 ? 0x34c759 : 0xff3b30);
  }, 2.2);
  return { group: g, open: d.open, close: d.close, update: d.update, get amount() { return d.amount; } };
}
