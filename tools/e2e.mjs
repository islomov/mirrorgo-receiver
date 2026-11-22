// End-to-end check of the page against a running Worker, with the fake sender, in headless
// Chrome (puppeteer-core drives the installed Google Chrome, nothing is downloaded).
//
//   cd tools && npm install
//   node e2e.mjs                         # against http://localhost:8787 (cd worker && npm run dev)
//   SERVER=https://smrr.tv node e2e.mjs  # against the deployed Worker
//   SHOTS=/some/dir node e2e.mjs         # also save screenshots there
//   LINK=<https url> node e2e.mjs        # the link for the link steps (LINK=0 skips them)
//   PAGE=/firetv node e2e.mjs            # a TV app's page (/firetv, /samsung, /lg, /roku, /googletv: each its own copy)
//
// Flow: page shows a code → fake sender connects → playing (debug stats) → page reload rejoins the
// same code and plays again → ICE restart requested by the page → sender sends bye → "stopped"
// with the same code → sender starts again → playing → the sender freezes (no bye, its socket stays
// open: an app killed, out of Wi-Fi) → stopped, not "Reconnecting…" or an error → a sender comes back →
// playing → socket drops → stopped. Links: a sender plays
// a link in the page's own player → pause / play → its socket drops, the link plays on → a new sender
// gets the status and stops the link.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const SERVER = process.env.SERVER || "http://localhost:8787";
// The page under test: / (smrr.tv in a browser) or a TV app's own copy. /firetv shows the code as one small
// line (#code-small, no #code) and a QR code for the App Store.
const PAGE = process.env.PAGE || "/";
const CODE = "#code, #code-small";
const APP_STORE_URL = "https://apps.apple.com/app/id6835835303";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS;
// Mux's public test stream (HLS, CORS allowed: works with hls.js too).
const LINK = process.env.LINK === "0" ? null : process.env.LINK || "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
// Default: tools/test-image.png from the local file server below.
const IMAGE_ENV = process.env.IMAGE;
// The IFrame API's own sample video; YOUTUBE=0 skips the YouTube step.
const YOUTUBE = process.env.YOUTUBE === "0" ? null : process.env.YOUTUBE || "M7lc1UVf-VE";
const here = path.dirname(fileURLToPath(import.meta.url));

