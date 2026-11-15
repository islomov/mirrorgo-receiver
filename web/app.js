// smrr.tv page: shows a code, waits for MirrorGo on the iPhone and plays its screen, or a link it
// sends (an IPTV channel, …) in the page's own player.
// States: connecting → code → starting (phone connected) → playing → stopped (same code) / error.
// Signaling: signaling.js, WebRTC: player.js, links: media.js, strings: strings.js, protocol: PROTOCOL.md.

import { strings, spacedCode } from "./strings.js";
import { SignalingClient, adoptRoomFromURL } from "./signaling.js";
import { WebRTCPlayer, PlayerState } from "./player.js";
import { MediaPlayer, MediaState, capabilities } from "./media.js";
import qrcode from "./vendor/qrcode.js";

const $ = function (id) { return document.getElementById(id); };
const video = $("video");
const debug = /(^|[?&])debug=1(&|$)/.test(location.search);
const IDLE_AFTER_MS = 3000;
// Mirroring lost its connection and hasn't come back by then: the phone is gone (app killed, out
// of Wi-Fi), even if the server hasn't noticed (a dead socket can look open for minutes). The page
// says mirroring stopped instead of "Reconnecting…" over a frozen frame, or an error. The phone
// tries ICE restarts for up to 60 s: if one gets through, the page plays again.
const GIVE_UP_AFTER_MS = 15000;
// Opened by the app on a room it created (the TV's browser): no code. Its own screen ("app") says
// what the phone is doing instead of showing the code, QR code and steps.
const launchedCode = adoptRoomFromURL();
const launchedByApp = launchedCode !== null;

const app = {
  status: "connecting",   // signaling: connecting | open | reconnecting | offline | replaced | closed
  room: null,             // the `room` message
  senderConnected: false,
  stopped: false,         // the phone stopped mirroring / playing (keeps the code)
  activity: "mirroring",  // what the phone did last: "mirroring" (WebRTC) | "media" (a link)
  player: PlayerState.idle,
  media: MediaState.idle,
  screen: null,
  sessionEnded: false,    // launched by the app: its room is gone (the page doesn't get a code)
  lost: false,            // mirroring dropped and didn't come back (GIVE_UP_AFTER_MS): shown as stopped
};
let giveUpTimer = null;

const events = [];
function log(line) {
  const t = (performance.now() / 1000).toFixed(1);
  events.push(t + "s " + line);
  if (events.length > 10) events.shift();
  if (debug) console.log("[smrr]", line);
}

