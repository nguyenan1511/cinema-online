// GET /api/stub?t={token}&me={me}&view=og|ticket  (edge runtime, eng D8)
import films from "../data/films.index.json";
import { createStubHandler } from "./_lib/stub";

export const config = { runtime: "edge" };

let fontsPromise: Promise<{ bold: ArrayBuffer; medium: ArrayBuffer }> | null = null;
function loadFonts() {
  fontsPromise ??= Promise.all([
    fetch(new URL("../fonts/BeVietnamPro-ExtraBold.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("../fonts/BeVietnamPro-Medium.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
  ]).then(([bold, medium]) => ({ bold, medium }));
  return fontsPromise;
}

export default createStubHandler({ films, loadFonts });
