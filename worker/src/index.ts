// smrr.tv: serves the web receiver (web/) and, later, the WebRTC signaling
// endpoint (/ws, one Durable Object per room). See the plan in the MirrorGo repo.

// `Env` (bindings) is generated from wrangler.jsonc by `npm run types`.

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // www.smrr.tv → smrr.tv (people will type both)
    if (url.hostname === "www.smrr.tv") {
      url.hostname = "smrr.tv";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/healthz") {
      return new Response("ok", { headers: { "cache-control": "no-store" } });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