// Serve tools/ on localhost (a secure context for canvas capture / AudioContext).
const files = http.createServer((req, res) => {
  const file = path.join(here, new URL(req.url, "http://x").pathname);
  if (!file.startsWith(here) || !fs.existsSync(file)) return res.writeHead(404).end();
  const type = file.endsWith(".png") ? "image/png" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
});
await new Promise((r) => files.listen(0, "127.0.0.1", r));
const senderBase = `http://localhost:${files.address().port}/fake-sender.html`;
const IMAGE = IMAGE_ENV || `http://localhost:${files.address().port}/test-image.png`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // Not flagged as automated: YouTube's player stalls for headless / automated browsers.
  args: ["--autoplay-policy=no-user-gesture-required", "--window-size=1920,1080", "--disable-blink-features=AutomationControlled"],
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
  step(`viewer ${SERVER}${PAGE}?debug=1`);
  const viewer = await browser.newPage();
  await viewer.setUserAgent((await browser.userAgent()).replace("HeadlessChrome", "Chrome"));
  viewer.on("console", (m) => process.env.VERBOSE && console.log("  [viewer]", m.text()));
  await viewer.goto(`${SERVER}${PAGE}?debug=1`);
  await viewer.waitForFunction(() => /^\d{6}$/.test(document.querySelector("#code, #code-small").textContent.replace(" ", "")), { timeout: 10000, polling: 200 });
  const code = (await viewer.$eval(CODE, (e) => e.textContent)).replace(" ", "");
  console.log(`code ${code} (${ms()})`);
  check((await viewer.$eval("body", (b) => b.dataset.screen)) === "code", "code screen");
  if (PAGE.startsWith("/firetv")) {
    check(await viewer.$eval("#qr svg", (s) => s.getAttribute("aria-label")) === APP_STORE_URL, "QR encodes the App Store");
  } else {
    check(await viewer.$eval("#qr svg", (s) => s.getAttribute("aria-label")) === `${SERVER}/c/${code}`, "QR encodes /c/<code>");
  }
  if (SHOTS) {
    // A clean shot without the debug overlay.
    const clean = await browser.newPage();
    await clean.goto(`${SERVER}${PAGE}`);
    await clean.waitForFunction(() => /\d/.test(document.querySelector("#code, #code-small").textContent), { polling: 200 });
    await clean.screenshot({ path: path.join(SHOTS, "smrr-code-screen.png") });
    await clean.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await clean.screenshot({ path: path.join(SHOTS, "smrr-code-screen-phone.png") });
    await clean.close();
  }

  step("fake sender connects");
  let sender = await browser.newPage();
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
  await viewer.waitForFunction(() => /\d/.test(document.querySelector("#code, #code-small").textContent), { polling: 200 });
  check((await viewer.$eval(CODE, (e) => e.textContent)).replace(" ", "") === code, "same code after reload");
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
  check((await viewer.$eval(CODE, (e) => e.textContent)).replace(" ", "") === code, "stopped screen keeps the code");
  if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-stopped.png") });

  step("sender starts again with the same code");
  start = Date.now();
  await sender.click("#connect");
  await playing();
  console.log(`playing again after ${Date.now() - start} ms`);

  step("sender freezes: no bye, its socket stays open (the server still thinks it's there)");
  start = Date.now();
  await sender.evaluate(() => {
    handle = async () => {}; // deaf from now on: no answers to ICE restarts
    closePc();
  });
  await viewer.waitForFunction(() => document.body.dataset.variant === "stopped", { timeout: 45000, polling: 200 });
  console.log(`stopped ${Date.now() - start} ms after the sender froze`);
  check((await viewer.$eval("body", (b) => b.dataset.screen)) === "code", "code screen (not an error)");
  check((await viewer.$eval("#code-title", (e) => e.textContent)) === "Mirroring stopped", "\"Mirroring stopped\"");
  check((await viewer.$eval(CODE, (e) => e.textContent)).replace(" ", "") === code, "same code");
  check((await viewer.$eval("#toast", (e) => e.textContent)) === "", "no \"Reconnecting…\" toast");
  if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-phone-gone.png") });

  step("the phone comes back (a new sender with the same code)");
  start = Date.now();
  const frozen = sender;
  sender = await browser.newPage();
  sender.on("console", (m) => process.env.VERBOSE && console.log("  [sender]", m.text()));
  await sender.goto(`${senderBase}?server=${encodeURIComponent(SERVER)}&code=${code}&autostart=1`);
  await playing();
  console.log(`playing again after ${Date.now() - start} ms`);
  await frozen.close();
  await new Promise((r) => setTimeout(r, 2000));
  check((await viewer.$eval("body", (b) => b.dataset.screen)) === "playing", "still playing after the frozen sender's page closed");

  step("sender page closes without bye (socket drops)");
  await sender.close();
  await viewer.waitForFunction(() => document.body.dataset.variant === "stopped", { timeout: 30000, polling: 200 });
  console.log(`stopped ${ms()}`);

  if (LINK) {
    const mediaState = () => viewer.evaluate(() => window.smrr.media.state);
    const waitMedia = (state, timeout = 30000) =>
      viewer.waitForFunction((s) => window.smrr.media.state === s, { timeout, polling: 200 }, state);
    const linkSender = async (extra) => {
      const page = await browser.newPage();
      page.on("console", (m) => process.env.VERBOSE && console.log("  [link sender]", m.text()));
      await page.goto(`${senderBase}?server=${encodeURIComponent(SERVER)}&code=${code}&mirror=0&autostart=1${extra || ""}`);
      await page.waitForFunction(() => /capabilities/.test(document.getElementById("log").textContent), { timeout: 10000, polling: 200 });
      return page;
    };

    step(`link: a sender plays ${LINK}`);
    const linker = await linkSender(`&link=${encodeURIComponent(LINK)}`);
    console.log((await linker.$eval("#log", (e) => e.textContent)).split("\n").find((l) => /capabilities/.test(l)));
    start = Date.now();
    await linker.click("#play-link");
    await waitMedia("playing");
    console.log(`link playing after ${Date.now() - start} ms`);
    await new Promise((r) => setTimeout(r, 3000));
    check((await viewer.$eval("body", (b) => b.dataset.screen)) === "playing", "playing screen");
    check(await viewer.evaluate(() => document.getElementById("video").videoWidth > 0 && document.getElementById("video").currentTime > 1), "video frames, time moving");
    check(/link playing/.test(await linker.$eval("#state", (e) => e.textContent)), "sender got media-status playing");
    console.log((await viewer.$eval("#debug", (e) => e.textContent)).split("\n").find((l) => l.startsWith("LINK")));
    if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-link-playing.png") });

    step("link: pause / play");
    await linker.click("#pause-link");
    await waitMedia("paused", 5000);
    await linker.click("#resume-link");
    await waitMedia("playing", 10000);
    check(true, "paused and played again");

    step("link: the sender's socket drops, the link plays on");
    await linker.close();
    await new Promise((r) => setTimeout(r, 3000));
    check((await mediaState()) === "playing", "still playing without the phone");
    check((await viewer.$eval("body", (b) => b.dataset.screen)) === "playing", "still on the playing screen");

    step("link: a sender joins again, gets the status, stops the link");
    const again = await linkSender("");
    await again.waitForFunction(() => /media-status [^\n]*"state":"playing"/.test(document.getElementById("log").textContent), { timeout: 5000, polling: 200 });
    check(true, "status of the playing link on join");
    await again.click("#stop-link");
    await viewer.waitForFunction(() => document.body.dataset.variant === "stopped", { timeout: 5000, polling: 200 });
    check((await viewer.$eval("#code-title", (e) => e.textContent)) === "Playback stopped", "\"Playback stopped\", same code");
    check((await mediaState()) === "idle", "player idle");

    step("link: hls.js (forced with ?hlsjs=1, where the browser plays HLS itself)");
    await viewer.goto(`${SERVER}${PAGE}?debug=1&hlsjs=1`);
    await viewer.waitForFunction(() => /\d/.test(document.querySelector("#code, #code-small").textContent), { polling: 200 });
    await again.$eval("#link", (e, link) => { e.value = link; }, LINK);
    await again.click("#play-link");
    await waitMedia("playing");
    await new Promise((r) => setTimeout(r, 3000));
    const line = (await viewer.$eval("#debug", (e) => e.textContent)).split("\n").find((l) => l.startsWith("LINK"));
    console.log(line);
    check(/hls\.js/.test(line), "played by hls.js");
    check(await viewer.evaluate(() => document.getElementById("video").currentTime > 1), "time moving");
    await again.click("#stop-link");
    await waitMedia("idle", 5000);

    step("link: an image (its own URL broken, so the fallback shows)");
    await again.select("#kind", "image");
    await again.$eval("#link", (e) => { e.value = "https://smrr.tv/no-such-image.jpg"; });
    await again.$eval("#fallback", (e, url) => { e.value = url; }, IMAGE);
    await again.click("#play-link");
    await waitMedia("playing", 15000);
    check(await viewer.evaluate(() => document.getElementById("image").naturalWidth > 0), "image shown (fallback)");
    check((await viewer.$eval("body", (b) => b.dataset.media)) === "image", "image mode, no sound button");
    check(await viewer.$eval("#sound", (b) => b.hidden), "sound button hidden");
    if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-link-image.png") });

    step("link: a link that doesn't exist fails");
    await again.select("#kind", "video");
    await again.$eval("#link", (e) => { e.value = "https://smrr.tv/no-such-stream.m3u8"; });
    await again.click("#play-link");
    await waitMedia("error", 20000);
    check((await viewer.$eval("body", (b) => b.dataset.screen)) === "message", "error message on the page");
    check(/link error \((network|unsupported)\)/.test(await again.$eval("#state", (e) => e.textContent)), "sender got media-status error");
    await again.close();

    if (YOUTUBE) {
      // Sent from here, not a sender tab: YouTube only starts in the tab in front, and the tabs
      // behind it are throttled.
      step(`link: YouTube ${YOUTUBE}`);
      const lookup = await (await fetch(`${SERVER}/api/rooms/${code}`, { headers: { origin: SERVER } })).json();
      const ws = new WebSocket(lookup.signalingURL);
      const statuses = [];
      ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "media-status") statuses.push(m); });
      await new Promise((r) => ws.addEventListener("open", r));
      await viewer.bringToFront();
      ws.send(JSON.stringify({ type: "media-load", id: 9, kind: "youtube", url: `https://www.youtube.com/watch?v=${YOUTUBE}`, videoId: YOUTUBE, start: 5 }));
      await waitMedia("playing", 30000);
      await new Promise((r) => setTimeout(r, 3000));
      const yt = (await viewer.$eval("#debug", (e) => e.textContent)).split("\n").find((l) => l.startsWith("LINK"));
      console.log(yt);
      check(/youtube\s+playing\s+([6-9]|[1-9]\d)/.test(yt), "YouTube playing from 5 s, time moving");
      check(statuses.some((m) => m.id === 9 && m.state === "playing"), "sender got media-status playing");
      if (SHOTS) await viewer.screenshot({ path: path.join(SHOTS, "smrr-link-youtube.png") });
      ws.send(JSON.stringify({ type: "media-control", id: 9, action: "pause" }));
      await waitMedia("paused", 5000);
      check(true, "paused from the phone");
      ws.send(JSON.stringify({ type: "media-stop" }));
      await waitMedia("idle", 5000);
      check(true, "stopped");
      ws.close();
    }
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  files.close();
}
console.log(failed ? "\nFAILED" : "\nall good");
process.exit(failed ? 1 : 0);
