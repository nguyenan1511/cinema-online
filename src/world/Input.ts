// Keyboard (WASD / arrows) + on-screen joystick. Fixed camera yaw: up = toward the screen (-z).
export class Input {
  private keys = new Set<string>();
  joy = { x: 0, y: 0 };
  onInteract?: () => void;

  constructor() {
    addEventListener("keydown", this.down);
    addEventListener("keyup", this.up);
    addEventListener("blur", this.clear);
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }

  private down = (e: KeyboardEvent) => {
    if (this.typing(e)) return;
    const k = e.key.toLowerCase();
    if (k === "e" || k === " ") { e.preventDefault(); this.onInteract?.(); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); this.keys.add(k); }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  private clear = () => { this.keys.clear(); this.joy = { x: 0, y: 0 }; };

  /** World-space move intent, length ≤ 1. */
  vector(): { x: number; z: number } {
    let x = this.joy.x, z = this.joy.y;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) z -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) z += 1;
    const len = Math.hypot(x, z);
    return len > 1 ? { x: x / len, z: z / len } : { x, z };
  }

  dispose() {
    removeEventListener("keydown", this.down);
    removeEventListener("keyup", this.up);
    removeEventListener("blur", this.clear);
  }
}
