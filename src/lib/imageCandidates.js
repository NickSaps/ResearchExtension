// Works out which URLs might hold the highest-resolution version of an image,
// from the raw attributes reported by extractImageInfo() (see extractPage.js).
// Order is best-first: srcset > parent link to an image file > lazy-load attributes > displayed src.

const IMAGE_PATH = /\.(jpe?g|png|gif|webp|avif|bmp|svg|tiff?)$/i;
const MAX_SRCSET_ENTRIES = 3;

/** Parses an HTML srcset attribute into [{url, score}], best first. Handles commas inside URLs. */
export function parseSrcset(str) {
  const entries = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && /[\s,]/.test(str[i])) i++;
    if (i >= str.length) break;
    let j = i;
    while (j < str.length && !/\s/.test(str[j])) j++;
    let url = str.slice(i, j);
    i = j;
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, ""); // no descriptor: the comma ended this entry
    } else {
      let k = str.indexOf(",", i);
      if (k === -1) k = str.length;
      descriptor = str.slice(i, k).trim();
      i = k + 1;
    }
    const m = descriptor.match(/^(\d+(?:\.\d+)?)([wx])$/i);
    // "2x" entries are scored on a rough pixel scale so they sort alongside "w" entries.
    const score = m ? (m[2].toLowerCase() === "w" ? +m[1] : +m[1] * 1000) : 1;
    if (url) entries.push({ url, score });
  }
  return entries.sort((a, b) => b.score - a.score);
}

function resolve(raw, base, { allowData = false } = {}) {
  try {
    const u = new URL(raw.trim(), base);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    if (allowData && u.protocol === "data:") return u.href;
  } catch {
    // unparseable: skip
  }
  return null;
}

/**
 * @param info { srcUrl, baseURI, srcsets: string[], links: string[], lazy: {attr, value}[] }
 * @returns {{url:string, source:string}[]}
 */
export function gatherCandidates(info) {
  const base = info.baseURI || info.srcUrl;
  const out = [];
  const seen = new Set();
  const add = (raw, source, opts) => {
    const url = raw && resolve(raw, base, opts);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, source });
  };

  const srcsetEntries = (info.srcsets ?? []).flatMap(parseSrcset).sort((a, b) => b.score - a.score);
  for (const e of srcsetEntries.slice(0, MAX_SRCSET_ENTRIES)) add(e.url, "srcset");

  for (const href of info.links ?? []) {
    try {
      if (IMAGE_PATH.test(new URL(href, base).pathname)) add(href, "link");
    } catch {
      // ignore bad hrefs
    }
  }

  for (const { attr, value } of info.lazy ?? []) {
    if (/^\s*data:/i.test(value)) continue; // placeholder pixel, not the real image
    add(value, `lazy:${attr}`);
  }

  add(info.srcUrl, "src", { allowData: true });
  return out;
}
