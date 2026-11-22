// Media player: shows what the phone sends as a link (`media-load`) in the page itself. The browser
// smrr.tv/googletv's own copy: smrr.tv in a browser (web/media.js) and the other TVs have theirs.
// fetches it, so the phone isn't needed while it plays (it can go to the background, or away).
// Reports how it's going (`media-status`) through `onStatus`. Kinds:
//
// - video (IPTV channels): the page's <video>. HLS: the browser's own player when it has one
//   (Safari, smart TV browsers; no CORS needed), else hls.js over Media Source Extensions (loaded on
//   first use; the stream's host must allow CORS). A native player that fails gets one more try
//   with hls.js.
// - image (web images): an <img>; `fallbackUrl` (a thumbnail) if the image itself doesn't load.
// - youtube (`videoId`, `start`): YouTube's embedded player (IFrame API, loaded on first use).
//
//   const media = new MediaPlayer(video, {
//     image, youtube,                  // the <img> and the YouTube player's container
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
 * error     couldn't play it (`error`: unsupported | network | decode, YouTube: blocked (not
 *           allowed outside YouTube) | unavailable (private or removed))
 * An image is "playing" once it's shown.
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
const YOUTUBE_API = "https://www.youtube.com/iframe_api";
/** YouTube still not playing (autoplay with sound refused): play it muted. */
const YOUTUBE_MUTED_AFTER_MS = 2500;
const YOUTUBE_CHECK_MS = 500;
const KINDS = { video: true, image: true, youtube: true };

