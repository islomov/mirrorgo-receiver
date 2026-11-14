// End-to-end check of the page against a running Worker, with the fake sender, in headless
// Chrome (puppeteer-core drives the installed Google Chrome, nothing is downloaded).
//
//   cd tools && npm install
//   node e2e.mjs                         # against http://localhost:8787 (cd worker && npm run dev)
//   SERVER=https://smrr.tv node e2e.mjs  # against the deployed Worker
//   SHOTS=/some/dir node e2e.mjs         # also save screenshots there
//
// Flow: page shows a code → fake sender connects → playing (debug stats) → page reload rejoins the
// same code and plays again → ICE restart requested by the page → sender sends bye → "stopped"
// with the same code → sender starts again → playing.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const SERVER = process.env.SERVER || "http://localhost:8787";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS;
const here = path.dirname(fileURLToPath(import.meta.url));

// Serve tools/ on localhost (a secure context for canvas capture / AudioContext).
const files = http.createServer((req, res) => {
  const file = path.join(here, new URL(req.url, "http://x").pathname);
  if (!file.startsWith(here) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fs.readFileSync(file));
});
await new Promise((r) => files.listen(0, "127.0.0.1", r));
const senderBase = `http://localhost:${files.address().port}/fake-sender.html`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});

const step = (s) => console.log(`\n== ${s}`);
const t0 = Date.now();
const ms = () => `${Date.now() - t0} ms`;
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failed = true;
};

try {
  step(`viewer ${SERVER}/?debug=1`);
  const viewer = await browser.newPage();
  viewer.on("console", (m) => process.env.VERBOSE && console.log("  [viewer]", m.text()));
  await viewer.goto(`${SERVER}/?debug=1`);
  await viewer.waitForFunction(() => /^\d{3} \d{3}$/.test(document.getElementById("code").textContent), { timeout: 10000, polling: 200 });
  const code = (await viewer.$eval("#code", (e) => e.textContent)).replace(" ", "");
  console.log(`code ${code} (${ms()})`);
  check((await viewer.$eval("body", (b) => b.dataset.screen)) === "code", "code screen");
  check(await viewer.$eval("#qr svg", (s) => s.getAttribute("aria-label")) === `${SERVER}/c/${code}`, "QR encodes /c/<code>");
  if (SHOTS) {
    // A clean shot without the debug overlay.
    const clean = await browser.newPage();
    await clean.goto(`${SERVER}/`);
    await clean.waitForFunction(() => /\d/.test(document.getElementById("code").textContent), { polling: 200 });
    await clean.screenshot({ path: path.join(SHOTS, "smrr-code-screen.png") });
    await clean.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await clean.screenshot({ path: path.join(SHOTS, "smrr-code-screen-phone.png") });
    await clean.close();
  }

  step("fake sender connects");
  const sender = await browser.newPage();
  sender.on("console", (m) => process.env.VERBOSE && console.log("  [sender]", m.text()));
  await sender.goto(`${senderBase}?server=${encodeURIComponent(SERVER)}&code=${code}&autostart=1`);
  const playing = () => viewer.waitForFunction(() => document.body.dataset.screen === "playing", { timeout: 20000, polling: 200 });
  let start = Date.now();
  await playing();
  console.log(`playing after ${Date.now() - start} ms`);
  await new Promise((r) => setTimeout(r, 5000));
  const stats = await viewer.$eval("#debug", (e) => e.textContent);
  console.log(stats.split("\n").slice(0, 9).join("\n"));
  check(/VIDEO\s+[1-9]\d* fps\s+\d+x\d+/.test(stats), "video decoding (the sender may scale 1280x720 down)");
  check(/video\/H264/i.test(stats), "H.264");
  check(/opus\/2ch[^\n]*stereo=1/i.test(stats), "Opus stereo negotiated");
  check(/jitterBufferTarget=0|playoutDelayHint=0/.test(stats), "jitter buffer target 0");
  if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-playing-debug.png") });

  step("viewer reload rejoins the same room");
  start = Date.now();
  await viewer.reload();
  await viewer.waitForFunction(() => /\d/.test(document.getElementById("code").textContent), { polling: 200 });
  check((await viewer.$eval("#code", (e) => e.textContent)).replace(" ", "") === code, "same code after reload");
  await playing();
  console.log(`playing again ${Date.now() - start} ms after reload`);

  step("page asks for an ICE restart");
  await viewer.evaluate(() => window.smrr.player.requestIceRestart());
  await sender.waitForFunction(() => /offer \(ICE restart\)/.test(document.getElementById("log").textContent), { timeout: 5000, polling: 200 });
  await new Promise((r) => setTimeout(r, 2000));
  check((await viewer.$eval("body", (b) => b.dataset.screen)) === "playing", "still playing after ICE restart");

  step("sender stops (bye)");
  await sender.click("#stop");
  await viewer.waitForFunction(() => document.body.dataset.variant === "stopped", { timeout: 5000, polling: 200 });
  check((await viewer.$eval("#code", (e) => e.textContent)).replace(" ", "") === code, "stopped screen keeps the code");
  if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-stopped.png") });

  step("sender starts again with the same code");
  start = Date.now();
  await sender.click("#connect");
  await playing();
  console.log(`playing again after ${Date.now() - start} ms`);

  step("sender page closes without bye (socket drops)");
  await sender.close();
  await viewer.waitForFunction(() => document.body.dataset.variant === "stopped", { timeout: 30000, polling: 200 });
  console.log(`stopped ${ms()}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  files.close();
}
console.log(failed ? "\nFAILED" : "\nall good");
process.exit(failed ? 1 : 0);
