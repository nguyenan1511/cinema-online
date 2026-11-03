// Production builds don't ship fan-made models (e.g. Pikachu) unless VITE_FAN_MODELS=1.
import { rmSync } from "node:fs";
if (process.env.VITE_FAN_MODELS !== "1") {
  rmSync(new URL("../dist/fan", import.meta.url), { recursive: true, force: true });
  console.log("strip-fan: removed dist/fan (set VITE_FAN_MODELS=1 to keep it)");
}
