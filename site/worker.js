// mirrorgo.app: www.mirrorgo.app → mirrorgo.app, everything else from the static files (./public).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.mirrorgo.app") {
      url.hostname = "mirrorgo.app";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
