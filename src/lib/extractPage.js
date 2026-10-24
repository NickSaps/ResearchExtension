// These two functions are injected into web pages with scripting.executeScript({ func }).
// The browser serializes the function's source text, so each one must be fully
// self-contained: no imports, no references to anything outside its own body.
// They only collect raw data; all merging/cleanup happens in metadata.js.

export function extractPageData() {
  const meta = {};
  const add = (key, value) => {
    if (!key || !value) return;
    const k = key.trim().toLowerCase();
    (meta[k] ||= []).push(value.trim().slice(0, 2000));
  };
  for (const el of document.querySelectorAll("meta")) {
    const content = el.getAttribute("content");
    if (!content) continue;
    const name = el.getAttribute("name") || el.getAttribute("property") || el.getAttribute("http-equiv");
    if (name) add(name, content);
    const itemprop = el.getAttribute("itemprop");
    if (itemprop) add("itemprop:" + itemprop, content);
  }

  // JSON-LD: flatten arrays and @graph into a single list of nodes.
  const jsonld = [];
  const push = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(push);
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(push);
    if (node["@type"] && jsonld.length < 60) jsonld.push(node);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    if (script.textContent.length > 200000) continue;
    try {
      push(JSON.parse(script.textContent));
    } catch {
      // Invalid JSON-LD is common; ignore it.
    }
  }

  return {
    url: location.href,
    title: document.title || "",
    canonical: document.querySelector('link[rel="canonical"]')?.href || "",
    lang: document.documentElement.lang || "",
    meta,
    jsonld,
  };
}

export function getSelectionText() {
  const sel = window.getSelection();
  return sel ? sel.toString() : "";
}

// A small, unobtrusive confirmation shown in the corner of the page for a few seconds.
// It lives in a closed shadow root so the page's CSS can't affect it, and is styled through
// element.style (not a <style> tag) so strict page security policies can't block it.
export function showToast(text, kind) {
  const HOST_ID = "gleaner-toast-host";
  document.getElementById(HOST_ID)?.remove();
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const accent = { ok: "#1a7f37", warn: "#b86e00", err: "#c62828" }[kind] ?? "#5b4bd6";

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;";
  const toast = document.createElement("div");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = text;
  toast.style.cssText = [
    "box-sizing:border-box", "max-width:320px", "padding:10px 14px", "border-radius:8px",
    "font:14px/1.4 system-ui,sans-serif", `color:${dark ? "#e8e8ec" : "#1c1c1e"}`,
    `background:${dark ? "#2b2b31" : "#ffffff"}`, `border:1px solid ${accent}`, `border-left:4px solid ${accent}`,
    "box-shadow:0 4px 16px rgba(0,0,0,.25)", "opacity:0", "transform:translateY(8px)",
    "transition:opacity .2s ease,transform .2s ease",
  ].join(";");
  host.attachShadow({ mode: "closed" }).append(toast);
  document.documentElement.append(host);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "none";
  });
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => host.remove(), 250);
  }, kind === "ok" ? 3000 : 5000);
}

// Reports the raw attributes of the image that was right-clicked. Which URL is
// best is decided later by imageCandidates.js, outside the page.
export function extractImageInfo(srcUrl) {
  const info = { srcUrl, baseURI: document.baseURI, srcsets: [], links: [], lazy: [], alt: "", caption: "" };
  const LAZY_ATTRS = [
    "data-src", "data-original", "data-full", "data-full-src", "data-full-url", "data-zoom-image", "data-zoom-src",
    "data-large", "data-large-file", "data-orig-file", "data-original-src", "data-hires", "data-hi-res",
    "data-lazy-src", "data-lazy", "data-fullsize", "data-image",
  ];
  const abs = (u) => {
    try {
      return new URL(u, document.baseURI).href;
    } catch {
      return "";
    }
  };
  const images = Array.from(document.images);
  const img =
    images.find((i) => i.currentSrc === srcUrl) ||
    images.find((i) => i.src === srcUrl) ||
    images.find((i) => abs(i.getAttribute("data-src") || "") === srcUrl);
  if (!img) return info; // e.g. a CSS background image: only the URL itself is known

  const sources = img.closest("picture") ? Array.from(img.closest("picture").querySelectorAll("source")) : [];
  for (const el of [img, ...sources]) {
    for (const attr of ["srcset", "data-srcset", "data-lazy-srcset"]) {
      const v = el.getAttribute(attr);
      if (v) info.srcsets.push(v.slice(0, 20000));
    }
  }
  const link = img.closest("a[href]");
  if (link) info.links.push(link.href);
  for (const attr of LAZY_ATTRS) {
    const v = img.getAttribute(attr);
    if (v && v.length < 2000) info.lazy.push({ attr, value: v });
  }

  const figcaption = img.closest("figure")?.querySelector("figcaption")?.textContent;
  info.alt = img.getAttribute("alt") || "";
  info.caption = (figcaption || info.alt || img.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 300);
  return info;
}
