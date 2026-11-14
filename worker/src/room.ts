// One room = one Durable Object, addressed by idFromName(code). It holds at most one viewer
// (the web page) and one sender (the iOS extension) WebSocket, relays the WebRTC signaling
// between them, and deletes itself when the room ends, which frees the code again.
// Protocol: ../../PROTOCOL.md.

import { DurableObject } from "cloudflare:workers";
import {
  CloseCode,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  ROOM_TTL_MS,
  VIEWER_GRACE_MS,
  type Role,
  json,
  log,
  randomToken,
  tokensEqual,
} from "./shared";

interface RoomRecord {
  code: string;
  viewerToken: string;
  senderToken: string;
  createdAt: number;
  /** Set once a sender has joined: the room then no longer expires after 10 minutes. */
  senderEverJoined: boolean;
  /** When the viewer's socket closed, null while it's connected. */
  viewerLeftAt: number | null;
  /** Ids of the current sockets (older replaced sockets may still be closing). */
  viewerSocket: string | null;
  senderSocket: string | null;
}

interface SocketAttachment {
  role: Role;
  id: string;
}

/** Messages each role may send; everything else is ignored. */
const RELAYED: Record<Role, ReadonlySet<string>> = {
  sender: new Set(["offer", "candidate", "bye"]),
  viewer: new Set(["answer", "candidate", "restart-ice", "bye"]),
};

