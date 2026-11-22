// Every user-facing string of smrr.tv/roku, the page Roku's MirrorGo TV app shows (English only for now).
// The page's own copy (web/roku/): smrr.tv in a browser (web/strings.js) and the other TVs have theirs.

export const strings = {
  pageTitle: "All\u00a0TV\u00a0Kit",
  brand: "All\u00a0TV\u00a0Kit",
  surfaceBadge: "for Roku",

  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Can't connect. Check your Roku's internet connection.",

  codeTitle: "Mirror your iPhone to this TV",
  codeLabel: "Your code",
  steps: ["Open All\u00a0TV\u00a0Kit on your iPhone", "Tap TV Browser", "Enter this code"],
  qrHint: "Or scan with your iPhone camera",
  sameWifi: "Your iPhone and this TV need the same Wi-Fi.",
  tvName: (name) => `This TV: ${name}`,

  starting: "iPhone connected. Starting…",
  startingHint: "Start Screen Mirroring or play a channel in All\u00a0TV\u00a0Kit.",

  stoppedTitle: "Mirroring stopped",
  stoppedHint: "Start again from your iPhone. The code stays the same.",
  mediaStoppedTitle: "Playback stopped",
  mediaStoppedHint: "Pick something to play in All\u00a0TV\u00a0Kit. The code stays the same.",
  mediaFailedTitle: "This TV couldn't play it",
  mediaFailedHint: "Try another channel from your iPhone. The code stays the same.",
  loading: "Loading…",

  iceFailed: "Couldn't connect. Make sure your iPhone and this TV are on the same Wi-Fi.",
  replacedTitle: "This code is open on another screen",
  replacedHint: "Only one screen can show your iPhone at a time.",
  useThisWindow: "Show it here",
  tryAgain: "Try again",
  roomClosedTitle: "This code has ended",
  newCode: "Get a new code",
  unsupported: "This Roku can't play the mirrored screen. Update it in Settings → System → System update.",

  tapForSound: "Press OK for sound",
  mute: "Mute",
};

/** "123456" → "123 456" */
export function spacedCode(code) {
  return String(code).slice(0, 3) + " " + String(code).slice(3);
}
