// /c/<code>: tells someone who scanned the QR code with their iPhone what to do in the app.

import { strings, spacedCode } from "./strings.js";

const match = /^\/c\/(\d{6})\/?$/.exec(location.pathname);
const code = match ? match[1] : null;

document.title = strings.pageTitle;
document.getElementById("title").textContent = code ? strings.joinTitle : strings.brand;
document.getElementById("code").textContent = code ? spacedCode(code) : "";
document.getElementById("body").textContent = code ? strings.joinBody(spacedCode(code)) : strings.joinNoCode;
document.getElementById("home").textContent = strings.joinHome;
