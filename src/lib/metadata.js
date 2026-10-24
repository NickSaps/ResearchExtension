// Turns the raw data collected from a page (extractPage.js) into one clean
// metadata record. Sources are merged in priority order:
// citation_* > JSON-LD > Dublin Core > OpenGraph/Twitter > plain fallbacks.

// ---------- Names ----------

const ORG_WORDS = new RegExp(
  "\\b(university|college|institute|association|society|department|ministry|committee|council|" +
    "commission|agency|bureau|foundation|organi[sz]ation|corporation|company|inc|llc|ltd|gmbh|" +
    "group|press|news|times|network|staff|team|editors|editorial|board|office|center|centre|" +
    "laboratory|laboratories|project|initiative|authority|administration|government|service|" +
    "services|bbc|cnn|npr|nasa)\\b",
  "i",
);
const PARTICLES = new Set([
  "van", "von", "de", "del", "della", "der", "den", "di", "da", "du", "la", "le", "bin", "ibn", "al", "st.", "ter", "ten",
]);
const SUFFIXES = /^(jr|sr|ii|iii|iv|phd|md|esq)\.?$/i;
const DEGREES = /,?\s+(ph\.?d\.?|m\.?d\.?|dr\.?|prof\.?)$/i;

/** @returns {{given:string, family:string, suffix?:string, literal?:string}|null} */
export function parseAuthor(input) {
  let s = String(input ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*by\s+/i, "")
    .replace(/\([^)]*\)|\S+@\S+/g, "")
    .replace(/\s+/g, " ")
    .replace(/[,;]+\s*$/, "")
    .trim();
  s = s.replace(DEGREES, "").replace(/^(dr|prof)\.?\s+/i, "").trim();
  if (!s || /^https?:/i.test(s)) return null;

  if (ORG_WORDS.test(s) || /\d/.test(s) || /^[A-Z0-9&.\s-]{4,}$/.test(s)) {
    return { given: "", family: "", literal: s };
  }

  if (s.includes(",")) {
    const [family, given, extra] = s.split(",").map((p) => p.trim());
    const out = { given: given ?? "", family };
    if (extra && SUFFIXES.test(extra)) out.suffix = extra;
    return out;
  }

  const tokens = s.split(" ");
  if (tokens.length === 1) return { given: "", family: tokens[0] };

  let suffix;
  if (tokens.length > 2 && SUFFIXES.test(tokens[tokens.length - 1])) suffix = tokens.pop();
  let i = tokens.length - 1; // index where the family name starts
  while (i > 1 && PARTICLES.has(tokens[i - 1].toLowerCase())) i--;
  const out = { given: tokens.slice(0, i).join(" "), family: tokens.slice(i).join(" ") };
  if (suffix) out.suffix = suffix;
  return out;
}

export function authorDisplay(a) {
  return a.literal ?? [a.given, a.family, a.suffix].filter(Boolean).join(" ");
}

/** One line per author, as shown in the metadata editor: "Family, Given", or {Organization}. */
export function authorLine(a) {
  if (a.literal) return `{${a.literal}}`;
  const name = a.given ? `${a.family}, ${a.given}` : a.family;
  return a.suffix ? `${name}, ${a.suffix}` : name;
}

/** Reverse of authorLine. Also accepts "Given Family". Lines in {braces} are organizations. */
export function parseAuthorLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const org = line.match(/^\{(.+)\}$/);
      return org ? { given: "", family: "", literal: org[1].trim() } : parseAuthor(line);
    })
    .filter(Boolean);
}

/** Accepts one string or an array; splits combined lists like "A and B; C". */
export function parseAuthors(input) {
  const strings = (Array.isArray(input) ? input : [input]).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const str of strings) {
    for (const piece of String(str).split(/;|\n|\s+and\s+|\s*&\s*/i)) {
      let names = [piece];
      // "Jane Doe, John Smith" is a list, but "Doe, Jane" is one name.
      if (piece.includes(",")) {
        const parts = piece.split(",").map((p) => p.trim()).filter(Boolean);
        const multiWord = (p) => p.split(/\s+/).length >= 2;
        if (parts.length >= 2 && parts.every(multiWord) && !SUFFIXES.test(parts[parts.length - 1])) {
          names = parts;
        }
      }
      for (const n of names) {
        const a = parseAuthor(n);
        if (!a) continue;
        const key = authorDisplay(a).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(a);
      }
    }
  }
  return out;
}

// ---------- Dates ----------

/** Returns "YYYY", "YYYY-MM" or "YYYY-MM-DD", or "" if unparseable. */
export function normalizeDate(input) {
  const s = String(input ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})(?:[-/.](\d{1,2}))?(?:[-/.](\d{1,2}))?(?!\d)/);
  if (m) {
    const [, y, mo, d] = m;
    if (mo && (+mo < 1 || +mo > 12)) return y;
    if (d && (+d < 1 || +d > 31)) return mo ? `${y}-${mo.padStart(2, "0")}` : y;
    return [y, mo?.padStart(2, "0"), d?.padStart(2, "0")].filter(Boolean).join("-");
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return "";
  const dt = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// ---------- DOI ----------

const DOI_RE = /\b10\.\d{4,9}\/[^\s"'<>]+/i;

export function findDoi(value) {
  if (!value) return "";
  let s = String(value);
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep the raw string
  }
  const m = s.match(DOI_RE);
  return m ? m[0].replace(/[.,;)\]]+$/, "") : "";
}

// ---------- Merge ----------

