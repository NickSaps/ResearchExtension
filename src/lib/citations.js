// Citation formatting: APA 7th, MLA 9th, Chicago 17th (notes-bibliography).
//
// Every formatter returns a string where *asterisks* mark italics. Use citationToPlain()
// or citationToHtml() to get plain text or rich text. Titles are used exactly as
// captured: we can't reliably convert capitalization (APA wants sentence case,
// MLA/Chicago title case), so fix those in the metadata editor if needed.

// ---------- Output conversions ----------

export const citationToPlain = (s) => s.replace(/\*/g, "");

export function citationToHtml(s) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*([^*]+)\*/g, "<i>$1</i>");
}

// ---------- Small helpers ----------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MLA_MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

// Asterisks are our italic marker, so they can't appear in the data.
const clean = (v) => String(v ?? "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
const italic = (s) => (s ? `*${s}*` : "");

/** Ends a sentence with a period unless it already ends with . ? ! (ignoring italics markers and quotes). */
function end(s) {
  if (!s) return "";
  return /[.?!]["”*]*$/.test(s) ? s : s + ".";
}

function parseDate(value) {
  const m = String(value ?? "").match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return null;
  return { y: +m[1], m: m[2] ? +m[2] : 0, d: m[3] ? +m[3] : 0 };
}

const normalize = (meta) => ({
  type: meta.type || "web-page",
  title: clean(meta.title),
  authors: meta.authors ?? [],
  site: clean(meta.site),
  publisher: clean(meta.publisher),
  journal: clean(meta.journal),
  volume: clean(meta.volume),
  issue: clean(meta.issue),
  pages: clean(meta.pages),
  doi: clean(meta.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""),
  url: clean(meta.url),
  date: parseDate(meta.published),
  accessed: parseDate(meta.accessed),
});

const doiUrl = (m) => (m.doi ? `https://doi.org/${m.doi}` : "");
const family = (a) => clean(a.literal ?? a.family);
const sameText = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

// ---------- APA 7 ----------

function apaInitials(given) {
  return clean(given)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) =>
      token
        .split("-")
        .map((p) => (p ? `${p[0].toUpperCase()}.` : ""))
        .join("-"),
    )
    .join(" ");
}

function apaName(a) {
  if (a.literal) return clean(a.literal);
  const initials = apaInitials(a.given);
  const name = initials ? `${clean(a.family)}, ${initials}` : clean(a.family);
  return a.suffix ? `${name}, ${a.suffix}` : name;
}