/** What this browser can play, for the phone (`capabilities`). */
export function capabilities(video) {
  return {
    type: "capabilities",
    v: 1,
    webrtc: !!window.RTCPeerConnection,
    hls: nativeHls(video) ? "native" : mediaSourceSupported() ? "hls.js" : "none",
    mp4: canPlay(video, 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    screen: { width: window.screen ? screen.width : 0, height: window.screen ? screen.height : 0 },
    // Sends `video-playing` once mirroring shows a frame (MIRR-178): a TV that negotiates H.264 but
    // can't decode it never does, and the phone switches to another way.
    videoPlaying: true,
  };
}

export class MediaPlayer {
  constructor(video, options) {
    this.video = video;
    this.image = options.image;
    this.youtube = options.youtube;      // container; YouTube's iframe goes in its first child
    this.yt = null;                      // the YT.Player, kept for the next video
    this.ytMutedTimer = null;
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
        if (self.current && self.current.kind === "video" && !video.srcObject) handler();
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

  /** What's loaded: "video" | "image" | "youtube", or "". */
  get kind() {
    return this.current ? this.current.kind : "";
  }

  /**
   * `media-load {id, kind, url, mime, live, title, start, fallbackUrl, videoId}`: replaces whatever
   * plays.
   */
  load(message) {
    this.stop();
    const url = typeof message.url === "string" ? message.url : "";
    this.current = {
      id: message.id,
      kind: KINDS[message.kind] ? message.kind : "video",
      url: url,
      mime: typeof message.mime === "string" ? message.mime : "",
      live: message.live === true,
      title: typeof message.title === "string" ? message.title : "",
      start: typeof message.start === "number" ? message.start : 0,
      fallbackUrl: typeof message.fallbackUrl === "string" ? message.fallbackUrl : "",
      videoId: typeof message.videoId === "string" ? message.videoId : "",
    };
    this.triedHlsJs = false;
    this.recoveredOnce = false;
    this.setState(MediaState.loading);
    this.startStatusTimer();

    if (this.current.kind === "youtube") {
      if (/^[\w-]{6,20}$/.test(this.current.videoId)) this.playYouTube();
      else this.fail("unsupported", "no video id");
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      this.fail("unsupported", "not an http(s) link");
      return;
    }
    if (this.current.kind === "image") {
      this.showImage();
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
    if (this.current.kind === "youtube") {
      const yt = this.ytReady();
      if (!yt) return;
      if (message.action === "pause") yt.pauseVideo();
      else if (message.action === "play") yt.playVideo();
      else if (message.action === "seek" && typeof message.time === "number") yt.seekTo(message.time, true);
    } else if (this.current.kind === "image") {
      return;
    } else if (message.action === "pause") {
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
    const kind = this.kind;
    this.current = null;
    this.error = null;
    this.stopStatusTimer();
    this.clearYouTubeTimer();
    this.destroyHls();
    const video = this.video;
    if (kind === "video" && !video.srcObject) {
      video.pause();
      video.removeAttribute("src");
      try { video.load(); } catch (e) { /* nothing loaded */ }
    }
    if (kind === "image" && this.image) {
      this.image.onload = null;
      this.image.onerror = null;
      this.image.removeAttribute("src");
    }
    if (kind === "youtube") {
      const yt = this.ytReady();
      if (yt) yt.stopVideo();
    }
    this.setState(MediaState.idle);
  }

  /** The `media-status` message for what's loaded, or null. */
  status() {
    if (!this.current) return null;
    const status = { type: "media-status", id: this.current.id, state: this.state, time: null, duration: null, muted: this.isMuted() };
    if (this.current.kind === "video") {
      const video = this.video;
      status.time = isFinite(video.currentTime) ? Math.round(video.currentTime * 10) / 10 : null;
      status.duration = !this.current.live && isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    } else if (this.current.kind === "youtube") {
      const yt = this.ytReady();
      if (yt) {
        status.time = Math.round(yt.getCurrentTime() * 10) / 10;
        status.duration = yt.getDuration() > 0 ? yt.getDuration() : null;
      }
    }
    if (this.error) status.error = this.error;
    return status;
  }

  /** Whether what plays has its sound off (an image never has sound). */
  isMuted() {
    if (!this.current || this.current.kind === "image") return false;
    if (this.current.kind === "youtube") {
      const yt = this.ytReady();
      return yt ? yt.isMuted() : false;
    }
    return this.video.muted;
  }

  /** The page's sound button. */
  setMuted(muted) {
    if (!this.current) return;
    if (this.current.kind === "youtube") {
      const yt = this.ytReady();
      if (!yt) return;
      if (muted) yt.mute(); else yt.unMute();
    } else if (this.current.kind === "video") {
      this.video.muted = muted;
      if (!muted) {
        const played = this.video.play();
        if (played && played.catch) played.catch(function () {});
      }
    }
    this.sendStatus();
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

  // MARK: Images

  showImage() {
    const self = this;
    const current = this.current;
    const image = this.image;
    let usedFallback = false;
    this.log("media: image " + shortURL(current.url));
    image.onload = function () {
      if (self.current === current) self.setState(MediaState.playing);
    };
    image.onerror = function () {
      if (self.current !== current) return;
      if (!usedFallback && /^https?:\/\//i.test(current.fallbackUrl)) {
        usedFallback = true;
        self.log("media: image didn't load, showing its thumbnail");
        image.src = current.fallbackUrl;
        return;
      }
      self.fail("network", "image didn't load");
    };
    image.src = current.url;
  }

  // MARK: YouTube

  playYouTube() {
    const self = this;
    const current = this.current;
    this.log("media: YouTube " + current.videoId);
    loadYouTubeApi().then(function () {
      if (self.current !== current) return;
      const start = Math.max(0, Math.floor(current.start));
      if (self.yt && self.yt.loadVideoById) {
        self.yt.unMute();
        self.yt.loadVideoById({ videoId: current.videoId, startSeconds: start });
      } else if (!self.yt) {
        const holder = document.createElement("div");
        self.youtube.innerHTML = "";
        self.youtube.appendChild(holder);
        self.yt = new window.YT.Player(holder, {
          width: "100%",
          height: "100%",
          videoId: current.videoId,
          playerVars: { autoplay: 1, start: start, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3 },
          events: {
            onReady: function (event) {
              self.log("media: YouTube player ready");
              if (self.kind === "youtube") event.target.playVideo();
            },
            onStateChange: function (event) { self.onYouTubeState(event.data); },
            onError: function (event) { self.onYouTubeError(event.data); },
          },
        });
      }
      // Autoplay with sound refused leaves it waiting: play it muted (the sound button unmutes).
      self.clearYouTubeTimer();
      let checks = 0;
      self.ytMutedTimer = setInterval(function () {
        const yt = self.ytReady();
        if (self.current !== current || self.state !== MediaState.loading || ++checks > 40) {
          self.clearYouTubeTimer();
          return;
        }
        if (!yt || checks * YOUTUBE_CHECK_MS < YOUTUBE_MUTED_AFTER_MS) return;
        const state = yt.getPlayerState();
        if (state === window.YT.PlayerState.BUFFERING || state === window.YT.PlayerState.PLAYING) return;
        self.log("media: YouTube didn't start (state " + state + ", muted " + yt.isMuted() + "), playing it muted");
        if (!yt.isMuted()) yt.mute();
        yt.playVideo();
        self.sendStatus();
      }, YOUTUBE_CHECK_MS);
    }, function () {
      if (self.current === current) self.fail("network", "YouTube's player didn't load");
    });
  }

  onYouTubeState(state) {
    if (this.kind !== "youtube" || !window.YT) return;
    this.log("media: YouTube state " + state);
    const S = window.YT.PlayerState;
    if (state === S.PLAYING) this.setState(MediaState.playing);
    else if (state === S.PAUSED) this.setState(MediaState.paused);
    else if (state === S.BUFFERING) this.setState(MediaState.loading);
    else if (state === S.ENDED) this.setState(MediaState.ended);
  }

  onYouTubeError(code) {
    if (this.kind !== "youtube") return;
    // 101 / 150: the owner doesn't allow it outside YouTube; 100: private or removed.
    const kind = code === 101 || code === 150 ? "blocked" : code === 100 ? "unavailable" : "unsupported";
    this.fail(kind, "YouTube error " + code);
  }

  /** The YouTube player, once its API is ready to take calls. */
  ytReady() {
    return this.yt && typeof this.yt.getPlayerState === "function" ? this.yt : null;
  }

  clearYouTubeTimer() {
    if (this.ytMutedTimer) clearInterval(this.ytMutedTimer);
    this.ytMutedTimer = null;
  }

  // MARK: Errors

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
    this.clearYouTubeTimer();
    if (this.current.kind === "youtube" && this.ytReady()) this.ytReady().stopVideo();
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

let youTubePromise = null;

/** Loads YouTube's IFrame API once. */
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!youTubePromise) {
    youTubePromise = new Promise(function (resolve, reject) {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (previous) previous();
        resolve();
      };
      const script = document.createElement("script");
      script.src = YOUTUBE_API;
      script.async = true;
      script.onerror = function () {
        youTubePromise = null;
        reject(new Error("YouTube's API didn't load"));
      };
      document.head.appendChild(script);
    });
  }
  return youTubePromise;
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
