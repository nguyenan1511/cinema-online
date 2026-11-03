// Coin-karaoke booths (코인노래방): small glass-front rooms with a lyric TV, sofa and disco light.
// The TV is a canvas texture, so people walking past can read along through the glass.
import * as THREE from "three";
import type { Song } from "../../shared/songs";
import type { Mode } from "./arcade";
import { slidingDoors, type Door } from "./details";

const FONT = '"Be Vietnam Pro", sans-serif';

export class KaraokeBooth {
  readonly group = new THREE.Group();
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private disco: THREE.Mesh;
  private spots: THREE.Mesh[] = [];
  private party = 0; // 0..1, disco lights fade in while singing
  readonly door: Door;

  constructor(readonly room: number, cx: number, z0: number, private width = 4.2, private depth = 4.2, accent = 0x4fd8ff) {
    this.group.position.set(cx, 0, z0);
    const W = width, D = depth;
    const wall = new THREE.MeshStandardMaterial({ color: 0x1a1426, roughness: 0.85 });
    const foam = new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 1 });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.y = ry;
      this.group.add(o);
      return o;
    };
    add(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x120e18, roughness: 0.4, metalness: 0.2 }), 0, 0.015, D / 2).rotation.x = -Math.PI / 2;
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, 3.0, D), wall, sx * (W / 2), 1.5, D / 2);
    // acoustic foam pyramids on the side walls (instanced)
    const pyr = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.1, 4), foam, 2 * 6 * 8);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let k = 0;
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
      q.setFromEuler(new THREE.Euler(0, 0, -sx * Math.PI / 2));
      m.compose(new THREE.Vector3(sx * (W / 2 - 0.1), 0.6 + i * 0.32, 0.4 + j * (D - 0.8) / 7), q, new THREE.Vector3(1, 1, 1));
      pyr.setMatrixAt(k++, m);
    }
    this.group.add(pyr);
    // glass front with a door gap on the right, neon frame
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
    const gl = add(new THREE.BoxGeometry(W - 1.1, 2.8, 0.04), glass, -0.55, 1.4, D);
    gl.renderOrder = 4;
    const neon = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
    add(new THREE.BoxGeometry(W, 0.05, 0.05), neon, 0, 2.85, D);
    add(new THREE.BoxGeometry(0.05, 2.85, 0.05), neon, W / 2 - 1.1, 1.42, D);
    this.door = slidingDoors(1.05, 2.8, 0xd8ccff, 0x1a1426); // sliding glass door in the gap
    this.door.group.position.set(W / 2 - 0.55, 0, D + 0.04);
    this.group.add(this.door.group);
    // room number sign
    const sign = document.createElement("canvas");
    sign.width = 512; sign.height = 160;
    const sg = sign.getContext("2d")!;
    sg.fillStyle = "#0b0610"; sg.fillRect(0, 0, 512, 160);
    sg.font = `800 96px ${FONT}`; sg.textAlign = "center"; sg.textBaseline = "middle";
    sg.shadowColor = "#" + accent.toString(16).padStart(6, "0"); sg.shadowBlur = 30; sg.fillStyle = sg.shadowColor;
    sg.fillText(`♪ PHÒNG ${room}`, 256, 84);
    const st = new THREE.CanvasTexture(sign); st.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }), -0.55, 3.2, D + 0.03);
    // TV on the back wall
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 576;
    this.g = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.BoxGeometry(2.3, 1.36, 0.08), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2 }), 0, 1.75, 0.08);
    add(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }), 0, 1.75, 0.125);
    // sofa facing the TV
    const sofa = new THREE.MeshStandardMaterial({ color: 0x6b2bd9, roughness: 0.7 });
    add(new THREE.BoxGeometry(2.4, 0.42, 0.8), sofa, 0, 0.21, D - 0.75);
    add(new THREE.BoxGeometry(2.4, 0.6, 0.18), sofa, 0, 0.62, D - 0.3);
    // disco ball + coloured spots
    this.disco = add(new THREE.IcosahedronGeometry(0.18, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15, flatShading: true }), 0, 2.6, D / 2);
    const colors = [0xff4fd8, 0x4fd8ff, 0xffd23f, 0x7dffa8];
    for (let i = 0; i < 8; i++) {
      const spot = add(new THREE.CircleGeometry(0.22, 18), new THREE.MeshBasicMaterial({ color: colors[i % 4], transparent: true, opacity: 0, toneMapped: false, depthWrite: false }), 0, 0.02, D / 2);
      spot.rotation.x = -Math.PI / 2;
      this.spots.push(spot);
    }
    this.idle();
  }

  /** Where the singer stands (world space) and the interaction prompt spot outside the door. */
  get stand() { return new THREE.Vector3(this.group.position.x, 0, this.group.position.z + this.depth * 0.55); }
  get doorSpot() { return new THREE.Vector3(this.group.position.x + this.width / 2 - 0.55, 0, this.group.position.z + this.depth + 0.8); }

  mode(): Mode {
    const p = this.group.position;
    return {
      camera: () => ({ pos: new THREE.Vector3(p.x + 0.5, 2.3, p.z + this.depth - 0.2), look: new THREE.Vector3(p.x, 1.6, p.z) }),
      update: () => {},
      exit: () => { this.party = 0; this.idle(); },
    };
  }

  idle() {
    const g = this.g;
    g.fillStyle = "#0d0820"; g.fillRect(0, 0, 1024, 576);
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 64px ${FONT}`; g.fillStyle = "#4fd8ff";
    g.fillText(`PHÒNG HÁT ${this.room}`, 512, 240);
    g.font = `600 34px ${FONT}`; g.fillStyle = "#cbbcff";
    g.fillText("1 xu / bài · bấm chọn bài để hát", 512, 330);
    this.tex.needsUpdate = true;
  }

  /** Lyric screen: current line with sung syllables lit, next line dimmed below. */
  lyrics(song: Song, line: number, index: number, title = true) {
    this.party = 1;
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, "#120a2e"); grad.addColorStop(1, "#2e0a2a");
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 576);
    g.textBaseline = "middle";
    if (title) { g.textAlign = "left"; g.font = `700 28px ${FONT}`; g.fillStyle = "#cbbcff"; g.fillText(`♪ ${song.title}`, 36, 40); }
    const drawLine = (li: number, y: number, active: boolean) => {
      const notes = song.lines[li];
      if (!notes) return;
      g.font = `800 ${active ? 58 : 40}px ${FONT}`;
      const words = notes.map((n) => n[2]).filter(Boolean);
      const full = words.join(" ");
      let x = 512 - g.measureText(full).width / 2;
      g.textAlign = "left";
      let wi = 0;
      notes.forEach((n, ni) => {
        if (!n[2]) return;
        const w = (wi++ > 0 ? " " : "") + n[2];
        g.fillStyle = !active ? "rgba(255,255,255,.45)" : ni <= index ? "#ffd23f" : "#ffffff";
        if (active && ni <= index) { g.shadowColor = "#ff4fd8"; g.shadowBlur = 18; } else g.shadowBlur = 0;
        g.fillText(w, x, y);
        x += g.measureText(w).width;
      });
      g.shadowBlur = 0;
    };
    drawLine(line, 270, true);
    drawLine(line + 1, 380, false);
    this.tex.needsUpdate = true;
  }

  update(dt: number, t: number) {
    this.disco.rotation.y += dt * (0.4 + this.party * 1.6);
    this.spots.forEach((s, i) => {
      const a = t * 0.9 + (i / this.spots.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 1.3, 0.02, this.depth / 2 + Math.sin(a * 1.3) * 1.2);
      (s.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.party;
    });
  }
}
