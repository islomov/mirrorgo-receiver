// WebRTC player: answers the phone's offer and plays the mirrored screen (H.264 + Opus) in a
// <video>. No DOM assumptions beyond the video element, no signaling transport: messages to
// the phone go out through `onSignal`, messages from it come in through `handle()`. So the
// Cast receiver can import this module too.
//
//   const player = new WebRTCPlayer(video, {
//     iceServers,                       // from the server's `room` message
//     onSignal(message) { ... },        // send to the phone: answer / candidate / restart-ice
//     onStateChange(state) { ... },     // see PlayerState
//   });
//   player.handle(message);             // offer / candidate from the phone
//   const s = await player.stats();     // for a debug overlay
//
// Written for older TV browsers too: no optional chaining, no class fields.

/**
 * idle         no peer connection (nothing offered yet, or closed)
 * connecting   offer answered, waiting for ICE and the first frame
 * playing      frames are arriving
 * reconnecting ICE disconnected after playing; an ICE restart is requested after 5 s
 * failed       ICE failed (usually: not on the same network)
 */
export const PlayerState = {
  idle: "idle",
  connecting: "connecting",
  playing: "playing",
  reconnecting: "reconnecting",
  failed: "failed",
};

const RESTART_ICE_AFTER_MS = 5000;

export class WebRTCPlayer {
  constructor(video, options) {
    this.video = video;
    this.iceServers = options.iceServers || [];
    this.onSignal = options.onSignal || function () {};
    this.onStateChange = options.onStateChange || function () {};
    this.log = options.log || function () {};
    this.state = PlayerState.idle;
    this.pc = null;
    this.pending = [];        // candidates that arrived before the offer
    this.queue = Promise.resolve();
    this.restartTimer = null;
    this.hadFrame = false;
    this.marks = {};          // performance.now() of offer / first frame
    this.prev = {};           // previous getStats counters, for per-second deltas
    this.info = { jitterBufferTarget: "–", localCandidates: 0, remoteCandidates: 0 };

    this.frameCallbackPending = false;
    this.onVideoFrame = this.onVideoFrame.bind(this);
    const self = this;
    video.addEventListener("playing", function () { self.checkFirstFrame(); });
  }

  setIceServers(iceServers) {
    this.iceServers = iceServers || [];
  }

  /** A message from the phone. Handled one at a time, in order. */
  handle(message) {
    const self = this;
    this.queue = this.queue.then(function () {
      if (message.type === "offer") return self.handleOffer(message);
      if (message.type === "candidate") return self.handleCandidate(message);
    }).catch(function (error) {
      self.log("signaling error: " + (error && error.message ? error.message : error));
    });
    return this.queue;
  }

  /** Asks the phone for an ICE restart (e.g. a "Try again" button after a failure). */
  requestIceRestart() {
    this.onSignal({ type: "restart-ice" });
  }

  /** After a failure: back to connecting, and ask the phone for an ICE restart. */
  retry() {
    if (this.pc) this.setState(PlayerState.connecting);
    this.requestIceRestart();
  }

  close() {
    this.clearRestartTimer();
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.pending = [];
    this.hadFrame = false;
    this.video.srcObject = null;
    this.setState(PlayerState.idle);
  }

  // MARK: Offer / answer

  async handleOffer(message) {
    const restart = message.iceRestart === true && this.pc !== null;
    if (!restart) this.newPeerConnection();
    const pc = this.pc;
    this.marks.offer = now();
    if (!restart) this.marks.firstFrame = undefined;

    await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
    if (!restart) this.preferH264(pc);
    const answer = await pc.createAnswer();
    const munged = opusStereo(answer.sdp);
    try {
      await pc.setLocalDescription({ type: "answer", sdp: munged });
    } catch (error) {
      this.log("munged answer refused, using the original: " + error);
      await pc.setLocalDescription(answer);
    }
    if (pc !== this.pc) return; // replaced meanwhile
    this.onSignal({ type: "answer", sdp: pc.localDescription.sdp });
    this.log(restart ? "ICE restart answered" : "offer answered");

    const pending = this.pending;
    this.pending = [];
    for (let i = 0; i < pending.length; i++) await this.addCandidate(pending[i]);
    if (!restart && this.state !== PlayerState.playing) this.setState(PlayerState.connecting);
  }

  async handleCandidate(message) {
    if (!message.candidate) return; // end-of-candidates
    if (!this.pc || !this.pc.remoteDescription) {
      this.pending.push(message);
      return;
    }
    await this.addCandidate(message);
  }

  async addCandidate(message) {
    this.info.remoteCandidates++;
    try {
      await this.pc.addIceCandidate({
        candidate: message.candidate,
        sdpMid: message.sdpMid,
        sdpMLineIndex: message.sdpMLineIndex,
      });
    } catch (error) {
      this.log("addIceCandidate: " + error);
    }
  }

