// Test-only: Vercel's edge runtime lets fetch() read bundled assets via
// fetch(new URL("./file", import.meta.url)). Node's fetch rejects file: URLs,
// so serve them from disk here. Production code is unchanged.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof URL ? input : typeof input === "string" ? new URL(input, "http://x") : new URL(input.url);
  if (url.protocol === "file:") return new Response(await readFile(fileURLToPath(url)));
  return realFetch(input, init);
}) as typeof fetch;