const signaling = new SignalingClient({
  url: (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws",
  log: log,
  onStatus: function (status) {
    app.status = status;
    render();
  },
  onRoom: onRoom,
  onMessage: onSignalingMessage,
});

const player = new WebRTCPlayer(video, {
  log: log,
  onSignal: function (message) {
    // Nobody to ask for an ICE restart: the phone has gone.
    if (message.type === "restart-ice" && !app.senderConnected) {
      stopMirroring();
      return;
    }
    signaling.send(message);
  },
  onStateChange: function (state) {
    app.player = state;
    if (state === PlayerState.failed && !app.senderConnected) {
      stopMirroring();
      return;
    }
    followConnection(state);
    render();
  },
});

/**
 * Watches a mirroring connection that dropped. Reconnecting for too long, or failing after it had
 * played, means the phone is gone: shown as stopped (same code). The peer connection is kept, so a
 * late ICE restart from the phone still brings the picture back.
 */
function followConnection(state) {
  if (state === PlayerState.reconnecting) {
    if (!giveUpTimer && !app.lost) {
      giveUpTimer = setTimeout(function () {
        giveUpTimer = null;
        if (app.player === PlayerState.reconnecting || app.player === PlayerState.failed) {
          log("connection lost for " + GIVE_UP_AFTER_MS / 1000 + " s: phone gone");
          app.lost = true;
          app.activity = "mirroring";
          render();
        }
      }, GIVE_UP_AFTER_MS);
    }
    return;
  }
  if (state === PlayerState.failed && player.hadFrame) {
    // It had played: not a Wi-Fi setup problem ("same Wi-Fi" error), the phone went away.
    log("connection failed after playing: phone gone");
    clearGiveUpTimer();
    app.lost = true;
    app.activity = "mirroring";
    return;
  }
  clearGiveUpTimer();
  if (state === PlayerState.playing || state === PlayerState.idle || state === PlayerState.connecting) app.lost = false;
}

function clearGiveUpTimer() {
  if (giveUpTimer) clearTimeout(giveUpTimer);
  giveUpTimer = null;
}

const media = new MediaPlayer(video, {
  image: $("image"),
  youtube: $("youtube"),
  log: log,
  forceHlsJs: /(^|[?&])hlsjs=1(&|$)/.test(location.search), // testing hls.js where HLS is native
  onStatus: function (status) {
    signaling.send(status);
    renderSound(); // YouTube's mute state changes without events
  },
  onStateChange: function (state) {
    app.media = state;
    if (state === MediaState.ended) app.stopped = true;
    render();
  },
});

// MARK: Signaling

/** Tells a phone that just joined what this browser plays, and what's playing. */
function greetSender() {
  signaling.send(capabilities(video));
  media.sendStatus();
}

function onRoom(room) {
  if (launchedByApp && room.code !== launchedCode) {
    // The app's room has ended, so the server opened a new one: that's for people typing codes.
    log("app's room ended");
    signaling.stop();
    signaling.forgetRoom();
    app.sessionEnded = true;
    render();
    return;
  }
  const newCode = !app.room || app.room.code !== room.code;
  app.room = room;
  app.senderConnected = room.senderConnected === true;
  player.setIceServers(room.iceServers);
  if (newCode) {
    log("room " + room.code);
    app.stopped = false;
    player.close();
    renderCode(room.code);
    renderQR(location.origin + "/c/" + room.code);
  } else {
    log("rejoined room");
  }
  if (app.senderConnected) greetSender();
  render();
}

function onSignalingMessage(message) {
  switch (message.type) {
    case "peer-joined":
      if (message.role === "sender") {
        log("phone connected");
        app.senderConnected = true;
        if (!media.active) app.stopped = false;
        greetSender();
      }
      break;
    case "peer-left":
      if (message.role === "sender") {
        log("phone left");
        app.senderConnected = false;
        // A link plays on without the phone (it may be in the background). WebRTC media is
        // peer-to-peer: if it's still flowing, the phone's signaling socket may just be
        // reconnecting. Otherwise the phone has stopped.
        if (!media.active && app.player !== PlayerState.playing) stopMirroring();
      }
      break;
    case "bye":
      log("phone left");
      app.senderConnected = false;
      media.stop();
      stopMirroring();
      break;
    case "offer":
      if (!window.RTCPeerConnection) break; // a page opened for a link, in a browser without WebRTC
      app.senderConnected = true;
      app.stopped = false;
      app.activity = "mirroring";
      media.stop();
      player.handle(message);
      break;
    case "media-load":
      log("phone sent a link");
      app.senderConnected = true;
      app.stopped = false;
      app.activity = "media";
      clearGiveUpTimer();
      app.lost = false;
      player.close();
      app.player = PlayerState.idle;
      media.load(message);
      break;
    case "media-control":
      media.control(message);
      break;
    case "media-stop":
      log("phone stopped the link");
      media.stop();
      app.stopped = true;
      break;
    case "candidate":
      player.handle(message);
      break;
  }
  render();
}

function stopMirroring() {
  clearGiveUpTimer();
  player.close();
  app.player = PlayerState.idle;
  app.lost = false;
  app.stopped = true;
  render();
}

// MARK: Rendering

function currentView() {
  if (!window.RTCPeerConnection && !launchedByApp) return { screen: "message", title: strings.unsupported };
  if (app.status === "replaced") {
    return { screen: "message", title: strings.replacedTitle, hint: strings.replacedHint, action: strings.useThisWindow, onAction: restartSignaling };
  }
  if (launchedByApp && (app.sessionEnded || app.status === "closed")) {
    return { screen: "app", variant: "ended" };
  }
  if (app.status === "closed") {
    return { screen: "message", title: strings.roomClosedTitle, action: strings.newCode, onAction: restartSignaling };
  }
  if (app.player === PlayerState.playing) return { screen: "playing" };
  if (app.player === PlayerState.reconnecting && !app.lost) return { screen: "playing" };
  if (media.active) return { screen: "playing" };
  if (!app.room) return { screen: "connecting" };
  if (app.media === MediaState.error) {
    return { screen: "message", title: strings.mediaFailedTitle, hint: launchedByApp ? strings.appMediaFailedHint : strings.mediaFailedHint };
  }
  const screen = launchedByApp ? "app" : "code";
  if (app.lost) return { screen: screen, variant: "stopped" };
  if (app.player === PlayerState.failed) {
    return { screen: "message", title: strings.iceFailed, action: strings.tryAgain, onAction: function () { player.retry(); } };
  }
  if (app.player === PlayerState.connecting) return { screen: screen, variant: "starting" };
  // Before "phone connected": the app stays in the room for a moment after stopping a link.
  if (app.stopped) return { screen: screen, variant: "stopped" };
  if (app.senderConnected) return { screen: screen, variant: "starting" };
  return { screen: screen, variant: "waiting" };
}

let messageAction = null;

function render() {
  const view = currentView();
  const body = document.body;
  const screenChanged = app.screen !== view.screen;
  app.screen = view.screen;
  body.setAttribute("data-screen", view.screen);
  body.setAttribute("data-variant", view.variant || "");
  // What the playing screen shows: the <video> (mirroring, a video link), an image or YouTube.
  body.setAttribute("data-media", media.active ? media.kind : "");

  const offlineText = app.status === "offline" ? strings.offline : app.status === "reconnecting" ? strings.reconnecting : "";

  if (view.screen === "connecting") {
    $("connecting-text").textContent = offlineText || strings.connecting;
  } else if (view.screen === "code") {
    const stoppedMedia = app.activity === "media";
    const titles = { waiting: strings.codeTitle, starting: strings.starting, stopped: stoppedMedia ? strings.mediaStoppedTitle : strings.stoppedTitle };
    const hints = { waiting: "", starting: strings.startingHint, stopped: stoppedMedia ? strings.mediaStoppedHint : strings.stoppedHint };
    $("code-title").textContent = titles[view.variant];
    $("code-hint").textContent = hints[view.variant];
    $("code-status").textContent = offlineText;
  } else if (view.screen === "app") {
    const texts = {
      waiting: [strings.appWaitingTitle, strings.appWaitingHint],
      starting: [strings.appStartingTitle, strings.appStartingHint],
      stopped: [strings.appStoppedTitle, strings.appStoppedHint],
      ended: [strings.appEndedTitle, strings.appEndedHint],
    }[view.variant];
    $("app-title").textContent = texts[0];
    $("app-hint").textContent = texts[1];
    $("app-status").textContent = view.variant === "ended" ? "" : offlineText;
    const useCode = $("app-use-code");
    useCode.hidden = view.variant !== "ended";
    if (screenChanged && view.variant === "ended") useCode.focus();
  } else if (view.screen === "message") {
    $("message-title").textContent = view.title;
    $("message-hint").textContent = view.hint || "";
    const button = $("message-action");
    button.hidden = !view.action;
    button.textContent = view.action || "";
    messageAction = view.onAction || null;
    if (screenChanged && view.action) button.focus();
  }

  const toast = $("toast");
  const reconnecting = view.screen === "playing" && app.player === PlayerState.reconnecting;
  const loading = view.screen === "playing" && app.media === MediaState.loading;
  toast.textContent = reconnecting ? strings.reconnecting : loading ? strings.loading : "";
  toast.className = reconnecting || loading ? "toast visible" : "toast";

  if (view.screen === "playing") {
    if (screenChanged) {
      showControls();
      if ($("sound").hidden) $("fullscreen").focus(); else $("sound").focus();
    }
  }
  renderSound();
  updateWakeLock(view.screen === "playing");
}

/** The code in boxes, like the ones it's typed into on the phone: "769 397" → 7 6 9 – 3 9 7. */
function renderCode(code) {
  const box = $("code");
  const digits = String(code);
  box.innerHTML = "";
  box.setAttribute("aria-label", spacedCode(digits));
  for (let i = 0; i < digits.length; i++) {
    if (i === Math.floor(digits.length / 2)) {
      const dash = document.createElement("span");
      dash.className = "dash";
      dash.setAttribute("aria-hidden", "true");
      box.appendChild(dash);
    }
    const digit = document.createElement("span");
    digit.className = "digit";
    digit.setAttribute("aria-hidden", "true");
    digit.textContent = digits.charAt(i);
    box.appendChild(digit);
  }
}

function renderQR(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) path += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
    }
  }
  $("qr").innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges" role="img" aria-label="' + text + '">' +
    '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
}

