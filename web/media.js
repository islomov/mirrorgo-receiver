// Media player: plays a link the phone sends (`media-load`, e.g. an IPTV channel) in the page's own
// <video>. The browser fetches it itself, so the phone isn't needed while it plays (it can go to the
// background, or away). Reports how it's going (`media-status`) through `onStatus`.
//
// HLS: the browser's own player when it has one (Safari, smart TV browsers; no CORS needed), else
// hls.js over Media Source Extensions (loaded on first use; the stream's host must allow CORS). A
// native player that fails gets one more try with hls.js.
//
//   const media = new MediaPlayer(video, {
//     onStatus(status) { ... },        // send to the phone: {type: "media-status", ...}
//     onStateChange(state) { ... },    // see MediaState
//   });
//   media.load(message);               // media-load from the phone
//   media.control(message);            // media-control
//   media.stop();                      // media-stop
//
// Written for older TV browsers too: no optional chaining, no class fields.

/**
 * idle      nothing loaded
 * loading   loading or buffering
 * playing
 * paused
 * ended     played to the end
 * error     couldn't play it (`error`: unsupported | network | decode)
 */
export const MediaState = {
  idle: "idle",
  loading: "loading",
  playing: "playing",
  paused: "paused",
  ended: "ended",
  error: "error",
};

const STATUS_EVERY_MS = 2000;
const HLS_SCRIPT = "/vendor/hls.min.js";