const first = (...vals) => vals.find((v) => v != null && String(v).trim() !== "") ?? "";
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v) => (typeof v === "string" ? v : v?.name ?? v?.["@value"] ?? "");

function ldTypes(node) {
  return asArray(node["@type"]).map(String);
}

const LD_PRIORITY = [
  ["ScholarlyArticle", "MedicalScholarlyArticle"],
  ["NewsArticle", "ReportageNewsArticle", "AnalysisNewsArticle", "OpinionNewsArticle"],
  ["Article", "BlogPosting", "TechArticle", "Report", "SocialMediaPosting"],
  ["Book"],
  ["VideoObject", "Movie"],
  ["WebPage", "ItemPage", "CollectionPage"],
];

function pickLdNode(nodes) {
  for (const group of LD_PRIORITY) {
    const node = nodes.find((n) => ldTypes(n).some((t) => group.includes(t)));
    if (node) return node;
  }
  return null;
}

// Authors/publishers in a @graph are often bare {"@id": "..."} references.
function resolveRef(ref, nodes) {
  if (ref && typeof ref === "object" && ref["@id"] && Object.keys(ref).length === 1) {
    return nodes.find((n) => n["@id"] === ref["@id"]) ?? ref;
  }
  return ref;
}

function ldAuthors(node, nodes) {
  return asArray(node?.author)
    .map((a) => resolveRef(a, nodes))
    .map((a) => {
      const name = text(a);
      if (!name) return null;
      const isOrg = ldTypes(a ?? {}).some((t) => /organization/i.test(t));
      return isOrg ? { given: "", family: "", literal: name } : parseAuthor(name);
    })
    .filter(Boolean);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function classify({ m, node, url }) {
  const ogType = (m("og:type") || "").toLowerCase();
  const types = node ? ldTypes(node) : [];
  const host = hostnameOf(url);
  if (m("citation_journal_title") || types.includes("ScholarlyArticle") || types.includes("MedicalScholarlyArticle")) {
    return "journal-article";
  }
  if (ogType.startsWith("video") || types.includes("VideoObject") || /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) {
    return "video";
  }
  if (ogType === "book" || m("citation_isbn") || types.includes("Book")) return "book";
  if (types.some((t) => /NewsArticle$/.test(t))) return "news-article";
  return "web-page";
}

/**
 * @param {object} raw       result of extractPageData()
 * @param {object} [opts]    { url, accessed } overrides
 */
export function mergeMetadata(raw, opts = {}) {
  const url = opts.url ?? raw.url;
  const nodes = raw.jsonld ?? [];
  const node = pickLdNode(nodes);
  const all = (...keys) => keys.flatMap((k) => raw.meta[k.toLowerCase()] ?? []);
  const m = (...keys) => first(...all(...keys));

  const publisherNode = resolveRef(node?.publisher, nodes);

  const title = first(
    m("citation_title"), text(node?.headline), text(node?.name), m("dc.title", "dcterms.title"),
    m("og:title", "twitter:title"), raw.title,
  ).replace(/\s+/g, " ").trim();

  let authors = parseAuthors(all("citation_author"));
  if (!authors.length) authors = ldAuthors(node, nodes);
  if (!authors.length) authors = parseAuthors(all("dc.creator", "dcterms.creator", "dc.contributor"));
  if (!authors.length) authors = parseAuthors(all("author", "article:author", "itemprop:author", "parsely-author"));

  const published = first(
    normalizeDate(m("citation_publication_date", "citation_date", "citation_online_date")),
    normalizeDate(node?.datePublished),
    normalizeDate(m("dc.date.issued", "dcterms.issued", "dc.date", "dcterms.date", "dc.date.created")),
    normalizeDate(m("article:published_time", "og:article:published_time", "itemprop:datepublished", "date", "pubdate", "publishdate")),
  );
  const modified = first(
    normalizeDate(node?.dateModified),
    normalizeDate(m("article:modified_time", "og:updated_time", "itemprop:datemodified", "last-modified")),
  );

  const siteName = first(m("og:site_name", "application-name"), text(publisherNode));
  const host = hostnameOf(url);

  const firstPage = m("citation_firstpage");
  const lastPage = m("citation_lastpage");
  const pages = firstPage && lastPage && firstPage !== lastPage ? `${firstPage}–${lastPage}` : first(firstPage, m("citation_pages"));

  const doiCandidates = [
    m("citation_doi"), m("prism.doi"), m("dc.identifier.doi"), node?.doi, text(node?.identifier),
    ...all("dc.identifier", "dcterms.identifier", "citation_public_url"), url,
    ...Object.values(raw.meta).flat().filter((v) => v.length < 300),
  ];
  const doi = first(...doiCandidates.map(findDoi));

  const type = classify({ m, node, url });
  const journal = m("citation_journal_title", "prism.publicationname");

  return {
    title: title || host,
    authors,
    type,
    site: first(siteName, journal, host),
    published,
    modified,
    accessed: opts.accessed ?? "",
    url, // the real page URL, not canonical: a wrong canonical must not merge unrelated pages into one note
    doi,
    journal,
    volume: m("citation_volume", "prism.volume"),
    issue: m("citation_issue", "prism.number"),
    pages,
    publisher: first(m("citation_publisher", "dc.publisher", "dcterms.publisher"), text(publisherNode), siteName),
    isbn: m("citation_isbn"),
    description: first(m("citation_abstract", "og:description", "twitter:description", "description", "dc.description")),
    image: m("og:image", "twitter:image"),
    language: first(m("citation_language", "dc.language", "og:locale"), raw.lang),
  };
}