function restartSignaling() {
  clearGiveUpTimer();
  app.lost = false;
  player.close();
  media.stop();
  app.player = PlayerState.idle;
  app.room = null;
  app.stopped = false;
  app.senderConnected = false;
  signaling.restart();
}

// MARK: Controls (sound, fullscreen, auto-hide)

function renderSound() {
  const button = $("sound");
  const muted = media.active ? media.isMuted() : video.muted;
  button.hidden = media.active && media.kind === "image";
  button.textContent = muted ? strings.tapForSound : strings.mute;
  button.className = muted ? "button primary" : "button";
}

// A link may start muted (autoplay with sound refused) after the screen rendered.
video.addEventListener("volumechange", renderSound);

$("sound").addEventListener("click", function () {
  if (media.active) {
    media.setMuted(!media.isMuted());
  } else {
    video.muted = !video.muted;
    if (!video.muted) {
      const played = video.play();
      if (played && played.catch) played.catch(function () {});
    }
  }
  renderSound();
});

// Ended: this page becomes a normal smrr.tv page (a new room with a code).
$("app-use-code").addEventListener("click", function () {
  signaling.forgetRoom();
  location.replace("/");
});

$("message-action").addEventListener("click", function () {
  if (messageAction) messageAction();
});

const fullscreen = {
  element: function () { return document.fullscreenElement || document.webkitFullscreenElement || null; },
  supported: function () {
    const root = document.documentElement;
    return !!(root.requestFullscreen || root.webkitRequestFullscreen || video.webkitEnterFullscreen);
  },
  toggle: function () {
    const root = document.documentElement;
    if (fullscreen.element()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (root.requestFullscreen) {
      const p = root.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen(); // iPhone Safari: only the video element can go full screen
    }
  },
};

function renderFullscreen() {
  const button = $("fullscreen");
  button.hidden = !fullscreen.supported();
  button.textContent = fullscreen.element() ? strings.exitFullscreen : strings.fullscreen;
}
$("fullscreen").addEventListener("click", fullscreen.toggle);
video.addEventListener("dblclick", fullscreen.toggle);
document.addEventListener("fullscreenchange", renderFullscreen);
document.addEventListener("webkitfullscreenchange", renderFullscreen);

let idleTimer = null;
function showControls() {
  document.body.classList.remove("idle");
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(function () { document.body.classList.add("idle"); }, IDLE_AFTER_MS);
}
["mousemove", "pointerdown", "touchstart", "wheel"].forEach(function (type) {
  document.addEventListener(type, showControls, { passive: true });
});
document.addEventListener("keydown", function (event) {
  // While the controls are hidden, the first key press (TV remote) only shows them.
  const hidden = document.body.classList.contains("idle") && app.screen === "playing";
  showControls();
  if (hidden) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// MARK: Screen Wake Lock (keeps a laptop / tablet display on while playing)

let wakeLock = null;
let wantWakeLock = false;

function updateWakeLock(want) {
  wantWakeLock = want;
  if (want && !wakeLock) requestWakeLock();
  if (!want && wakeLock) {
    const lock = wakeLock;
    wakeLock = null;
    lock.release().catch(function () {});
  }
}

function requestWakeLock() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  navigator.wakeLock.request("screen").then(function (lock) {
    if (!wantWakeLock) {
      lock.release().catch(function () {});
      return;
    }
    wakeLock = lock;
    lock.addEventListener("release", function () {
      if (wakeLock === lock) wakeLock = null;
    });
  }).catch(function (error) {
    log("wake lock: " + error.name);
  });
}

// The browser drops the lock when the tab is hidden; take it again when it's back.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && wantWakeLock && !wakeLock) requestWakeLock();
});

