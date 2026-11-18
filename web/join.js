// /c/<code>: tells someone who scanned the QR code with their iPhone what to do in the app.

import { strings, spacedCode } from "./strings.js";

const match = /^\/c\/(\d{6})\/?$/.exec(location.pathname);
const code = match ? match[1] : null;

document.title = strings.pageTitle;
document.getElementById("title").textContent = code ? strings.joinTitle : strings.brand;
document.getElementById("code").textContent = code ? spacedCode(code) : "";
// The QR code of a MirrorGo TV app names its TV: point at the TV app entry, not TV Browser.
const fromTVApp = new URLSearchParams(location.search).has("tv");
const body = fromTVApp ? strings.joinBodyTVApp : strings.joinBody;
document.getElementById("body").textContent = code ? body(spacedCode(code)) : strings.joinNoCode;
document.getElementById("home").textContent = strings.joinHome;
