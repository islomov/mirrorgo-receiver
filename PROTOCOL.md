# smrr.tv signaling protocol v1 (contract between web page, Worker and iOS)

Both sides talk only to the Worker (`https://smrr.tv`, `wss://smrr.tv/ws`). Media never goes through it:
the mirrored screen is peer-to-peer (WebRTC), and links the phone sends (IPTV channels, …) are fetched by
the browser itself (see "Links").
All WebSocket messages are JSON text frames with a `type`. Unknown types are ignored by clients.

## HTTP

### `GET /healthz` → `200 ok`

### `GET /api/rooms/{code}` (the app, before the broadcast)
`code` = exactly 6 ASCII digits. `cache-control: no-store`, JSON bodies.
- `200 {"v":1,"code":"123456","senderToken":"<32 hex>","signalingURL":"wss://smrr.tv/ws?role=sender&code=123456&token=<32 hex>"}`
  (`signalingURL` uses the request's own origin: `ws://localhost:8787/...` under `wrangler dev`.)
  The same room always returns the same `senderToken` while it lives.
- `400 {"error":"bad_code"}`: not 6 digits.
- `404 {"error":"not_found"}`: no live room with that code (never existed, expired, closed).
- `429 {"error":"rate_limited"}` + `Retry-After: <s>`: more than 10 lookups per minute from one IP.

## WebSocket `/ws`

- Viewer (the page): `/ws?role=viewer` for a new room, or `/ws?role=viewer&code=123456&token=<viewerToken>`
  to rejoin after a reload. A rejoin that doesn't match a live room silently gets a NEW room (new code).
- Sender: `/ws?role=sender&code=123456&token=<senderToken>`. The broadcast extension while mirroring,
  the app itself while it plays a link. One at a time: the newer one replaces the older (4001).
  Rejected **before the upgrade** with HTTP `404` (no live room) or `403` (wrong token), so the client
  can tell "code expired" from a network error.

### Server → viewer, right after connecting
`{"type":"room","v":1,"code":"123456","viewerToken":"<32 hex>","iceServers":[{"urls":["stun:stun.cloudflare.com:3478"]}],"senderConnected":false}`

### Server → sender, right after connecting
`{"type":"ready","v":1,"code":"123456","iceServers":[...],"viewerConnected":true}`

### First client message (not relayed, logged as a count only)
- viewer: `{"type":"hello","v":1,"role":"viewer","userAgent":"..."}`
- sender: `{"type":"hello","v":1,"role":"sender","app":"MirrorGo/<version> iOS/<version>"}`

### Presence (server → the other side)
- `{"type":"peer-joined","role":"viewer"|"sender"}` when the other side connects, also when it replaced an older socket.
- `{"type":"peer-left","role":"viewer"|"sender"}` when the other side's socket closes.

### Relayed unchanged to the other side (dropped if it isn't connected; max 64 KB per message)
- sender → viewer: `offer {"sdp":"...","iceRestart":false}`, `candidate`, `bye {"reason":"..."}`,
  `media-load`, `media-control`, `media-stop` (see "Links")
- viewer → sender: `answer {"sdp":"..."}`, `candidate`, `restart-ice {}` (ask for an ICE restart), `bye {}`,
  `capabilities`, `media-status` (see "Links")
- `candidate`: `{"type":"candidate","candidate":"candidate:...","sdpMid":"0","sdpMLineIndex":0}`
- Any other type from a client is ignored (not relayed).

### Links (the page's own player, no WebRTC)
For media that's already on the internet (IPTV channels, web images, YouTube videos): the page shows
it itself, so the phone isn't needed while it plays (it can go to the background, or lose its socket).
`kind`: `video` (the page's `<video>`, the default), `image` (an `<img>`), `youtube` (YouTube's embedded
player, IFrame API).
HLS uses the browser's own player when it has one (Safari, smart TV browsers: no CORS needed), else
hls.js over MSE (the stream's host must allow CORS). Content served by the phone itself (`http://` on the
LAN) can't be played this way: an HTTPS page can't load it.

- sender → viewer `{"type":"media-load","id":1,"kind":"video","url":"https://…/index.m3u8","mime":"application/x-mpegURL","live":true,"title":"…","start":0}`
  replaces whatever the page shows (a WebRTC stream too). `id`: chosen by the phone, echoed in
  `media-status`, so reports about an earlier link can be told apart. `start`: seconds (not for live).
  - image: `{"kind":"image","url":"…","fallbackUrl":"https://…/thumb"}`: `fallbackUrl` (a thumbnail) is
    shown if `url` doesn't load (plain http, host down). "playing" once shown.
  - youtube: `{"kind":"youtube","videoId":"M7lc1UVf-VE","url":"https://www.youtube.com/watch?v=…","start":12}`.
    If autoplay with sound is refused, it plays muted after 2.5 s (`muted: true`, the sound button unmutes).
- sender → viewer `{"type":"media-control","id":1,"action":"play"|"pause"|"seek","time":12.5}`
- sender → viewer `{"type":"media-stop"}`: back to the code ("Playback stopped").
- viewer → sender `{"type":"media-status","id":1,"state":"loading"|"playing"|"paused"|"ended"|"error","time":3.2,"duration":null,"muted":false,"error":"unsupported"|"network"|"decode"}`
  on every change, every 2 s while a link is loaded, and when a sender joins. `duration` is null for
  live streams. `muted`: the browser refused to autoplay with sound; the page shows a sound button
  (focused, so OK on a TV remote unmutes). `error` only with `state: "error"`: `unsupported` (no player
  for it), `network` (offline, geo-blocked, no CORS for hls.js, an image that didn't load), `decode`;
  YouTube: `blocked` (the owner doesn't allow it outside YouTube), `unavailable` (private or removed).
- viewer → sender `{"type":"capabilities","v":1,"webrtc":true,"hls":"native"|"hls.js"|"none","mp4":true,"screen":{"width":1920,"height":1080}}`
  when a sender joins.
- A `bye` from the sender also stops the link; a sender that just disconnects (`peer-left`) doesn't.
- An `offer` stops the link: mirroring takes over.

### Keepalive
Clients send exactly the text `{"type":"ping"}` every 20 s; the server answers `{"type":"pong"}`
(hibernation auto-response, doesn't wake the Durable Object).

### Close codes sent by the server
- `4001 replaced`: another socket with the same role joined the room (one viewer, one sender).
- `4004 room closed`: the room no longer exists (viewer gone > 60 s, or expired).
- `4008 expired`: no sender joined within 10 minutes of the room's creation (viewer gets a new room by reconnecting without a code).
Clients must not auto-reconnect after 4001 / 4004; after 4008 the viewer starts a new room.

## Room lifetime
- Created when a viewer connects without a (valid) code. Code: 6 random digits, unique among live rooms.
- No sender has ever joined within 10 min → expires (viewer closed with 4008).
- Once a sender has joined, it lives while the viewer is connected. The sender token stays valid,
  so the phone can stop and start the broadcast again without a new code.
- Viewer disconnected for more than 60 s → closed (sender closed with 4004). A reload within 60 s
  rejoins the same room (`code` + `viewerToken` from sessionStorage).

## Call flow
1. Viewer connects → `room`. Page shows the code.
2. App: `GET /api/rooms/{code}` → `senderToken`, `signalingURL` → App Group → broadcast starts.
3. Extension connects → `ready` (viewer gets `peer-joined sender`).
4. If `viewerConnected` (or on `peer-joined viewer` later): the phone creates a fresh RTCPeerConnection
   and sends `offer`. The page answers (a new offer always replaces the page's old peer connection
   unless `iceRestart` is true, then it renegotiates the existing one). Trickle `candidate`s both ways.
5. Viewer reload: phone gets `peer-left viewer`, closes its peer connection, waits; `peer-joined viewer` → new offer.
6. Broadcast stop: phone sends `bye`, closes the socket → viewer gets `bye` / `peer-left sender` → "stopped" screen, same code.
7. Page sees ICE `disconnected` for 5 s → sends `restart-ice`; the phone answers with an `offer` with `iceRestart: true`.
8. A link: the app joins as the sender (`ready`; the page answers `capabilities`), sends `media-load`, and
   follows `media-status`. It may disconnect and come back; the page plays on and reports the current
   `media-status` when it's back. Stop: `media-stop` + `bye`.

## Implementation notes (Worker)
- Room = one SQLite-backed Durable Object, `idFromName(code)`. A new viewer gets a random code;
  the Worker retries another code if that object already holds a live room (409 internally).
- Deadlines are enforced by an alarm and also checked on every access, so a room past its deadline
  is never found even if the alarm hasn't run yet. Ending a room closes its sockets and calls
  `deleteAll()`, which frees the code.
- Rate limits (Workers Rate Limiting binding, per IP, approximate per Cloudflare location):
  `GET /api/rooms/:code` 10/min; sender WebSocket upgrades 30/min (their 404 vs 403 would otherwise
  reveal live codes). A limited sender upgrade gets HTTP `429` + `Retry-After`.
- `/ws` without `Upgrade: websocket` → `426`; unknown `role` → `400`; a sender with a malformed code
  or token → `404`.
- Logs carry event names, roles, codes and counts only: never SDP, candidates, tokens or user agents.
- `/c/<code>` serves `web/join.html` (the QR code's target).