  newPeerConnection() {
    if (this.pc) this.pc.close();
    this.clearRestartTimer();
    this.prev = {};
    this.hadFrame = false;
    this.info.localCandidates = 0;
    this.info.remoteCandidates = 0;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const self = this;
    const stream = new MediaStream();
    this.pc = pc;

    pc.onicecandidate = function (e) {
      if (pc !== self.pc || !e.candidate || !e.candidate.candidate) return;
      self.info.localCandidates++;
      self.onSignal({
        type: "candidate",
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      });
    };
    pc.oniceconnectionstatechange = function () {
      if (pc === self.pc) self.onIceState(pc.iceConnectionState);
    };
    pc.ontrack = function (e) {
      if (pc !== self.pc) return;
      lowLatency(e.receiver, self.info);
      const source = e.streams && e.streams[0] ? e.streams[0] : stream;
      if (source === stream) stream.addTrack(e.track);
      if (self.video.srcObject !== source) {
        self.video.srcObject = source;
        const played = self.video.play();
        if (played && played.catch) played.catch(function () {});
      }
      self.log("track " + e.track.kind);
    };
    this.watchFrames();
  }

  // The phone only offers H.264 (+ RTX); this keeps it first if a browser lists others too.
  preferH264(pc) {
    if (!window.RTCRtpReceiver || !RTCRtpReceiver.getCapabilities || !pc.getTransceivers) return;
    const caps = RTCRtpReceiver.getCapabilities("video");
    if (!caps) return;
    const isH264 = function (c) { return c.mimeType.toLowerCase() === "video/h264"; };
    const h264 = caps.codecs.filter(isH264);
    const rest = caps.codecs.filter(function (c) { return !isH264(c); });
    if (!h264.length) return;
    pc.getTransceivers().forEach(function (t) {
      if (t.receiver && t.receiver.track && t.receiver.track.kind === "video" && t.setCodecPreferences) {
        try { t.setCodecPreferences(h264.concat(rest)); } catch (e) { /* keep the browser's order */ }
      }
    });
  }

  // MARK: State

  onIceState(ice) {
    this.log("ICE " + ice);
    if (ice === "connected" || ice === "completed") {
      this.clearRestartTimer();
      if (this.hadFrame) this.setState(PlayerState.playing);
    } else if (ice === "disconnected") {
      if (this.state === PlayerState.playing) this.setState(PlayerState.reconnecting);
      if (!this.restartTimer) {
        const self = this;
        this.restartTimer = setTimeout(function () {
          self.restartTimer = null;
          if (self.pc && self.pc.iceConnectionState === "disconnected") {
            self.log("still disconnected after 5 s: asking for an ICE restart");
            self.requestIceRestart();
          }
        }, RESTART_ICE_AFTER_MS);
      }
    } else if (ice === "failed") {
      this.clearRestartTimer();
      this.setState(PlayerState.failed);
    }
  }

  /** One pending requestVideoFrameCallback at a time, while there's a peer connection. */
  watchFrames() {
    if (this.frameCallbackPending || !("requestVideoFrameCallback" in this.video)) return;
    this.frameCallbackPending = true;
    this.video.requestVideoFrameCallback(this.onVideoFrame);
  }

  onVideoFrame(_now, metadata) {
    this.frameCallbackPending = false;
    if (metadata && metadata.receiveTime && metadata.expectedDisplayTime) {
      this.info.receiveToDisplayMs = metadata.expectedDisplayTime - metadata.receiveTime;
    }
    this.checkFirstFrame();
    if (this.pc) this.watchFrames();
  }

  checkFirstFrame() {
    if (this.pc && this.video.srcObject && this.video.videoWidth > 0) {
      if (!this.hadFrame) {
        this.hadFrame = true;
        this.marks.firstFrame = now();
        this.log("first frame");
      }
      const ice = this.pc.iceConnectionState;
      if (this.state !== PlayerState.playing && (ice === "connected" || ice === "completed")) {
        this.setState(PlayerState.playing);
      }
    }
  }

  setState(state) {
    if (state === this.state) return;
    this.state = state;
    this.onStateChange(state);
  }

  clearRestartTimer() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  // MARK: Stats

