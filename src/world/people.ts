// Procedural "puppet" people in the same chibi proportions as the KayKit heroes, built from
// rounded primitives with named pivots (armL/armR/legL/legR, handslot.l/r) so Character can
// animate them in code. Used for cinema staff uniforms and extra everyday player looks.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const FONT = '"Be Vietnam Pro", sans-serif';
export const PUPPET_HIP = 0.56; // hip pivot height (m) — used when sitting

export interface PersonStyle {
  skin: number;
  hair: number;
  hairStyle: "short" | "long" | "bun" | "spiky";
  top: number;
  topKind: "polo" | "shirt" | "hoodie" | "blazer" | "dress";
  bottom: number;
  shoes: number;
  vest?: number; // waistcoat over the top
  trim?: number; // piping on vest/blazer/cap
  apron?: "stripes";
  cap?: { color: number; text: string };
  tie?: number;
  bow?: number; // bow tie
  badge?: boolean; // name badge on the chest
  headset?: boolean;
  lanyard?: number;
  backpack?: number;
  glasses?: boolean;
}

const mat = new Map<string, THREE.Material>();
function m(color: number, rough = 0.7, metal = 0): THREE.Material {
  const k = `${color}|${rough}|${metal}`;
  let x = mat.get(k);
  if (!x) { x = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); mat.set(k, x); }
  return x;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPerson(s: PersonStyle): THREE.Group {
  const root = new THREE.Group();
  const add = (p: THREE.Object3D, geo: THREE.BufferGeometry, mt: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, mt);
    o.position.set(x, y, z);
    p.add(o);
    return o;
  };
  const skin = m(s.skin, 0.6);
  // ---- legs (pivot at the hip) ----
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? "legL" : "legR";
    leg.position.set(side * 0.1, PUPPET_HIP, 0);
    const bottom = s.topKind === "dress" ? skin : m(s.bottom, 0.8);
    add(leg, new RoundedBoxGeometry(0.15, 0.46, 0.17, 2, 0.06), bottom, 0, -0.25, 0);
    add(leg, new RoundedBoxGeometry(0.17, 0.09, 0.27, 2, 0.04), m(s.shoes, 0.4), 0, -0.52, 0.04);
    root.add(leg);
  }
  // ---- torso ----
  const torso = new THREE.Group();
  torso.name = "torso";
  torso.position.y = PUPPET_HIP;
  root.add(torso);
  const topM = m(s.top, s.topKind === "hoodie" ? 0.9 : 0.65);
  if (s.topKind === "dress") {
    add(torso, new THREE.CylinderGeometry(0.2, 0.3, 0.42, 20), topM, 0, 0.06, 0);
    add(torso, new RoundedBoxGeometry(0.4, 0.3, 0.26, 3, 0.1), topM, 0, 0.36, 0);
  } else {
    add(torso, new RoundedBoxGeometry(0.44, 0.5, 0.28, 3, 0.1), topM, 0, 0.27, 0);
    add(torso, new RoundedBoxGeometry(0.42, 0.12, 0.27, 2, 0.05), m(s.bottom, 0.8), 0, 0.02, 0); // belt line
  }
  if (s.topKind === "polo" || s.topKind === "shirt" || s.topKind === "blazer") { // collar
    const col = s.topKind === "blazer" ? m(0xffffff, 0.6) : topM;
    for (const side of [-1, 1]) { const c = add(torso, new THREE.BoxGeometry(0.1, 0.05, 0.03), col, side * 0.06, 0.5, 0.13); c.rotation.z = side * 0.5; }
  }
  if (s.topKind === "blazer") {
    add(torso, new THREE.BoxGeometry(0.12, 0.36, 0.01), m(0xffffff, 0.6), 0, 0.33, 0.141); // shirt front
    for (const side of [-1, 1]) { const l = add(torso, new THREE.BoxGeometry(0.06, 0.28, 0.012), m(s.top, 0.5), side * 0.075, 0.38, 0.146); l.rotation.z = -side * 0.35; }
  }
  if (s.topKind === "hoodie") {
    add(torso, new THREE.TorusGeometry(0.15, 0.05, 8, 18), topM, 0, 0.5, -0.04).rotation.x = Math.PI / 2;
    add(torso, new RoundedBoxGeometry(0.24, 0.12, 0.03, 2, 0.02), m(s.top, 0.95), 0, 0.12, 0.14); // pocket
    for (const side of [-1, 1]) add(torso, new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), m(0xffffff), side * 0.04, 0.42, 0.145);
  }
  if (s.vest) {
    const vest = m(s.vest, 0.55);
    for (const side of [-1, 1]) add(torso, new RoundedBoxGeometry(0.19, 0.42, 0.04, 2, 0.02), vest, side * 0.12, 0.26, 0.135);
    add(torso, new RoundedBoxGeometry(0.46, 0.42, 0.26, 2, 0.08), vest, 0, 0.26, -0.02);
    if (s.trim) for (const side of [-1, 1]) add(torso, new THREE.BoxGeometry(0.012, 0.42, 0.01), m(s.trim, 0.3, 0.7), side * 0.03, 0.26, 0.158);
    for (const y of [0.18, 0.28]) add(torso, new THREE.SphereGeometry(0.012, 8, 6), m(s.trim ?? 0xd4ad55, 0.3, 0.8), 0.045, y, 0.16);
  }
  if (s.apron === "stripes") {
    const stripes = canvasTex(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#ffffff" : "#c8372d"; g.fillRect(i * 8, 0, 8, 64); } });
    add(torso, new THREE.BoxGeometry(0.36, 0.5, 0.012), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), 0, 0.0, 0.15);
  }
  if (s.tie) add(torso, new THREE.BoxGeometry(0.05, 0.24, 0.012), m(s.tie, 0.5), 0, 0.37, 0.15);
  if (s.bow) {
    for (const side of [-1, 1]) { const b = add(torso, new THREE.ConeGeometry(0.035, 0.06, 4), m(s.bow, 0.4, 0.3), side * 0.03, 0.49, 0.15); b.rotation.z = side * Math.PI / 2; }
  }
  if (s.badge) {
    const badge = canvasTex(128, 48, (g) => { g.fillStyle = "#d4ad55"; g.fillRect(0, 0, 128, 48); g.fillStyle = "#2a2320"; g.font = `800 22px ${FONT}`; g.textAlign = "center"; g.fillText("STAFF", 64, 32); });
    add(torso, new THREE.BoxGeometry(0.1, 0.04, 0.01), new THREE.MeshStandardMaterial({ map: badge, metalness: 0.4, roughness: 0.4 }), -0.12, 0.4, 0.16);
  }
  if (s.lanyard) {
    for (const side of [-1, 1]) { const l = add(torso, new THREE.BoxGeometry(0.018, 0.3, 0.01), m(s.lanyard, 0.6), side * 0.06, 0.38, 0.155); l.rotation.z = side * 0.25; }
    add(torso, new THREE.BoxGeometry(0.07, 0.09, 0.008), m(0xffffff, 0.4), 0, 0.2, 0.16);
  }
  if (s.backpack) add(torso, new RoundedBoxGeometry(0.32, 0.38, 0.14, 2, 0.06), m(s.backpack, 0.8), 0, 0.27, -0.2);
  // ---- arms (pivot at the shoulder) ----
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? "armL" : "armR";
    arm.position.set(side * 0.27, PUPPET_HIP + 0.46, 0);
    const sleeve = s.topKind === "dress" ? skin : m(s.vest && s.topKind !== "blazer" ? s.top : s.top, 0.7);
    add(arm, new RoundedBoxGeometry(0.12, 0.3, 0.13, 2, 0.05), sleeve, 0, -0.14, 0);
    add(arm, new RoundedBoxGeometry(0.1, 0.16, 0.11, 2, 0.045), skin, 0, -0.34, 0);
    const slot = new THREE.Object3D();
    slot.name = side < 0 ? "handslot.l" : "handslot.r";
    slot.position.set(0, -0.42, 0.04);
    arm.add(slot);
    torso.parent!.add(arm);
  }
  // ---- head ----
  const head = new THREE.Group();
  head.name = "head";
  head.position.y = PUPPET_HIP + 0.56;
  root.add(head);
  add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.08, 12), skin, 0, -0.02, 0); // neck
  const face = add(head, new THREE.SphereGeometry(0.24, 28, 20), skin, 0, 0.24, 0);
  face.scale.set(1, 1.02, 0.95);
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.03, 12, 8), m(0x1a1414, 0.3), side * 0.085, 0.24, 0.215); // eyes
    add(head, new THREE.SphereGeometry(0.01, 8, 6), m(0xffffff, 0.2), side * 0.085 + 0.01, 0.255, 0.24); // catchlight
    add(head, new THREE.BoxGeometry(0.07, 0.014, 0.01), m(s.hair, 0.6), side * 0.085, 0.3, 0.22).rotation.z = -side * 0.12; // brows
    const cheek = add(head, new THREE.CircleGeometry(0.03, 14), new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.45, depthWrite: false }), side * 0.14, 0.18, 0.215);
    cheek.rotation.y = side * 0.5;
    add(head, new THREE.SphereGeometry(0.045, 10, 8), skin, side * 0.235, 0.22, 0); // ears
  }
  const mouth = add(head, new THREE.TorusGeometry(0.035, 0.008, 6, 14, Math.PI), m(0x7a2a2a, 0.5), 0, 0.15, 0.225);
  mouth.rotation.z = Math.PI;
  const hair = m(s.hair, 0.75);
  const cap = add(head, new THREE.SphereGeometry(0.255, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.27, -0.01);
  cap.scale.set(1, 0.85, 1);
  if (s.hairStyle === "long") add(head, new RoundedBoxGeometry(0.46, 0.42, 0.14, 3, 0.06), hair, 0, 0.14, -0.15);
  if (s.hairStyle === "bun") add(head, new THREE.SphereGeometry(0.09, 14, 10), hair, 0, 0.5, -0.12);
  if (s.hairStyle === "spiky") for (let i = 0; i < 6; i++) { const sp = add(head, new THREE.ConeGeometry(0.05, 0.12, 6), hair, -0.15 + i * 0.06, 0.48, 0.02); sp.rotation.z = (i - 2.5) * -0.18; }
  if (s.hairStyle !== "spiky" && !s.cap) add(head, new RoundedBoxGeometry(0.4, 0.07, 0.1, 2, 0.03), hair, 0, 0.37, 0.16); // fringe
  if (s.cap) {
    const cm = m(s.cap.color, 0.6);
    const dome = add(head, new THREE.SphereGeometry(0.265, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), cm, 0, 0.29, 0);
    dome.scale.y = 0.85;
    const brim = add(head, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), cm, 0, 0.31, 0.2);
    brim.scale.z = 0.9;
    const logo = canvasTex(128, 64, (g) => { g.fillStyle = "#" + s.cap!.color.toString(16).padStart(6, "0"); g.fillRect(0, 0, 128, 64); g.fillStyle = "#f2c14e"; g.font = `800 26px ${FONT}`; g.textAlign = "center"; g.fillText(s.cap!.text, 64, 42); });
    add(head, new THREE.PlaneGeometry(0.16, 0.08), new THREE.MeshBasicMaterial({ map: logo }), 0, 0.42, 0.2).rotation.x = -0.35;
  }
  if (s.headset) {
    const band = add(head, new THREE.TorusGeometry(0.26, 0.012, 6, 24, Math.PI), m(0x111111, 0.4), 0, 0.26, 0);
    band.rotation.y = Math.PI / 2;
    add(head, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), m(0x111111, 0.4), 0.25, 0.22, 0).rotation.z = Math.PI / 2;
    const mic = add(head, new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6), m(0x111111, 0.4), 0.2, 0.15, 0.1);
    mic.rotation.set(1.1, 0, 0.4);
  }
  if (s.glasses) for (const side of [-1, 1]) add(head, new THREE.TorusGeometry(0.045, 0.008, 6, 16), m(0x222222, 0.3), side * 0.085, 0.24, 0.235);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
  return root;
}