function apaAuthors(authors) {
  const names = authors.map(apaName);
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]}, & ${names[1]}`;
  if (names.length <= 20) return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
}

function apaDate(m, { full }) {
  const d = m.date;
  if (!d) return "n.d.";
  if (!full || !d.m) return String(d.y);
  return d.d ? `${d.y}, ${MONTHS[d.m - 1]} ${d.d}` : `${d.y}, ${MONTHS[d.m - 1]}`;
}

function apa(meta) {
  const m = normalize(meta);
  const authors = apaAuthors(m.authors);
  const link = doiUrl(m) || m.url;
  const date = (full) => `(${apaDate(m, { full })}).`;
  // A site name that just repeats the author (e.g. an organization's own website) is left out.
  const site = m.authors.length === 1 && sameText(family(m.authors[0]), m.site) ? "" : m.site;

  let parts;
  switch (m.type) {
    case "journal-article": {
      let source = italic(m.journal || m.site);
      if (m.volume) source += `, ${italic(m.volume)}`;
      if (m.issue) source += `(${m.issue})`;
      if (m.pages) source += `, ${m.pages}`;
      parts = authors
        ? [end(authors), date(false), end(m.title), end(source), link]
        : [end(m.title), date(false), end(source), link];
      break;
    }
    case "book":
      parts = authors
        ? [end(authors), date(false), end(italic(m.title)), end(m.publisher), doiUrl(m)]
        : [end(italic(m.title)), date(false), end(m.publisher), doiUrl(m)];
      break;
    case "video":
      parts = authors
        ? [end(authors), date(true), end(`${italic(m.title)} [Video]`), end(m.site), link]
        : [end(`${italic(m.title)} [Video]`), date(true), end(m.site), link];
      break;
    case "news-article":
      parts = authors
        ? [end(authors), date(true), end(m.title), end(italic(m.site)), link]
        : [end(m.title), date(true), end(italic(m.site)), link];
      break;
    default: // web-page
      parts = authors
        ? [end(authors), date(true), end(italic(m.title)), end(site), link]
        : [end(italic(m.title)), date(true), end(site), link];
  }
  return parts.filter(Boolean).join(" ");
}

// ---------- MLA 9 ----------

function mlaFirstLast(a) {
  if (a.literal) return clean(a.literal);
  return [clean(a.given), clean(a.family), a.suffix].filter(Boolean).join(" ");
}

function mlaInverted(a) {
  if (a.literal) return clean(a.literal);
  const given = clean(a.given);
  const name = given ? `${clean(a.family)}, ${given}` : clean(a.family);
  return a.suffix ? `${name}, ${a.suffix}` : name;
}

function mlaAuthors(authors) {
  if (!authors.length) return "";
  if (authors.length === 1) return mlaInverted(authors[0]);
  if (authors.length === 2) return `${mlaInverted(authors[0])}, and ${mlaFirstLast(authors[1])}`;
  return `${mlaInverted(authors[0])}, et al.`;
}

function mlaDate(m) {
  const d = m.date;
  if (!d) return "";
  if (!d.m) return String(d.y);
  return d.d ? `${d.d} ${MLA_MONTHS[d.m - 1]} ${d.y}` : `${MLA_MONTHS[d.m - 1]} ${d.y}`;
}

// MLA drops the protocol from web addresses (DOIs keep it, as a full link).
const mlaUrl = (m) => doiUrl(m) || m.url.replace(/^https?:\/\//i, "");

const mlaQuoted = (t) => (t ? `"${/[.?!]$/.test(t) ? t : t + "."}"` : "");

function mlaAccessed(m) {
  const a = m.accessed;
  if (!a || !a.m) return "";
  return `Accessed ${a.d} ${MLA_MONTHS[a.m - 1]} ${a.y}.`;
}

function mla(meta) {
  const m = normalize(meta);
  const authors = mlaAuthors(m.authors);
  const date = mlaDate(m);
  const accessed = date ? "" : mlaAccessed(m); // no publication date: give the access date instead
  const container = (items) => end(items.filter(Boolean).join(", "));
  const publisher = sameText(m.publisher, m.site) ? "" : m.publisher;

  let parts;
  switch (m.type) {
    case "journal-article": {
      const pages = m.pages ? (/[–-]/.test(m.pages) ? `pp. ${m.pages}` : `p. ${m.pages}`) : "";
      parts = [
        end(authors),
        mlaQuoted(m.title),
        // Year only: the captured date is usually the online date, not the issue's date.
        container([italic(m.journal || m.site), m.volume && `vol. ${m.volume}`, m.issue && `no. ${m.issue}`, m.date && String(m.date.y), pages, mlaUrl(m)]),
        accessed,
      ];
      break;
    }
    case "book":
      parts = [end(authors), end(italic(m.title)), container([publisher || m.site, date]), accessed];
      break;
    case "video": {
      const uploader = m.authors.length ? `uploaded by ${m.authors.map(mlaFirstLast).join(" and ")}` : "";
      parts = [mlaQuoted(m.title), container([italic(m.site), uploader, date, mlaUrl(m)]), accessed];
      break;
    }
    default: // web-page and news-article share the same container pattern
      parts = [
        end(authors),
        mlaQuoted(m.title),
        container([italic(m.site), m.type === "web-page" ? publisher : "", date, mlaUrl(m)]),
        accessed,
      ];
  }
  return parts.filter(Boolean).join(" ");
}

// ---------- Chicago 17 (notes-bibliography) ----------

const chicagoFirstLast = mlaFirstLast;
const chicagoInverted = mlaInverted;

function chicagoBibAuthors(authors) {
  if (!authors.length) return "";
  const names = authors.map((a, i) => (i === 0 ? chicagoInverted(a) : chicagoFirstLast(a)));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, and ${names[1]}`;
  if (names.length <= 10) return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${names.slice(0, 7).join(", ")}, et al.`;
}

function chicagoNoteAuthors(authors) {
  const names = authors.map(chicagoFirstLast);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]} et al.`;
}

function chicagoDate(d) {
  if (!d) return "";
  if (!d.m) return String(d.y);
  return d.d ? `${MONTHS[d.m - 1]} ${d.d}, ${d.y}` : `${MONTHS[d.m - 1]} ${d.y}`;
}

const chicagoAccessed = (m) => (m.accessed?.m ? `${chicagoDate(m.accessed)}` : "");

/** "Title." (bibliography) or "Title," (note); question/exclamation marks replace the punctuation. */
const chicagoQuoted = (t, mark) => (t ? `"${/[.?!]$/.test(t) ? t : t + mark}"` : "");