  /** A summary of getStats() for a debug overlay (per-second values since the last call). */
  async stats() {
    const out = {
      state: this.state,
      ice: this.pc ? this.pc.iceConnectionState : "–",
      jitterBufferTarget: this.info.jitterBufferTarget,
      localCandidates: this.info.localCandidates,
      remoteCandidates: this.info.remoteCandidates,
      receiveToDisplayMs: this.info.receiveToDisplayMs,
      offerToFirstFrameMs: this.marks.offer && this.marks.firstFrame ? Math.round(this.marks.firstFrame - this.marks.offer) : undefined,
      video: null,
      audio: null,
      pair: null,
    };
    if (!this.pc) return out;
    const report = await this.pc.getStats();
    const byId = {};
    let vin, ain, transport, pairFallback;
    report.forEach(function (s) {
      byId[s.id] = s;
      if (s.type === "inbound-rtp" && (s.kind || s.mediaType) === "video") vin = s;
      if (s.type === "inbound-rtp" && (s.kind || s.mediaType) === "audio") ain = s;
      if (s.type === "transport") transport = s;
      // Firefox has no transport stats: the nominated, succeeded pair.
      if (s.type === "candidate-pair" && (s.selected || (s.nominated && s.state === "succeeded"))) pairFallback = s;
    });
    const d = this.delta.bind(this);

    if (vin) {
      const codec = byId[vin.codecId];
      const dJb = d("jb", vin.jitterBufferDelay), dEm = d("jbEm", vin.jitterBufferEmittedCount);
      const dDec = d("dec", vin.totalDecodeTime), dFr = d("fr", vin.framesDecoded);
      const dBytes = d("bytes", vin.bytesReceived), dTs = d("ts", vin.timestamp);
      out.video = {
        fps: vin.framesPerSecond,
        width: vin.frameWidth,
        height: vin.frameHeight,
        mbps: dTs > 0 ? dBytes * 8 / dTs / 1000 : undefined,
        jitterBufferMs: dEm > 0 ? dJb / dEm * 1000 : undefined,
        jitterBufferAvgMs: vin.jitterBufferEmittedCount ? vin.jitterBufferDelay / vin.jitterBufferEmittedCount * 1000 : undefined,
        decodeMs: dFr > 0 ? dDec / dFr * 1000 : undefined,
        codec: codec ? codec.mimeType + " " + (codec.sdpFmtpLine || "") : undefined,
        decoder: vin.decoderImplementation,
        dropped: vin.framesDropped,
        freezes: vin.freezeCount,
        freezeS: vin.totalFreezesDuration,
        lost: vin.packetsLost,
        nack: vin.nackCount,
        pli: vin.pliCount,
        estimatedPlayout: vin.estimatedPlayoutTimestamp,
      };
    }
    if (ain) {
      const codec = byId[ain.codecId];
      const dJb = d("ajb", ain.jitterBufferDelay), dEm = d("ajbEm", ain.jitterBufferEmittedCount);
      out.audio = {
        codec: codec ? codec.mimeType + "/" + (codec.channels || 1) + "ch " + (codec.sdpFmtpLine || "") : undefined,
        jitterMs: ain.jitter !== undefined ? ain.jitter * 1000 : undefined,
        jitterBufferMs: dEm > 0 ? dJb / dEm * 1000 : undefined,
        concealedPct: ain.totalSamplesReceived ? ain.concealedSamples / ain.totalSamplesReceived * 100 : undefined,
        level: ain.audioLevel,
        estimatedPlayout: ain.estimatedPlayoutTimestamp,
      };
    }
    if (out.video && out.audio && out.video.estimatedPlayout && out.audio.estimatedPlayout) {
      out.avOffsetMs = out.video.estimatedPlayout - out.audio.estimatedPlayout;
    }
    const pair = transport && transport.selectedCandidatePairId ? byId[transport.selectedCandidatePairId] : pairFallback;
    if (pair) {
      out.pair = {
        rttMs: pair.currentRoundTripTime !== undefined ? pair.currentRoundTripTime * 1000 : undefined,
        local: describeCandidate(byId[pair.localCandidateId]),
        remote: describeCandidate(byId[pair.remoteCandidateId]),
      };
    }
    return out;
  }

  delta(key, value) {
    const previous = this.prev[key];
    this.prev[key] = value;
    return previous === undefined || value === undefined ? undefined : value - previous;
  }
}

// MARK: Helpers

/** Ask the phone for stereo, music-grade Opus (the default is mono ~32 kbit/s voice). */
export function opusStereo(sdp) {
  const rtpmap = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];
  const wanted = { stereo: "1", "sprop-stereo": "1", maxaveragebitrate: "128000" };
  const fmtp = new RegExp("a=fmtp:" + pt + " ([^\\r\\n]*)");
  const add = function (params) {
    const present = {};
    params.split(";").forEach(function (p) { present[p.split("=")[0].trim()] = true; });
    const extra = Object.keys(wanted).filter(function (k) { return !present[k]; })
      .map(function (k) { return k + "=" + wanted[k]; });
    return extra.length ? params + ";" + extra.join(";") : params;
  };
  if (fmtp.test(sdp)) {
    return sdp.replace(fmtp, function (_line, params) { return "a=fmtp:" + pt + " " + add(params); });
  }
  const line = rtpmap[0];
  return sdp.replace(line, line + "\r\na=fmtp:" + pt + " stereo=1;sprop-stereo=1;maxaveragebitrate=128000");
}

/** Play as soon as frames arrive: no extra jitter buffer on a LAN. */
function lowLatency(receiver, info) {
  try {
    if ("jitterBufferTarget" in receiver) {
      receiver.jitterBufferTarget = 0;
      info.jitterBufferTarget = "jitterBufferTarget=0";
    } else if ("playoutDelayHint" in receiver) {
      receiver.playoutDelayHint = 0;
      info.jitterBufferTarget = "playoutDelayHint=0";
    } else {
      info.jitterBufferTarget = "not supported";
    }
  } catch (e) {
    info.jitterBufferTarget = "error: " + e;
  }
}

function describeCandidate(c) {
  if (!c) return "?";
  const type = c.candidateType || "?";
  const address = c.address || c.ip || "?";
  return type + " " + address + ":" + c.port + " " + (c.protocol || "");
}

function now() {
  return window.performance && performance.now ? performance.now() : Date.now();
}
