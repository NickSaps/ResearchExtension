// CrossRef enrichment: given a DOI, fetch clean citation data from api.crossref.org.
// This is the only network request Gleaner makes besides your local Obsidian, and it
// happens only when you press "Fetch from CrossRef". Only the DOI is sent.

const TYPE_MAP = {
  "journal-article": "journal-article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "proceedings-article": "journal-article",
};

// CrossRef titles can contain markup such as <i> or MathML.
function plain(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function dateString(parts) {
  const [y, m, d] = (parts ?? []).filter((n) => Number.isInteger(n));
  if (!y) return "";
  const p = (n) => String(n).padStart(2, "0");
  return [y, m && p(m), m && d && p(d)].filter(Boolean).join("-");
}

/**
 * Merges a CrossRef record into existing metadata. CrossRef wins for the fields it
 * provides; everything else (URL, access date, ...) is kept.
 * @param message  the `message` object of a CrossRef /works response
 * @param existing the metadata being enriched
 */
export function crossrefToMeta(message, existing) {
  const out = { ...existing };
  const set = (key, value) => {
    if (value) out[key] = value;
  };

  set("title", plain(message.title?.[0]));
  const authors = (message.author ?? [])
    .map((a) => (a.name ? { given: "", family: "", literal: plain(a.name) } : { given: plain(a.given), family: plain(a.family) }))
    .filter((a) => a.literal || a.family);
  if (authors.length) out.authors = authors;

  if (TYPE_MAP[message.type]) out.type = TYPE_MAP[message.type];
  const journal = plain(message["container-title"]?.[0]);
  set("journal", out.type === "journal-article" ? journal : "");
  set("volume", plain(message.volume));
  set("issue", plain(message.issue));
  set("pages", plain(message.page).replace(/(\w)-(\w)/, "$1–$2"));
  set("publisher", plain(message.publisher));
  set("isbn", plain(message.ISBN?.[0]));
  set("doi", plain(message.DOI));
  set("published", dateString((message.issued ?? message["published-print"] ?? message["published-online"])?.["date-parts"]?.[0]));
  if (out.type === "journal-article" && journal) out.site = journal;
  return out;
}

/** @returns the CrossRef `message` for a DOI. Throws an Error with a user-readable message. */
export async function fetchCrossref(doi) {
  const path = doi.split("/").map(encodeURIComponent).join("/");
  let res;
  try {
    res = await fetch(`https://api.crossref.org/works/${path}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Couldn't reach CrossRef. Check your internet connection.");
  }
  if (res.status === 404) throw new Error("CrossRef doesn't know that DOI.");
  if (!res.ok) throw new Error(`CrossRef returned HTTP ${res.status}.`);
  const body = await res.json();
  return body.message;
}
