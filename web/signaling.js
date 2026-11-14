// The viewer's signaling socket to the smrr.tv Worker (see PROTOCOL.md): opens or rejoins a room,
// keeps it alive with pings, and reconnects with backoff after network drops.

const SESSION_KEY = "smrr.room";
const PING_EVERY_MS = 20000;
/** No message (not even a pong) for this long → the socket is dead, reconnect. */
const DEAD_AFTER_MS = 50000;
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000];

export const CloseCode = { replaced: 4001, roomClosed: 4004, expired: 4008 };

/**
 * Events (all optional):
 *   onRoom(room)          `room` message: {code, viewerToken, iceServers, senderConnected}
 *   onMessage(message)    anything else from the server (peer-joined, offer, candidate, bye, ...)
 *   onStatus(status)      "connecting" | "open" | "reconnecting" | "offline" | "replaced" | "closed"
 */
export class SignalingClient {
  constructor(options) {
    this.url = options.url;
    this.onRoom = options.onRoom || function () {};
    this.onMessage = options.onMessage || function () {};
    this.onStatus = options.onStatus || function () {};
    this.log = options.log || function () {};
    this.ws = null;
    this.failures = 0;
    this.retryTimer = null;
    this.pingTimer = null;
    this.lastSeen = 0;
    this.stopped = true;

    const self = this;
    window.addEventListener("online", function () {
      if (!self.stopped && self.retryTimer) self.reconnectNow();
    });
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) this.ws.close(1000);
    this.ws = null;
  }

  /** Forgets the stored room, so the next connection gets a new code. */
  forgetRoom() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* storage disabled */ }
  }

  send(message) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(message));
  }

  // MARK: Connection

  connect() {
    this.clearTimers();
    this.onStatus(this.failures === 0 ? "connecting" : this.failures < 3 ? "reconnecting" : "offline");

    let url = this.url + "?role=viewer";
    const saved = loadRoom();
    if (saved) url += "&code=" + encodeURIComponent(saved.code) + "&token=" + encodeURIComponent(saved.viewerToken);

    let ws;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      this.log("WebSocket: " + error);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    const self = this;

    ws.onopen = function () {
      if (ws !== self.ws) return;
      self.lastSeen = Date.now();
      ws.send(JSON.stringify({ type: "hello", v: 1, role: "viewer", userAgent: navigator.userAgent }));
      self.pingTimer = setInterval(function () { self.ping(ws); }, PING_EVERY_MS);
    };
    ws.onmessage = function (event) {
      if (ws !== self.ws) return;
      self.lastSeen = Date.now();
      let message;
      try { message = JSON.parse(event.data); } catch (e) { return; }
      if (!message || typeof message.type !== "string" || message.type === "pong") return;
      if (message.type === "room") {
        self.failures = 0;
        saveRoom(message.code, message.viewerToken);
        self.onStatus("open");
        self.onRoom(message);
      } else {
        self.onMessage(message);
      }
    };
    ws.onerror = function () { /* onclose follows */ };
    ws.onclose = function (event) {
      if (ws !== self.ws) return;
      self.ws = null;
      self.clearTimers();
      if (self.stopped) return;
      self.log("signaling closed " + event.code + (event.reason ? " " + event.reason : ""));
      if (event.code === CloseCode.replaced) {
        self.stopped = true;
        self.onStatus("replaced");
      } else if (event.code === CloseCode.roomClosed) {
        self.stopped = true;
        self.forgetRoom();
        self.onStatus("closed");
      } else if (event.code === CloseCode.expired) {
        self.forgetRoom();
        self.failures = 0;
        self.connect(); // a new room, new code
      } else {
        self.scheduleReconnect();
      }
    };
  }

  ping(ws) {
    if (ws !== this.ws || ws.readyState !== 1) return;
    if (Date.now() - this.lastSeen > DEAD_AFTER_MS) {
      this.log("no pong: reconnecting");
      this.ws = null;
      ws.onclose = null;
      try { ws.close(); } catch (e) { /* already closing */ }
      this.scheduleReconnect();
      return;
    }
    ws.send('{"type":"ping"}');
  }

  scheduleReconnect() {
    this.clearTimers();
    const base = BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length - 1)];
    this.failures++;
    this.onStatus(this.failures < 3 ? "reconnecting" : "offline");
    const self = this;
    this.retryTimer = setTimeout(function () {
      self.retryTimer = null;
      self.connect();
    }, base + Math.random() * base * 0.3);
  }

  reconnectNow() {
    this.clearTimers();
    this.connect();
  }

  /** Starts again after "replaced" / "closed" (a user action). */
  restart() {
    this.stop();
    this.failures = 0;
    this.start();
  }

  clearTimers() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
  }
}

function loadRoom() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (saved && /^\d{6}$/.test(saved.code) && /^[0-9a-f]{32}$/.test(saved.viewerToken)) return saved;
  } catch (e) { /* storage disabled or corrupt */ }
  return null;
}

function saveRoom(code, viewerToken) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: code, viewerToken: viewerToken })); } catch (e) { /* storage disabled */ }
}