function chicagoBibliography(meta) {
  const m = normalize(meta);
  const authors = chicagoBibAuthors(m.authors);
  const date = chicagoDate(m.date);
  const accessed = !date && chicagoAccessed(m) ? `Accessed ${chicagoAccessed(m)}.` : "";
  const link = doiUrl(m) || m.url;
  const q = chicagoQuoted(m.title, ".");

  let parts;
  switch (m.type) {
    case "journal-article": {
      let source = italic(m.journal || m.site);
      if (m.volume) source += ` ${m.volume}`;
      if (m.issue) source += `, no. ${m.issue}`;
      source += ` (${m.date ? m.date.y : "n.d."})`;
      if (m.pages) source += `: ${m.pages}`;
      parts = [end(authors), q, end(source), link && end(link)];
      break;
    }
    case "book":
      parts = [end(authors), end(italic(m.title)), end([m.publisher, m.date ? m.date.y : "n.d."].filter(Boolean).join(", ")), doiUrl(m) && end(doiUrl(m))];
      break;
    case "video":
      parts = [end(authors), q, end(m.site ? `${m.site} video` : "Video"), date && end(date), accessed, link && end(link)];
      break;
    case "news-article":
      parts = [end(authors), q, end([italic(m.site), date].filter(Boolean).join(", ")), accessed, link && end(link)];
      break;
    default:
      parts = [end(authors), q, end(m.site), date && end(date), accessed, link && end(link)];
  }
  return parts.filter(Boolean).join(" ");
}

/** The first-reference footnote (without its number). */
export function formatChicagoNote(meta) {
  const m = normalize(meta);
  const authors = chicagoNoteAuthors(m.authors);
  const date = chicagoDate(m.date);
  const accessed = !date && chicagoAccessed(m) ? `accessed ${chicagoAccessed(m)}` : "";
  const link = doiUrl(m) || m.url;
  const lead = authors ? `${authors}, ` : "";

  // Quoted title followed by comma-separated details, ending in a period.
  const withDetails = (details) => {
    const items = details.filter(Boolean);
    const q = chicagoQuoted(m.title, items.length ? "," : ".");
    return `${lead}${q}${items.length ? ` ${items.join(", ")}.` : ""}`;
  };

  switch (m.type) {
    case "journal-article": {
      let source = italic(m.journal || m.site);
      if (m.volume) source += ` ${m.volume}`;
      if (m.issue) source += `, no. ${m.issue}`;
      source += ` (${m.date ? m.date.y : "n.d."})`;
      if (m.pages) source += `: ${m.pages}`;
      return `${lead}${chicagoQuoted(m.title, ",")} ${source}${link ? `, ${link}` : ""}.`;
    }
    case "book": {
      const pub = [m.publisher, m.date ? m.date.y : "n.d."].filter(Boolean).join(", ");
      return `${lead}${italic(m.title)} (${pub}).`;
    }
    case "video":
      return withDetails([m.site ? `${m.site} video` : "video", date || accessed, link]);
    case "news-article":
      return withDetails([italic(m.site), date || accessed, link]);
    default:
      return withDetails([m.site, date || accessed, link]);
  }
}

// ---------- Public API ----------

export const STYLES = { apa: "APA 7", mla: "MLA 9", chicago: "Chicago 17" };

/** Bibliography / reference-list entry for one source. */
export function formatCitation(meta, style) {
  if (style === "apa") return apa(meta);
  if (style === "mla") return mla(meta);
  if (style === "chicago") return chicagoBibliography(meta);
  throw new Error(`Unknown citation style: ${style}`);
}

function sortKey(meta) {
  const first = (meta.authors ?? [])[0];
  const name = first ? family(first) : clean(meta.title).replace(/^(a|an|the)\s+/i, "");
  return name.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim();
}

/** Alphabetical by first author (or title when there is no author), then by year. */
export function sortForBibliography(metas) {
  return [...metas].sort(
    (a, b) =>
      sortKey(a).localeCompare(sortKey(b), "en") ||
      String(a.published ?? "").localeCompare(String(b.published ?? "")) ||
      clean(a.title).localeCompare(clean(b.title), "en"),
  );
}

/**
 * @param format "md" keeps italics as *text*; "txt" is plain text.
 * @returns the full bibliography, entries separated by a blank line
 */
export function formatBibliography(metas, style, format = "txt") {
  const heading = { apa: "References", mla: "Works Cited", chicago: "Bibliography" }[style];
  const entries = sortForBibliography(metas).map((m) => formatCitation(m, style));
  const body = entries.map((e) => (format === "md" ? e : citationToPlain(e))).join("\n\n");
  return format === "md" ? `# ${heading}\n\n${body}\n` : `${heading}\n\n${body}\n`;
}