const other = (role: Role): Role => (role === "viewer" ? "sender" : "viewer");

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keepalive answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // MARK: Entry points (called by the Worker)

  /**
   * WebSocket upgrades, forwarded by the Worker:
   * - `/viewer/new?code=` create the room (409 if this code is taken by a live room)
   * - `/viewer/rejoin?token=` the page reloaded (404 / 403 → the Worker makes a new room)
   * - `/sender?token=` the phone (404 / 403 are returned to it)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const room = this.liveRoom(now);

    switch (url.pathname) {
      case "/viewer/new": {
        if (room) return json({ error: "taken" }, 409);
        const code = url.searchParams.get("code") ?? "";
        const created: RoomRecord = {
          code,
          viewerToken: randomToken(),
          senderToken: randomToken(),
          createdAt: now,
          senderEverJoined: false,
          viewerLeftAt: null,
          viewerSocket: null,
          senderSocket: null,
        };
        log("room-created", { code });
        return this.accept("viewer", created);
      }
      case "/viewer/rejoin": {
        if (!room) return json({ error: "not_found" }, 404);
        if (!tokensEqual(url.searchParams.get("token") ?? "", room.viewerToken)) return json({ error: "forbidden" }, 403);
        log("viewer-rejoined", { code: room.code });
        return this.accept("viewer", room);
      }
      case "/sender": {
        if (!room) return json({ error: "not_found" }, 404);
        if (!tokensEqual(url.searchParams.get("token") ?? "", room.senderToken)) return json({ error: "forbidden" }, 403);
        log("sender-joined", { code: room.code });
        return this.accept("sender", room);
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  }

  /** `GET /api/rooms/:code`: the sender token of the live room, or null. */
  async lookup(): Promise<string | null> {
    const room = this.liveRoom(Date.now());
    return room ? room.senderToken : null;
  }

  // MARK: WebSocket events (hibernation API)

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    if (message.length > MAX_MESSAGE_BYTES) {
      log("message-too-large", { role: attachment.role, bytes: message.length });
      return;
    }
    let type: unknown;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
      type = parsed && typeof parsed === "object" ? parsed.type : undefined;
    } catch {
      log("bad-json", { role: attachment.role });
      return;
    }
    if (typeof type !== "string") return;

    if (type === "ping") {
      // Pings that aren't byte-for-byte the auto-response string end up here.
      this.trySend(ws, '{"type":"pong"}');
      return;
    }
    if (type === "hello") {
      log("hello", { role: attachment.role, v: parsed.v });
      return;
    }
    if (!RELAYED[attachment.role].has(type)) return;

    const room = this.room();
    if (!room || room[`${attachment.role}Socket`] !== attachment.id) return; // replaced socket
    const peer = this.socket(other(attachment.role), room);
    if (peer) this.trySend(peer, message);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.socketGone(ws);
    // Complete the closing handshake (a no-op if it's already closed).
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {}
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    log("socket-error", { error: String(error) });
    this.socketGone(ws);
  }

  async alarm(): Promise<void> {
    const room = this.liveRoom(Date.now());
    if (room) this.schedule(room);
  }

  // MARK: Room state

  private room(): RoomRecord | undefined {
    return this.ctx.storage.kv.get<RoomRecord>("room");
  }

  private save(room: RoomRecord): void {
    this.ctx.storage.kv.put("room", room);
    this.schedule(room);
  }

  /** The room if it's still alive at `now`; ends it (closing its sockets) if a deadline has passed. */
  private liveRoom(now: number): RoomRecord | undefined {
    const room = this.room();
    if (!room) return undefined;
    if (!room.senderEverJoined && now >= room.createdAt + ROOM_TTL_MS) {
      this.end(room, CloseCode.expired, "expired", "room-expired");
      return undefined;
    }
    if (room.viewerLeftAt !== null && now >= room.viewerLeftAt + VIEWER_GRACE_MS) {
      this.end(room, CloseCode.roomClosed, "room closed", "room-closed");
      return undefined;
    }
    return room;
  }

  private schedule(room: RoomRecord): void {
    const deadlines: number[] = [];
    if (!room.senderEverJoined) deadlines.push(room.createdAt + ROOM_TTL_MS);
    if (room.viewerLeftAt !== null) deadlines.push(room.viewerLeftAt + VIEWER_GRACE_MS);
    if (deadlines.length) void this.ctx.storage.setAlarm(Math.min(...deadlines));
    else void this.ctx.storage.deleteAlarm();
  }

  /** Closes every socket and deletes all storage, so the code is free again. */
  private end(room: RoomRecord, viewerCode: number, viewerReason: string, event: string): void {
    log(event, { code: room.code, ageS: Math.round((Date.now() - room.createdAt) / 1000) });
    for (const ws of this.ctx.getWebSockets()) {
      const role = (ws.deserializeAttachment() as SocketAttachment | null)?.role;
      try {
        if (role === "viewer") ws.close(viewerCode, viewerReason);
        else ws.close(CloseCode.roomClosed, "room closed");
      } catch {}
    }
    void this.ctx.storage.deleteAlarm();
    void this.ctx.storage.deleteAll();
  }

  // MARK: Sockets

  private accept(role: Role, room: RoomRecord): Response {
    const { 0: client, 1: server } = new WebSocketPair();
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, id } satisfies SocketAttachment);

    const previous = this.socket(role, room);
    if (previous) {
      try {
        previous.close(CloseCode.replaced, "replaced");
      } catch {}
    }

    room[`${role}Socket`] = id;
    if (role === "viewer") room.viewerLeftAt = null;
    else room.senderEverJoined = true;
    this.save(room);

    const peer = this.socket(other(role), room);
    const iceServers = this.env.ICE_SERVERS;
    if (role === "viewer") {
      this.trySend(server, JSON.stringify({
        type: "room", v: PROTOCOL_VERSION, code: room.code, viewerToken: room.viewerToken, iceServers,
        senderConnected: peer !== undefined,
      }));
    } else {
      this.trySend(server, JSON.stringify({
        type: "ready", v: PROTOCOL_VERSION, code: room.code, iceServers, viewerConnected: peer !== undefined,
      }));
    }
    if (peer) this.trySend(peer, JSON.stringify({ type: "peer-joined", role }));

    return new Response(null, { status: 101, webSocket: client });
  }

  /** The current socket for `role`, if it's connected. */
  private socket(role: Role, room: RoomRecord): WebSocket | undefined {
    const id = room[`${role}Socket`];
    if (!id) return undefined;
    return this.ctx.getWebSockets(role).find((ws) => {
      const a = ws.deserializeAttachment() as SocketAttachment | null;
      return a?.id === id && ws.readyState === WebSocket.OPEN;
    });
  }

  private socketGone(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    const room = this.room();
    if (!room || room[`${attachment.role}Socket`] !== attachment.id) return; // replaced, or room gone
    room[`${attachment.role}Socket`] = null;
    if (attachment.role === "viewer") room.viewerLeftAt = Date.now();
    this.save(room);
    log("peer-left", { code: room.code, role: attachment.role });
    const peer = this.socket(other(attachment.role), room);
    if (peer) this.trySend(peer, JSON.stringify({ type: "peer-left", role: attachment.role }));
  }

  private trySend(ws: WebSocket, message: string): void {
    try {
      ws.send(message);
    } catch {}
  }
}
