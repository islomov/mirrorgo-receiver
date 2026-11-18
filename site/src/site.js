// mirrorgo.app: header border on scroll, the mobile menu, the language menu and hint, and sections
// easing in once.
// Everything is readable without it (crawlers, no JS): `.reveal` only hides content under `.js`.
(function () {
  var root = document.documentElement;
  root.classList.add("js");

  var header = document.querySelector(".header");
  function onScroll() { header && header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var menu = document.querySelector(".menu-btn");
  var nav = document.querySelector(".nav");
  if (menu && nav) {
    menu.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { nav.classList.remove("open"); menu.setAttribute("aria-expanded", "false"); }
    });
  }

  // Language menu: closes on a click elsewhere or Escape.
  var langMenu = document.querySelector(".lang-menu");
  if (langMenu) {
    document.addEventListener("click", function (e) {
      if (langMenu.open && !langMenu.contains(e.target)) langMenu.open = false;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && langMenu.open) { langMenu.open = false; langMenu.querySelector("summary").focus(); }
    });
  }

  // Picking a language remembers it, and the "Read in <language>" hint doesn't show again.
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function stored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[hreflang]");
    if (a) store("mg-lang", a.getAttribute("hreflang"));
  });

  // The browser prefers another of the site's languages: offer this page in it (never redirect).
  function siteLang(tag) {
    tag = (tag || "").toLowerCase();
    if (/^zh-(hant|tw|hk|mo)/.test(tag)) return "zh-hant";
    if (/^zh/.test(tag)) return null;
    if (/^(nb|nn|no)\b/.test(tag)) return "no";
    return tag.split("-")[0];
  }
  (function hint() {
    if (stored("mg-lang") || !navigator.languages) return;
    var links = {};
    document.querySelectorAll('.lang-menu a[hreflang]').forEach(function (a) {
      links[a.getAttribute("hreflang").toLowerCase()] = a;
    });
    var current = siteLang(root.lang);
    var want = null;
    for (var i = 0; i < navigator.languages.length && !want; i++) {
      var code = siteLang(navigator.languages[i]);
      if (code && links[code]) want = code;
    }
    if (!want || want === current) return;
    var target = links[want];
    var bar = document.createElement("div");
    bar.className = "lang-hint";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", target.textContent);
    var globe = document.querySelector(".lang-menu summary svg");
    if (globe) bar.appendChild(globe.cloneNode(true));
    var link = document.createElement("a");
    link.href = target.getAttribute("href");
    link.lang = target.lang;
    link.hreflang = target.getAttribute("hreflang");
    link.textContent = target.textContent + " →";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", function () { store("mg-lang", root.lang); bar.remove(); });
    bar.appendChild(link);
    bar.appendChild(close);
    document.body.appendChild(bar);
  })();

  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach(function (el) { io.observe(el); });

  // Opening a FAQ answer from a link (#faq-<id>).
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.tagName === "DETAILS") el.open = true;
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
})();
