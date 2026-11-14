// smrr.tv page: shows a code, waits for MirrorGo on the iPhone and plays its screen.
// States: connecting → code → starting (phone connected) → playing → stopped (same code) / error.
// Signaling: signaling.js, WebRTC: player.js, strings: strings.js, protocol: PROTOCOL.md.

import { strings, spacedCode } from "./strings.js";
import { SignalingClient } from "./signaling.js";
import { WebRTCPlayer, PlayerState } from "./player.js";
import qrcode from "./vendor/qrcode.js";

const $ = function (id) { return document.getElementById(id); };
const video = $("video");
const debug = /(^|[?&])debug=1(&|$)/.test(location.search);
const IDLE_AFTER_MS = 3000;

const app = {
  status: "connecting",   // signaling: connecting | open | reconnecting | offline | replaced | closed
  room: null,             // the `room` message
  senderConnected: false,
  stopped: false,         // the phone stopped mirroring (keeps the code)
  player: PlayerState.idle,
  screen: null,
};

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
    render();
  },
});

// MARK: Signaling

function onRoom(room) {
  const newCode = !app.room || app.room.code !== room.code;
  app.room = room;
  app.senderConnected = room.senderConnected === true;
  player.setIceServers(room.iceServers);
  if (newCode) {
    log("room " + room.code);
    app.stopped = false;
    player.close();
    $("code").textContent = spacedCode(room.code);
    renderQR(location.origin + "/c/" + room.code);
  } else {
    log("rejoined room");
  }
  render();
}

function onSignalingMessage(message) {
  switch (message.type) {
    case "peer-joined":
      if (message.role === "sender") {
        log("phone connected");
        app.senderConnected = true;
        app.stopped = false;
      }
      break;
    case "peer-left":
      if (message.role === "sender") {
        log("phone left");
        app.senderConnected = false;
        // Media is peer-to-peer: if it's still flowing, the phone's signaling socket may just be
        // reconnecting. Otherwise the phone has stopped.
        if (app.player !== PlayerState.playing) stopMirroring();
      }
      break;
    case "bye":
      log("phone stopped mirroring");
      app.senderConnected = false;
      stopMirroring();
      break;
    case "offer":
      app.senderConnected = true;
      app.stopped = false;
      player.handle(message);
      break;
    case "candidate":
      player.handle(message);
      break;
  }
  render();
}

function stopMirroring() {
  player.close();
  app.player = PlayerState.idle;
  app.stopped = true;
  render();
}

// MARK: Rendering

function currentView() {
  if (!window.RTCPeerConnection) return { screen: "message", title: strings.unsupported };
  if (app.status === "replaced") {
    return { screen: "message", title: strings.replacedTitle, hint: strings.replacedHint, action: strings.useThisWindow, onAction: restartSignaling };
  }
  if (app.status === "closed") {
    return { screen: "message", title: strings.roomClosedTitle, action: strings.newCode, onAction: restartSignaling };
  }
  if (app.player === PlayerState.playing || app.player === PlayerState.reconnecting) return { screen: "playing" };
  if (!app.room) return { screen: "connecting" };
  if (app.player === PlayerState.failed) {
    return { screen: "message", title: strings.iceFailed, action: strings.tryAgain, onAction: function () { player.retry(); } };
  }
  if (app.senderConnected || app.player === PlayerState.connecting) return { screen: "code", variant: "starting" };
  if (app.stopped) return { screen: "code", variant: "stopped" };
  return { screen: "code", variant: "waiting" };
}

let messageAction = null;

function render() {
  const view = currentView();
  const body = document.body;
  const screenChanged = app.screen !== view.screen;
  app.screen = view.screen;
  body.setAttribute("data-screen", view.screen);
  body.setAttribute("data-variant", view.variant || "");

  const offlineText = app.status === "offline" ? strings.offline : app.status === "reconnecting" ? strings.reconnecting : "";

  if (view.screen === "connecting") {
    $("connecting-text").textContent = offlineText || strings.connecting;
  } else if (view.screen === "code") {
    const titles = { waiting: strings.codeTitle, starting: strings.starting, stopped: strings.stoppedTitle };
    const hints = { waiting: "", starting: strings.startingHint, stopped: strings.stoppedHint };
    $("code-title").textContent = titles[view.variant];
    $("code-hint").textContent = hints[view.variant];
    $("code-status").textContent = offlineText;
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
  toast.textContent = reconnecting ? strings.reconnecting : "";
  toast.className = reconnecting ? "toast visible" : "toast";

  if (view.screen === "playing") {
    if (screenChanged) {
      showControls();
      $("sound").focus();
    }
  }
  renderSound();
  updateWakeLock(view.screen === "playing");
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
  player.close();
  app.player = PlayerState.idle;
  app.room = null;
  app.stopped = false;
  app.senderConnected = false;
  signaling.restart();
}

// MARK: Controls (sound, fullscreen, auto-hide)

function renderSound() {
  const button = $("sound");
  button.textContent = video.muted ? strings.tapForSound : strings.mute;
  button.className = video.muted ? "button primary" : "button";
}

$("sound").addEventListener("click", function () {
  video.muted = !video.muted;
  if (!video.muted) {
    const played = video.play();
    if (played && played.catch) played.catch(function () {});
  }
  renderSound();
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
    "",
  ].concat(events).join("\n");
}

// MARK: Start

document.title = strings.pageTitle;
$("brand").textContent = strings.brand;
$("code-label").textContent = strings.codeLabel;
$("qr-hint").textContent = strings.qrHint;
$("steps").innerHTML = "";
strings.steps.forEach(function (step) {
  const li = document.createElement("li");
  li.textContent = step;
  $("steps").appendChild(li);
});
renderFullscreen();

if (debug) {
  window.smrr = { app: app, player: player, signaling: signaling }; // for the console and tools/e2e.mjs
  $("debug").hidden = false;
  setInterval(function () { renderDebug().catch(function () {}); }, 1000);
}

render();
if (window.RTCPeerConnection) signaling.start();