// MARK: Debug overlay (?debug=1)

const fmt = function (x, digits) {
  return x === undefined || x === null || isNaN(x) ? "–" : Number(x).toFixed(digits || 0);
};

async function renderDebug() {
  const s = await player.stats();
  const V = s.video || {};
  const A = s.audio || {};
  const P = s.pair || {};
  $("debug").textContent = [
    "smrr.tv  room " + (app.room ? app.room.code : "–") + "  signaling " + app.status +
      "  phone " + (app.senderConnected ? "connected" : "–") + "  player " + s.state + "  ICE " + s.ice,
    "",
    "VIDEO  " + fmt(V.fps) + " fps  " + (V.width || "–") + "x" + (V.height || "–") + "  " + fmt(V.mbps, 2) + " Mbit/s  " + (V.codec || ""),
    "       jitter buffer " + fmt(V.jitterBufferMs, 1) + " ms (avg " + fmt(V.jitterBufferAvgMs, 1) + ")  decode " + fmt(V.decodeMs, 2) +
      " ms  receive→display " + fmt(s.receiveToDisplayMs, 1) + " ms  [" + s.jitterBufferTarget + "]",
    "       dropped " + fmt(V.dropped) + "  freezes " + fmt(V.freezes) + " (" + fmt(V.freezeS, 2) + " s)  lost " + fmt(V.lost) +
      "  nack " + fmt(V.nack) + "  pli " + fmt(V.pli) + (V.decoder ? "  decoder " + V.decoder : ""),
    "AUDIO  " + (A.codec || "–") + "  jitter " + fmt(A.jitterMs, 1) + " ms  jitter buffer " + fmt(A.jitterBufferMs, 0) +
      " ms  concealed " + fmt(A.concealedPct, 2) + " %  A/V offset " + fmt(s.avOffsetMs) + " ms",
    "NET    rtt " + fmt(P.rttMs, 1) + " ms  " + (s.pair ? P.local + " ⇄ " + P.remote : "no candidate pair"),
    "       candidates: browser " + s.localCandidates + ", phone " + s.remoteCandidates +
      "  offer→first frame " + fmt(s.offerToFirstFrameMs) + " ms",
    "LINK   " + mediaLine(),
    "",
  ].concat(events).join("\n");
}

