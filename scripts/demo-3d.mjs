// Records the walkable-cinema story as an invited friend: street → queue at QUẦY VÉ → buy →
// BẮP NƯỚC → SOÁT VÉ → PHÒNG n → walk to the seat next to Linh → lights down → the film → souvenir.
// Needs `npm run dev` on BASE. Usage: node scripts/demo-3d.mjs <outDir> [base]
// CHROME_PATH reuses an already-downloaded Chromium; ffmpeg on PATH stitches the video.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const out = resolve(process.argv[2] ?? "demo");
const base = process.argv[3] ?? "http://localhost:5179";
mkdirSync(`${out}/frames`, { recursive: true });
const TOKEN = "eyJ2IjoxLCJmIjo5MTAwMDEsInN0IjoiMTgzMCIsImQiOiIyMDI2LTExLTAzIiwiaCI6eyJzIjoiRjYiLCJuIjoiTmd1eeG7hW4gVsSDbiBMaW5oIn0sInIiOltbIkY0IiwiTWkiXV19";

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `${out}/frames/f${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 780, maxHeight: 1688 });
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const walk = (pts) => page.evaluate((p) => window.__world.debugWalk(p), pts);
const act = () => page.keyboard.press("e");

await page.goto(`${base}/s/${TOKEN}`);
await wait(800); await shot("01-intro");
await page.fill("input[autocomplete=nickname]", "Phương");
await page.click("button[aria-label='Tướng Pháp sư']");
await page.waitForSelector("button:has-text('BẮT ĐẦU'):not([disabled])", { timeout: 30000 });
await wait(1200); await shot("01b-hero-picked");
await page.click("button:has-text('BẮT ĐẦU')");
await page.waitForFunction(() => !!window.__world, null, { timeout: 20000 });
await wait(1500); await shot("02-street");
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(Math.round(n / 2)); }; requestAnimationFrame(f); }));
console.log("fps (software GL):", fps);

await walk([[0, 19.5]]);
await shot("03-entrance");
await walk([[0, 15], [-4.3, 12]]);
await wait(300); await shot("04-lobby-queue");
await act(); // Xếp hàng mua vé
await wait(2500); await shot("05-in-queue");
await page.waitForSelector("[role=dialog][aria-label='QUẦY VÉ']", { timeout: 240000 });
await wait(600); await shot("06-counter-seat");
await page.click("button[aria-label='Ghế F5, cạnh bạn của bạn'], button[aria-label='Ghế F7, cạnh bạn của bạn']");
await wait(400); await shot("07-seat-picked");
await page.click("button:has-text('Tiếp tục')");
await page.fill(".kiosk-input", "Mong năm nay bớt deadline");
await wait(300); await shot("07b-confirm");
await page.click("button:has-text('Xác nhận')");
await wait(900); await shot("07c-eticket");
await page.click("button:has-text('Vào sảnh')");
await wait(600);

await walk([[0, 12.6], [9.6, 11.5]]);
await act(); // Mua bắp nước
await wait(500); await shot("08-concession");
await page.click("text=Bắp caramel");
await wait(800);
await walk([[9, 8], [10.7, 5.3]]);
await act(); // Soát vé
await wait(1600); await shot("09-checker-tear");
await page.click("button:has-text('Qua cổng')");
await wait(600);
const room = await page.evaluate(() => window.__world.myRoom);
const doorX = [7.4, 10, 12.6][room - 1];
await walk([[10.7, 3.2], [10.7, 0.2], [doorX, -1], [doorX, -2.9]]);
await wait(300); await shot("10-corridor-door");
await act(); // Vào PHÒNG n
await wait(1800); await shot("11-hall-entrance");
const seatZ = await page.evaluate(() => window.__world.seatZ(window.__world.mySeat));
await walk([[0, seatZ + 1.2], [0, seatZ]]);
await wait(300); await shot("12-hall-row");
await act(); // Vào ghế
await page.waitForSelector("text=ĐANG CHIẾU", { timeout: 20000 });
await wait(2500); await shot("13-lights-down");
// the film rolls after the countdown leader; wait until the <video> is actually playing
const playing = await page.waitForFunction(() => { const v = window.__world.video; return v && !v.paused && v.currentTime > 1; }, null, { timeout: 90000 }).then(() => true).catch(() => false);
console.log("film playing:", playing);
await wait(4000); await shot("14-film");
await page.waitForSelector("button.lb-cta:has-text('Vé kỷ niệm'):not([disabled])", { timeout: 15000 });
await page.click("button.lb-cta:has-text('Vé kỷ niệm')");
await wait(2500); await shot("15-souvenir");

await cdp.send("Page.stopScreencast");
await ctx.close();
await browser.close();
const list = frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(0.03, (frames[i + 1]?.t ?? f.t + 0.5) - f.t).toFixed(3)}`).join("\n") + `\nfile '${frames.at(-1).file}'\n`;
writeFileSync(`${out}/frames.txt`, list);
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
ff(["-f", "concat", "-safe", "0", "-i", `${out}/frames.txt`, "-vf", "fps=30,scale=780:-2,format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", `${out}/walkthrough.mp4`]);
ff(["-i", `${out}/walkthrough.mp4`, "-vf", "fps=10,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer", `${out}/walkthrough.gif`]);
console.log("frames:", frames.length, "errors:", errors.length ? errors : "none");
