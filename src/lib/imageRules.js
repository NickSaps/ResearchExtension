// Site-specific rules that turn a thumbnail URL into the full-size original.
//
// TO ADD A SITE: append an object to RULES.
//   name:    short label, shown in the candidate's "source" (e.g. "src+wikimedia")
//   match:   (url: URL) => boolean       does this rule apply to this image URL?
//   rewrite: (url: URL) => string[]      full-size URL guesses, best first (may be empty)
//
// Guesses don't need to be right: every candidate is downloaded in order and checked
// to really be an image, and the original thumbnail URL is always tried last.

const hostIs = (u, ...hosts) => hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h));

function withoutParams(u, names) {
  const copy = new URL(u.href);
  let changed = false;
  for (const n of names) {
    if (copy.searchParams.has(n)) {
      copy.searchParams.delete(n);
      changed = true;
    }
  }
  return changed ? copy.href : null;
}

function withPath(u, pathname) {
  const copy = new URL(u.href);
  copy.pathname = pathname;
  return copy.href;
}

const compact = (arr) => arr.filter(Boolean);

export const RULES = [
  {
    // .../commons/thumb/a/ab/File.jpg/220px-File.jpg  ->  .../commons/a/ab/File.jpg
    name: "wikimedia",
    match: (u) => hostIs(u, "wikimedia.org", "wikipedia.org") && u.pathname.includes("/thumb/"),
    rewrite: (u) => {
      const m = u.pathname.match(/^(.*?)\/thumb\/(.+?)\/[^/]+$/);
      // Originals like TIFF/PDF can't be shown in a note, so keep the rendered thumbnail.
      if (!m || /\.(tiff?|pdf|djvu|xcf|ogv|webm|ogg|oga|mid|stl)$/i.test(m[2])) return [];
      return [withPath(u, `${m[1]}/${m[2]}`).replace(/\?.*$/, "")];
    },
  },
  {
    // photo-300x200.jpg -> photo.jpg ; photo-scaled.jpg -> photo.jpg
    name: "wordpress",
    match: (u) => /-(\d+x\d+|scaled)\.(jpe?g|png|gif|webp|avif)$/i.test(u.pathname),
    rewrite: (u) => [withPath(u, u.pathname.replace(/-(\d+x\d+|scaled)(\.[a-z0-9]+)$/i, "$2"))],
  },
  {
    // product_300x.jpg -> product.jpg ; also drops ?width=... parameters
    name: "shopify",
    match: (u) => u.hostname === "cdn.shopify.com" || u.pathname.includes("/cdn/shop/"),
    rewrite: (u) => {
      const stripped = u.pathname.replace(
        /_(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|master)(?:@\d+x)?(\.[a-z0-9]+)$/i,
        "$1",
      );
      const copy = new URL(withPath(u, stripped));
      for (const p of ["width", "height", "crop"]) copy.searchParams.delete(p);
      return copy.href === u.href ? [] : [copy.href];
    },
  },
  {
    // .../I/71abc._AC_UY218_.jpg -> .../I/71abc.jpg
    name: "amazon",
    match: (u) => hostIs(u, "media-amazon.com", "ssl-images-amazon.com", "images-amazon.com"),
    rewrite: (u) => {
      const stripped = u.pathname.replace(/\._[^/]*_(\.[a-z0-9]+)$/i, "$1");
      return stripped === u.pathname ? [] : [withPath(u, stripped)];
    },
  },
  {
    // pbs.twimg.com/media/ID?format=jpg&name=small -> name=orig ; profile pictures lose _normal
    name: "twitter",
    match: (u) => u.hostname === "pbs.twimg.com",
    rewrite: (u) => {
      const copy = new URL(u.href);
      if (copy.pathname.startsWith("/media/")) {
        copy.searchParams.set("name", "orig");
        copy.pathname = copy.pathname.replace(/:(?:small|medium|large|thumb|\d+x\d+)$/, ":orig");
      } else if (copy.pathname.startsWith("/profile_images/")) {
        copy.pathname = copy.pathname.replace(/_(?:normal|bigger|mini|200x200|400x400|reasonably_small)(\.[a-z0-9]+)$/i, "$1");
      }
      return copy.href === u.href ? [] : [copy.href];
    },
  },
  {
    // preview.redd.it/ID.jpg?width=640&... -> i.redd.it/ID.jpg
    name: "reddit",
    match: (u) => u.hostname === "preview.redd.it",
    rewrite: (u) => (/^\/[^/]+\.[a-z0-9]+$/i.test(u.pathname) ? [`https://i.redd.it${u.pathname}`] : []),
  },
  {
    // i.pinimg.com/236x/ab/cd/hash.jpg -> i.pinimg.com/originals/ab/cd/hash.jpg
    name: "pinterest",
    match: (u) => u.hostname === "i.pinimg.com",
    rewrite: (u) => {
      const stripped = u.pathname.replace(/^\/\d+x(?:\d+)?(?:_RS)?\//i, "/originals/");
      return stripped === u.pathname ? [] : [withPath(u, stripped)];
    },
  },
  {
    // Resizing services: removing the size parameters returns the original.
    name: "imgix-like",
    match: (u) => hostIs(u, "unsplash.com", "imgix.net") || /^i\d\.wp\.com$/.test(u.hostname),
    rewrite: (u) =>
      compact([withoutParams(u, ["w", "h", "width", "height", "fit", "crop", "dpr", "q", "quality", "auto", "resize", "fm"])]),
  },
];

/**
 * Turns the base candidates (ordered best-first, from imageCandidates.js) into the
 * final try-list: for each base, its rewrites first, then the base itself.
 * @param {{url:string, source:string}[]} base
 * @returns {{url:string, source:string}[]}
 */
export function expandCandidates(base, max = 12) {
  const out = [];
  const seen = new Set();
  const add = (url, source) => {
    if (seen.has(url) || out.length >= max) return;
    seen.add(url);
    out.push({ url, source });
  };
  for (const c of base) {
    let u;
    try {
      u = new URL(c.url);
    } catch {
      continue;
    }
    for (const rule of RULES) {
      if (!rule.match(u)) continue;
      for (const r of rule.rewrite(u)) add(r, `${c.source}+${rule.name}`);
    }
    add(c.url, c.source);
  }
  return out;
}