function mediaLine() {
  const status = media.status();
  if (!status) return media.state;
  const player = media.kind === "video" ? (media.hls ? "hls.js" : "native") + "  " + (video.videoWidth || "–") + "x" + (video.videoHeight || "–") : "";
  return media.kind + "  " + status.state + (status.error ? " (" + status.error + ")" : "") + "  " + fmt(status.time, 1) + " s" +
    (status.duration ? " / " + fmt(status.duration, 1) + " s" : "") + (status.muted ? "  muted" : "") + "  " + player;
}

// MARK: Start

document.title = launchedByApp ? strings.appPageTitle : strings.pageTitle;
$("app-brand").textContent = strings.appBrand;
$("app-use-code").textContent = strings.appUseCode;
$("brand").textContent = strings.brand;
$("code-label").textContent = strings.codeLabel;
$("qr-hint").textContent = strings.qrHint;
$("code-wifi").textContent = strings.sameWifi;
$("steps").innerHTML = "";
strings.steps.forEach(function (step) {
  const li = document.createElement("li");
  li.textContent = step;
  $("steps").appendChild(li);
});
renderFullscreen();

if (debug) {
  window.smrr = { app: app, player: player, media: media, signaling: signaling }; // for the console and tools/e2e.mjs
  $("debug").hidden = false;
  setInterval(function () { renderDebug().catch(function () {}); }, 1000);
}

render();
// Links (channels) play without WebRTC: a page the app opened for one connects anyway.
if (window.RTCPeerConnection || launchedByApp) signaling.start();
