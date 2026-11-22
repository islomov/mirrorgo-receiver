// Every user-facing string of smrr.tv/firetv, the page Fire TV's MirrorGo TV app shows (English only for now).
// The page's own copy (web/firetv/): smrr.tv in a browser (web/strings.js) and the other TVs have theirs.

export const strings = {
  pageTitle: "All\u00a0TV\u00a0Kit",
  brand: "All\u00a0TV\u00a0Kit",
  surfaceBadge: "for Fire TV",

  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Can't connect. Check your Fire TV's internet connection.",

  // The iPhone finds our Fire OS app (islomov/mirrorgo-firetv) on the Wi-Fi and joins it by itself
  // (MIRR-165), so the page says "tap this TV in All TV Kit"; the code is only the fallback (Vega, browsers).
  codeTitle: "Mirror your iPhone to this Fire TV",
  openApp: "Open All\u00a0TV\u00a0Kit on your iPhone",
  tap: "Tap",
  thisTV: "this Fire TV",
  sameWifi: "Same Wi-Fi as this Fire TV.",
  codeFallback: "Not in the list? Tap Browser (smrr.tv) and enter",
  qrHint: "No app? Scan to get it",

  starting: "iPhone connected. Starting…",
  startingHint: "Start Screen Mirroring or play a channel in All\u00a0TV\u00a0Kit.",

  stoppedTitle: "Mirroring stopped",
  stoppedHint: "Start again from All\u00a0TV\u00a0Kit on your iPhone.",
  mediaStoppedTitle: "Playback stopped",
  mediaStoppedHint: "Pick something to play in All\u00a0TV\u00a0Kit.",
  mediaFailedTitle: "This TV couldn't play it",
  mediaFailedHint: "Try another channel from your iPhone.",
  loading: "Loading…",

  iceFailed: "Couldn't connect. Make sure your iPhone and this TV are on the same Wi-Fi.",
  replacedTitle: "This code is open on another screen",
  replacedHint: "Only one screen can show your iPhone at a time.",
  useThisWindow: "Show it here",
  tryAgain: "Try again",
  roomClosedTitle: "This code has ended",
  newCode: "Get a new code",
  unsupported: "This Fire TV can't play the mirrored screen. Update it in Settings → My Fire TV → About.",

  tapForSound: "Press OK for sound",
  mute: "Mute",
};

/** "123456" → "123 456" */
export function spacedCode(code) {
  return String(code).slice(0, 3) + " " + String(code).slice(3);
}
