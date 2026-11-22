// Every user-facing string of smrr.tv in a browser (/, and the join page /c/<code>), English only for now.
// Each TV app's page (web/<tv>/: /firetv, /samsung, /lg, /roku, /googletv) has its own strings.js.

export const strings = {
  pageTitle: "smrr.tv · Mirror your iPhone",
  brand: "smrr.tv",

  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Can't reach smrr.tv. Check this device's internet connection.",

  codeTitle: "Mirror your iPhone to this screen",
  codeLabel: "Your code",
  steps: ["Open All\u00a0TV\u00a0Kit on your iPhone", "Tap TV Browser", "Enter this code"],
  qrHint: "Or scan with your iPhone camera",
  sameWifi: "Your iPhone and this screen need the same Wi-Fi.",
  privacy: "Privacy",

  starting: "iPhone connected. Starting…",
  startingHint: "Start Screen Mirroring or play a channel in All\u00a0TV\u00a0Kit.",

  // The page the app opened itself on the TV (no code): what the phone is doing.
  appPageTitle: "All\u00a0TV\u00a0Kit",
  appBrand: "All\u00a0TV\u00a0Kit · smrr.tv",
  appWaitingTitle: "Connecting to your iPhone…",
  appWaitingHint: "Keep All\u00a0TV\u00a0Kit open on your iPhone.",
  appStartingTitle: "Connected to All\u00a0TV\u00a0Kit",
  appStartingHint: "Starting on this TV…",
  appStoppedTitle: "Nothing playing",
  appStoppedHint: "Pick a channel, photo or video in All\u00a0TV\u00a0Kit on your iPhone.",
  appEndedTitle: "All\u00a0TV\u00a0Kit has disconnected",
  appEndedHint: "Cast again from All\u00a0TV\u00a0Kit on your iPhone: it opens this page by itself.",
  appUseCode: "Connect with a code instead",
  appMediaFailedHint: "Try something else from All\u00a0TV\u00a0Kit on your iPhone.",

  stoppedTitle: "Mirroring stopped",
  stoppedHint: "Start again from your iPhone. The code stays the same.",
  mediaStoppedTitle: "Playback stopped",
  mediaStoppedHint: "Pick something to play in All\u00a0TV\u00a0Kit. The code stays the same.",
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
  joinBody: (code) => `Open All\u00a0TV\u00a0Kit on your iPhone, tap TV Browser and enter ${code}.`,
  joinNoCode: "Open smrr.tv on your TV or computer to get a code.",
  joinHome: "Show a code on this device",
};

/** "123456" → "123 456" */
export function spacedCode(code) {
  return String(code).slice(0, 3) + " " + String(code).slice(3);
}
