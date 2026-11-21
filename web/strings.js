// Every user-facing string of the site, in one place (English only for now).
// `strings` is the web page's. On the TV apps' page (tv.html, body data-surface="tv"), the `tv` ones go on
// top, then the TV's own (`tvs`, from the page's path: /firetv, /samsung, /lg, /roku, /googletv).

const web = {
  pageTitle: "smrr.tv · Mirror your iPhone",
  brand: "smrr.tv",

  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Can't reach smrr.tv. Check this device's internet connection.",

  codeTitle: "Mirror your iPhone to this screen",
  codeLabel: "Your code",
  steps: ["Open MirrorGo on your iPhone", "Tap TV Browser", "Enter this code"],
  qrHint: "Or scan with your iPhone camera",
  sameWifi: "Your iPhone and this screen need the same Wi-Fi.",
  privacy: "Privacy",

  starting: "iPhone connected. Starting…",
  startingHint: "Start Screen Mirroring or play a channel in MirrorGo.",

  // The page the app opened itself on the TV (no code): what the phone is doing.
  appPageTitle: "MirrorGo",
  appBrand: "MirrorGo · smrr.tv",
  appWaitingTitle: "Connecting to your iPhone…",
  appWaitingHint: "Keep MirrorGo open on your iPhone.",
  appStartingTitle: "Connected to MirrorGo",
  appStartingHint: "Starting on this TV…",
  appStoppedTitle: "Nothing playing",
  appStoppedHint: "Pick a channel, photo or video in MirrorGo on your iPhone.",
  appEndedTitle: "MirrorGo has disconnected",
  appEndedHint: "Cast again from MirrorGo on your iPhone: it opens this page by itself.",
  appUseCode: "Connect with a code instead",
  appMediaFailedHint: "Try something else from MirrorGo on your iPhone.",

  stoppedTitle: "Mirroring stopped",
  stoppedHint: "Start again from your iPhone. The code stays the same.",
  mediaStoppedTitle: "Playback stopped",
  mediaStoppedHint: "Pick something to play in MirrorGo. The code stays the same.",
  mediaFailedTitle: "This browser couldn't play it",
  mediaFailedHint: "Try another channel from your iPhone. The code stays the same.",
  loading: "Loading…",

  iceFailed: "Couldn't connect. Make sure your iPhone and this device are on the same Wi-Fi.",
  replacedTitle: "This code is open in another window",
  replacedHint: "Only one window can show the mirrored screen.",
  useThisWindow: "Use this window",
  tryAgain: "Try again",
  roomClosedTitle: "This code has ended",
  newCode: "Get a new code",
  unsupported: "This browser can't play the mirrored screen. Try Chrome, Edge, Safari or Firefox.",

  tapForSound: "Tap for sound",
  mute: "Mute",
  unmute: "Unmute",
  fullscreen: "Full screen",
  exitFullscreen: "Exit full screen",

  joinTitle: "Almost there",
  joinBody: (code) => `Open MirrorGo on your iPhone, tap TV Browser and enter ${code}.`,
  joinNoCode: "Open smrr.tv on your TV or computer to get a code.",
  joinHome: "Show a code on this device",
};

/** The TV apps' page (tv.html): a TV, a remote, MirrorGo's name. */
const tv = {
  pageTitle: "MirrorGo",
  brand: "MirrorGo",
  surfaceBadge: "",
  offline: "Can't connect. Check this TV's internet connection.",

  codeTitle: "Mirror your iPhone to this TV",
  sameWifi: "Your iPhone and this TV need the same Wi-Fi.",
  tvName: (name) => `This TV: ${name}`,

  mediaFailedTitle: "This TV couldn't play it",
  iceFailed: "Couldn't connect. Make sure your iPhone and this TV are on the same Wi-Fi.",
  tapForSound: "Press OK for sound",

  // The web page's say "browser" / "window" and name desktop browsers.
  unsupported: "This TV can't play the mirrored screen. Update its software in the TV's settings.",
  replacedTitle: "This code is open on another screen",
  replacedHint: "Only one screen can show your iPhone at a time.",
  useThisWindow: "Show it here",
};

/** Each TV app's URL (smrr.tv/<key>): its name next to MirrorGo, and where its settings are. */
const tvs = {
  firetv: {
    surfaceBadge: "for Fire TV",
    offline: "Can't connect. Check your Fire TV's internet connection.",
    unsupported: "This Fire TV can't play the mirrored screen. Update it in Settings → My Fire TV → About.",
  },
  samsung: {
    surfaceBadge: "for Samsung TV",
    offline: "Can't connect. Check your Samsung TV's internet connection.",
    unsupported: "This Samsung TV can't play the mirrored screen. Update it in Settings → Support → Software Update.",
  },
  lg: {
    surfaceBadge: "for LG TV",
    offline: "Can't connect. Check your LG TV's internet connection.",
    unsupported: "This LG TV can't play the mirrored screen. Update it in Settings → Support → Software Update.",
  },
  roku: {
    surfaceBadge: "for Roku",
    offline: "Can't connect. Check your Roku's internet connection.",
    unsupported: "This Roku can't play the mirrored screen. Update it in Settings → System → System update.",
  },
  googletv: {
    surfaceBadge: "for Google TV",
    offline: "Can't connect. Check your Google TV's internet connection.",
    unsupported: "This Google TV can't play the mirrored screen. Update it in Settings → System → About → System update.",
  },
};

/**
 * Inside the Fire OS app (islomov/mirrorgo-firetv): the iPhone finds that app on the Wi-Fi and joins it
 * by itself (MIRR-165), so the page says "tap this TV in All TV Kit"; the code is only the fallback.
 * Applied over the rest by app.js (`autoJoin`), not on Vega or in a browser opened on /firetv.
 */
export const autoJoinStrings = {
  pageTitle: "All TV Kit",
  brand: "All TV Kit",
  codeTitle: "Mirror your iPhone to this Fire TV",
  openApp: "Open All TV Kit on your iPhone",
  tap: "Tap",
  thisTV: "this Fire TV",
  sameWifi: "Same Wi-Fi as this Fire TV.",
  codeFallback: "Not in the list? Tap Browser (smrr.tv) and enter",
  qrHint: "No app? Scan to get it",
  startingHint: "Start Screen Mirroring or play a channel in All TV Kit.",
  stoppedHint: "Start again from All TV Kit on your iPhone.",
  mediaStoppedHint: "Pick something to play in All TV Kit.",
  mediaFailedHint: "Try another channel from your iPhone.",
};

const surface = document.body ? document.body.getAttribute("data-surface") : null;
/** "/samsung" or "/samsung/" → "samsung" (only on tv.html). */
const tvKey = surface === "tv" ? location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase() : "";

// Not Object.hasOwn: older TV browsers (Tizen, webOS) don't have it.
const tvOwn = Object.prototype.hasOwnProperty.call(tvs, tvKey) ? tvs[tvKey] : {};

export const strings = Object.assign({}, web, surface === "tv" ? tv : {}, tvOwn);

/** "123456" → "123 456" */
export function spacedCode(code) {
  return String(code).slice(0, 3) + " " + String(code).slice(3);
}
