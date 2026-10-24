// Downloading and verifying images. Candidates are tried in order; the first one that
// really is an image (checked from its bytes, not from the server's say-so) wins.

const MIN_BYTES = 100; // tracking pixels / placeholder GIFs are smaller than this

const ascii = (bytes, start, end) => String.fromCharCode(...bytes.slice(start, end));

/** Identifies an image from its first bytes. @returns {{mime:string, ext:string}|null} */
export function sniffImage(bytes) {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(bytes, 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (ascii(bytes, 4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(bytes, 8, 12))) return { mime: "image/avif", ext: "avif" };
  if (ascii(bytes, 0, 2) === "BM") return { mime: "image/bmp", ext: "bmp" };
  if (ascii(bytes, 0, 4) === "II*\0" || ascii(bytes, 0, 4) === "MM\0*") return { mime: "image/tiff", ext: "tif" };
  const head = ascii(bytes, 0, Math.min(bytes.length, 512)).toLowerCase();
  if (head.includes("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return { mime: "image/svg+xml", ext: "svg" };
  return null;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchOne(url, { timeoutMs, maxBytes }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // credentials: "include" so images behind the site's login (which this browser has) still download.
    const res = await fetch(url, { signal: controller.signal, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (declared > maxBytes) throw new Error("file too large");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw new Error("file too large");
    if (bytes.length < MIN_BYTES) throw new Error("too small to be a real image");
    const type = sniffImage(bytes);
    if (!type) throw new Error("not an image");
    return { bytes, ...type };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{url:string, source:string}[]} candidates
 * @returns {Promise<{ok:true, bytes:Uint8Array, mime:string, ext:string, url:string, source:string, hash:string}
 *                  | {ok:false, attempts:{url:string, error:string}[]}>}
 */
export async function downloadFirstImage(candidates, { timeoutMs = 20000, maxBytes = 30 * 1024 * 1024 } = {}) {
  const attempts = [];
  for (const c of candidates) {
    try {
      const img = await fetchOne(c.url, { timeoutMs, maxBytes });
      const hash = (await sha256Hex(img.bytes)).slice(0, 8);
      return { ok: true, ...img, url: c.url, source: c.source, hash };
    } catch (err) {
      const aborted = err?.name === "AbortError";
      attempts.push({ url: c.url, error: aborted ? "timed out" : String(err?.message ?? err) });
    }
  }
  return { ok: false, attempts };
}
