// mirrorgo.app: www.mirrorgo.app → mirrorgo.app, everything else from the static files (./public).

// Roku articles for features a Roku doesn't have (MirrorGo only mirrors the screen to a Roku): they were
// published on 2026-11-16, so send them to the Roku guide in the same language rather than to a 404.
const GONE_ROKU_POSTS = /^(\/[a-z-]+)?\/blog\/(cast-photos-and-videos-from-iphone-to-roku|show-web-images-on-roku-from-iphone|watch-free-live-tv-on-roku-with-iphone|cast-youtube-from-iphone-to-roku|cast-web-videos-from-iphone-to-roku|show-iphone-camera-on-roku)\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "www.mirrorgo.app") {
      url.hostname = "mirrorgo.app";
      return Response.redirect(url.toString(), 301);
    }
    const gone = url.pathname.match(GONE_ROKU_POSTS);
    if (gone) {
      return Response.redirect(`${url.origin}${gone[1] ?? ""}/mirror-iphone-to-roku/`, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