/** What this browser can play, for the phone (`capabilities`). */
export function capabilities(video) {
  return {
    type: "capabilities",
    v: 1,
    webrtc: !!window.RTCPeerConnection,
    hls: nativeHls(video) ? "native" : mediaSourceSupported() ? "hls.js" : "none",
    mp4: canPlay(video, 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    screen: { width: window.screen ? screen.width : 0, height: window.screen ? screen.height : 0 },
  };
}

export class MediaPlayer {
  constructor(video, options) {
    this.video = video;
    this.onStatus = options.onStatus || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.log = options.log || function () {};
    this.forceHlsJs = options.forceHlsJs === true;
    this.state = MediaState.idle;
    this.current = null;      // the media-load message playing
    this.error = null;
    this.hls = null;
    this.triedHlsJs = false;
    this.recoveredOnce = false;
    this.statusTimer = null;

    const self = this;
    const on = function (type, handler) {
      video.addEventListener(type, function () {
        // The same <video> shows the mirrored screen: only our own playback counts.
        if (self.current && !video.srcObject) handler();
      });
    };
    on("playing", function () { self.setState(MediaState.playing); });
    on("waiting", function () { if (!video.paused) self.setState(MediaState.loading); });
    on("pause", function () { if (!video.ended && self.state !== MediaState.error) self.setState(MediaState.paused); });
    on("ended", function () { self.setState(MediaState.ended); });
    on("error", function () { self.onVideoError(); });
    on("loadedmetadata", function () {
      const start = self.current.start;
      if (start > 0 && !self.current.live && isFinite(video.duration)) {
        try { video.currentTime = Math.min(start, video.duration); } catch (e) { /* not seekable yet */ }
      }
    });
  }

  get active() {
    return this.state === MediaState.loading || this.state === MediaState.playing || this.state === MediaState.paused;
  }

  /** `media-load {id, url, mime, live, title, start}`: replaces whatever plays. */
  load(message) {
    this.stop();
    const url = typeof message.url === "string" ? message.url : "";
    this.current = {
      id: message.id,
      url: url,
      mime: typeof message.mime === "string" ? message.mime : "",
      live: message.live === true,
      title: typeof message.title === "string" ? message.title : "",
      start: typeof message.start === "number" ? message.start : 0,
    };
    this.triedHlsJs = false;
    this.recoveredOnce = false;
    this.setState(MediaState.loading);
    this.startStatusTimer();

    if (!/^https?:\/\//i.test(url)) {
      this.fail("unsupported", "not an http(s) link");
      return;
    }
    const video = this.video;
    video.srcObject = null;
    video.loop = false;

    if (!isHls(this.current)) {
      this.log("media: playing " + shortURL(url));
      video.src = url;
      this.play();
    } else if (nativeHls(video) && !(this.forceHlsJs && mediaSourceSupported())) {
      this.log("media: native HLS " + shortURL(url));
      video.src = url;
      this.play();
    } else if (mediaSourceSupported()) {
      this.playWithHlsJs();
    } else {
      this.fail("unsupported", "no HLS player in this browser");
    }
  }

  /** `media-control {action: "play" | "pause" | "seek", time}` */
  control(message) {
    if (!this.current) return;
    const video = this.video;
    if (message.action === "pause") {
      video.pause();
    } else if (message.action === "play") {
      this.play();
    } else if (message.action === "seek" && typeof message.time === "number" && !this.current.live) {
      try { video.currentTime = message.time; } catch (e) { /* not seekable */ }
    }
    this.sendStatus();
  }

  /** Stops and forgets what was playing (`media-stop`, or something else takes the screen). */
  stop() {
    if (!this.current && this.state === MediaState.idle) return;
    // Forgotten first: the events emptying the <video> fires aren't ours any more.
    this.current = null;
    this.error = null;
    this.stopStatusTimer();
    this.destroyHls();
    const video = this.video;
    if (!video.srcObject) {
      video.pause();
      video.removeAttribute("src");
      try { video.load(); } catch (e) { /* nothing loaded */ }
    }
    this.setState(MediaState.idle);
  }

  /** The `media-status` message for what's loaded, or null. */
  status() {
    if (!this.current) return null;
    const video = this.video;
    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const status = {
      type: "media-status",
      id: this.current.id,
      state: this.state,
      time: isFinite(video.currentTime) ? Math.round(video.currentTime * 10) / 10 : null,
      duration: this.current.live ? null : duration,
      muted: video.muted,
    };
    if (this.error) status.error = this.error;
    return status;
  }

  sendStatus() {
    const status = this.status();
    if (status) this.onStatus(status);
  }

  // MARK: Playing

  /** With sound if the browser lets us, else muted (the page's sound button unmutes). */
  play() {
    const video = this.video;
    const self = this;
    const current = this.current;
    video.muted = false;
    const played = video.play();
    if (!played || !played.catch) return; // old browsers: no promise
    played.catch(function (error) {
      if (self.current !== current || (error && error.name === "AbortError")) return;
      self.log("media: autoplay with sound refused, playing muted");
      video.muted = true;
      const again = video.play();
      if (again && again.catch) again.catch(function () { /* the play button / sound button starts it */ });
      self.sendStatus();
    });
  }

  playWithHlsJs() {
    const self = this;
    const current = this.current;
    this.triedHlsJs = true;
    this.setState(MediaState.loading);
    this.log("media: hls.js " + shortURL(current.url));
    loadHlsJs().then(function (Hls) {
      if (self.current !== current) return;
      if (!Hls || !Hls.isSupported()) {
        self.fail("unsupported", "hls.js not supported here");
        return;
      }
      const hls = new Hls({ liveDurationInfinity: true, backBufferLength: 30 });
      self.hls = hls;
      hls.on(Hls.Events.ERROR, function (_event, data) {
        if (self.hls !== hls || !data.fatal) return;
        self.log("media: hls.js " + data.type + " " + data.details);
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !self.recoveredOnce) {
          self.recoveredOnce = true;
          hls.recoverMediaError();
          return;
        }
        self.fail(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : data.type === Hls.ErrorTypes.MEDIA_ERROR ? "decode" : "unsupported", data.details);
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        if (self.hls === hls) self.play();
      });
      hls.loadSource(current.url);
      hls.attachMedia(self.video);
    }, function () {
      if (self.current === current) self.fail("unsupported", "couldn't load hls.js");
    });
  }

  onVideoError() {
    if (this.hls) return; // hls.js reports its own errors
    const error = this.video.error;
    const code = error ? error.code : 0;
    this.log("media: video error " + code + (error && error.message ? " " + error.message : ""));
    // A native HLS player that can't: hls.js may.
    if (isHls(this.current) && !this.triedHlsJs && mediaSourceSupported()) {
      this.video.removeAttribute("src");
      try { this.video.load(); } catch (e) { /* nothing loaded */ }
      this.playWithHlsJs();
      return;
    }
    // 2 network, 3 decode, 4 not supported (also what a failed download looks like)
    this.fail(code === 3 ? "decode" : code === 2 ? "network" : "unsupported", "video element error " + code);
  }

  fail(kind, detail) {
    if (!this.current || this.state === MediaState.error) return;
    this.log("media: failed (" + kind + "): " + detail);
    this.error = kind;
    this.destroyHls();
    this.stopStatusTimer();
    this.setState(MediaState.error);
  }

  destroyHls() {
    if (!this.hls) return;
    const hls = this.hls;
    this.hls = null;
    try { hls.destroy(); } catch (e) { /* already gone */ }
  }

  // MARK: State

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.sendStatus();
    this.onStateChange(state);
  }

  startStatusTimer() {
    this.stopStatusTimer();
    const self = this;
    this.statusTimer = setInterval(function () { self.sendStatus(); }, STATUS_EVERY_MS);
  }

  stopStatusTimer() {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
  }
}

// MARK: Helpers

function isHls(item) {
  return !!item && (/mpegurl/i.test(item.mime) || /\.m3u8($|[?#])/i.test(item.url));
}

function canPlay(video, type) {
  try { return video.canPlayType(type) !== ""; } catch (e) { return false; }
}

function nativeHls(video) {
  return canPlay(video, "application/vnd.apple.mpegurl") || canPlay(video, "application/x-mpegURL");
}

function mediaSourceSupported() {
  return !!(window.MediaSource || window.ManagedMediaSource || window.WebKitMediaSource);
}

let hlsPromise = null;

/** Loads hls.js once (a classic script: it sets window.Hls). */
function loadHlsJs() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsPromise) {
    hlsPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = HLS_SCRIPT;
      script.async = true;
      script.onload = function () { resolve(window.Hls); };
      script.onerror = function () {
        hlsPromise = null;
        reject(new Error("hls.js didn't load"));
      };
      document.head.appendChild(script);
    });
  }
  return hlsPromise;
}

/** Host and file name only: links can carry tokens. */
function shortURL(url) {
  const match = /^https?:\/\/([^/?#]+)[^?#]*?([^/?#]*)(?:[?#].*)?$/i.exec(url);
  return match ? match[1] + "/…/" + match[2] : "?";
}