// ---------- uniforms + everyday looks ----------

const BURGUNDY = 0x7a1424, GOLD = 0xd4ad55, BLACK = 0x15141a, WHITE = 0xf4f1ea;

/** Cinema staff uniforms (house brand "RẠP ONLINE"; generic premium-cinema look, no real brand marks). */
export const STAFF_STYLES = {
  StaffTicket: { skin: 0xf0c7a0, hair: 0x2a1c14, hairStyle: "bun", top: WHITE, topKind: "shirt", bottom: BLACK, shoes: 0x111111, vest: BURGUNDY, trim: GOLD, bow: GOLD, badge: true },
  StaffSnack: { skin: 0xe8b48c, hair: 0x1a1210, hairStyle: "short", top: 0xc8372d, topKind: "polo", bottom: BLACK, shoes: 0x111111, apron: "stripes", cap: { color: 0xc8372d, text: "RẠP" }, badge: true },
  StaffUsher: { skin: 0xd9a57e, hair: 0x0f0c0a, hairStyle: "short", top: BLACK, topKind: "blazer", bottom: BLACK, shoes: 0x0a0a0a, tie: 0xc8372d, headset: true, lanyard: 0xc8372d, badge: true },
} satisfies Record<string, PersonStyle>;

/** Everyday looks players can pick. */
export const CIVIL_STYLES = {
  SinhVien: { skin: 0xf2c9a4, hair: 0x221813, hairStyle: "spiky", top: 0x4a6fa5, topKind: "hoodie", bottom: 0x2b3446, shoes: 0xf4f4f4, backpack: 0xe0a33a },
  CongSo: { skin: 0xe9b995, hair: 0x15100c, hairStyle: "short", top: 0xdfe8f2, topKind: "shirt", bottom: 0x2e3440, shoes: 0x3a2618, tie: 0x2f5aa8, glasses: true },
  CoNang: { skin: 0xf6d2b5, hair: 0x3b2316, hairStyle: "long", top: 0xf29bb6, topKind: "dress", bottom: 0xf29bb6, shoes: 0xfdfdfd },
} satisfies Record<string, PersonStyle>;
