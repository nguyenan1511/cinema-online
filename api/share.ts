// GET /s/{token} (rewritten to /api/share?t={token} in vercel.json). Edge runtime.
import films from "../data/films.index.json";
import { SHELL } from "./_lib/shell.generated";
import { createShareHandler } from "./_lib/share";

export const config = { runtime: "edge" };

export default createShareHandler({ films, shell: SHELL });
