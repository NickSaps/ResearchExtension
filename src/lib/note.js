// Pure functions that build and edit the Markdown for a source note.
import { authorDisplay } from "./metadata.js";

// ---------- Filenames & URLs ----------

const FORBIDDEN_FILENAME_CHARS = /[*"\\/<>:|?#^[\]]/g;

export function sanitizeFilename(name, maxLength = 80) {
  let s = String(name ?? "")
    .replace(FORBIDDEN_FILENAME_CHARS, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
    const lastSpace = s.lastIndexOf(" ");
    if (lastSpace > maxLength * 0.6) s = s.slice(0, lastSpace);
  }
  s = s.replace(/^[.\s]+|[.\s]+$/g, "");
  return s || "Untitled";
}

const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src)$/i;

/** Drops the fragment and tracking parameters, so the same page maps to one note. */
export function cleanUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return String(url);
  }
}

/** Identity of a source: cleaned URL, lowercase host, no trailing slash. */
export function urlKey(url) {
  try {
    const u = new URL(cleanUrl(url));
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return String(url);
  }
}

export function normalizeFolder(folder) {
  const f = String(folder ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return f ? f + "/" : "";
}

// ---------- Dates ----------

const pad = (n) => String(n).padStart(2, "0");

export function localDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateTime(iso) {
  const d = new Date(iso);
  return `${localDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- Selection text ----------

/** Tidies window.getSelection().toString(); blank lines separate paragraphs. */
export function normalizeSelection(raw) {
  const lines = String(raw ?? "").replace(/\r/g, "").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  const hasBlank = lines.some((l, i) => !l && i > 0 && i < lines.length - 1);
  const paragraphs = [];
  let current = [];
  for (const line of lines) {
    if (line) {
      current.push(line);
    } else if (current.length) {
      paragraphs.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) paragraphs.push(current.join(" "));
  // Browsers differ on whether block elements give "\n" or "\n\n"; either way, treat
  // each separate line as its own paragraph unless blank lines were already used.
  if (!hasBlank && lines.filter(Boolean).length > 1) {
    return lines.filter(Boolean).join("\n\n");
  }
  return paragraphs.join("\n\n");
}

// ---------- YAML / Markdown helpers ----------

// JSON string syntax is valid YAML double-quoted syntax, so JSON.stringify quotes safely.
const yamlString = (s) => JSON.stringify(String(s ?? ""));

function yamlDate(value) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : yamlString(value);
}

function mdLink(label, url) {
  return `[${label}](${String(url).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20")})`;
}

// ---------- Images ----------

/** "Some Photo.JPG" + hash -> "Some Photo-1a2b3c4d.jpg". The hash makes the same image map to the same file. */
export function imageFilename(url, hash, ext) {
  let base = "image";
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
      base = last.replace(/\.[a-z0-9]{2,5}$/i, "") || base;
    }
  } catch {
    // unparseable or malformed escapes: keep the default name
  }
  return `${sanitizeFilename(base, 50)}-${hash}.${ext}`;
}

/** Embed (or, if the download failed, a remote link) plus caption, page link, original URL and date. */
export function imageBlock({ vaultPath, imageUrl, caption, pageUrl, capturedAt }) {
  const label = (caption || "").replace(/[\[\]]/g, "");
  const embed = vaultPath ? `![[${vaultPath}]]` : `![${label}](${imageUrl.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  const parts = [
    caption || "",
    mdLink("page", pageUrl),
    imageUrl.startsWith("data:") ? "" : mdLink("original image", imageUrl),
    `captured ${localDateTime(capturedAt)}`,
    vaultPath ? "" : "not downloaded",
  ].filter(Boolean);
  return `${embed}\n${parts.join(" · ")}`;
}

// ---------- Note building ----------

const OPTIONAL_KEYS = ["journal", "volume", "issue", "pages", "publisher", "isbn"];

/**
 * The frontmatter properties Gleaner manages, as [key, yamlValue] pairs. Optional keys
 * (journal, volume, ...) are left out when empty. `tags` is not managed: it belongs to the user.
 */
export function frontmatterFields(meta, accessedIso) {
  const accessed = meta.accessed || (accessedIso ? localDate(accessedIso) : "");
  const fields = [
    ["title", yamlString(meta.title)],
    ["authors", `[${(meta.authors ?? []).map((a) => yamlString(authorDisplay(a))).join(", ")}]`],
    ["type", meta.type || "web-page"],
    ["site", yamlString(meta.site)],
    ["published", yamlDate(meta.published)],
  ];
  if (accessed) fields.push(["accessed", yamlDate(accessed)]);
  fields.push(["url", yamlString(meta.url)], ["doi", meta.doi ? yamlString(meta.doi) : ""]);
  for (const key of OPTIONAL_KEYS) {
    if (meta[key]) fields.push([key, yamlString(meta[key])]);
  }
  return fields;
}

export function buildFrontmatter(meta, accessedIso) {
  const lines = frontmatterFields(meta, accessedIso).map(([k, v]) => `${k}: ${v}`.trimEnd());
  return ["---", ...lines, "tags: [source]", "---"].join("\n");
}

/**
 * Applies edited metadata to an existing note's frontmatter. Only the properties Gleaner
 * manages are touched; the user's own properties, tags and the whole note body are kept.
 */
export function updateFrontmatter(content, meta) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!m) return content; // no frontmatter to patch: leave the user's note alone
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = m[1].split(/\r?\n/);
  const wanted = new Map(frontmatterFields(meta));
  const managed = ["title", "authors", "type", "site", "published", "accessed", "url", "doi", ...OPTIONAL_KEYS];

  for (const key of managed) {
    const idx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
    const value = wanted.get(key);
    if (idx === -1) {
      if (value !== undefined) lines.push(`${key}: ${value}`.trimEnd());
      continue;
    }
    let endIdx = idx + 1; // a value may continue on indented lines or "- item" lines
    while (endIdx < lines.length && /^(\s+|-\s)/.test(lines[endIdx])) endIdx++;
    const replacement = value === undefined ? [] : [`${key}: ${value}`.trimEnd()];
    lines.splice(idx, endIdx - idx, ...replacement);
  }
  return `---${eol}${lines.join(eol)}${eol}---${content.slice(m[0].length)}`;
}

export function buildNote(meta, accessedIso) {
  return [
    buildFrontmatter(meta, accessedIso),
    "",
    `# ${meta.title}`,
    "",
    "## Snippets",
    "",
    "## Images",
    "",
    "## Notes",
    "",
  ].join("\n");
}

export function snippetBlock({ text, fragmentLink, capturedAt }) {
  const quote = text
    .split(/\n{2,}/)
    .map((p) => p.split("\n").map((l) => `> ${l}`).join("\n"))
    .join("\n>\n");
  return `${quote}\n\n${mdLink("Jump to passage", fragmentLink)} · captured ${localDateTime(capturedAt)}`;
}

export function noteBlock({ text, capturedAt }) {
  return `${text.trim()} · noted ${localDateTime(capturedAt)}`;
}

/**
 * Adds `block` at the end of the "## heading" section, leaving everything else
 * untouched. If the heading is missing (the user may have restructured the note),
 * the section is added at the end of the file instead.
 */
export function insertUnderHeading(content, heading, block) {
  const lines = content.split("\n");
  const headingRe = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) {
    return content.replace(/\s*$/, "") + `\n\n## ${heading}\n\n${block}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // Insert after the last non-blank line of the section; drop the section's trailing blanks.
  let insertAt = end;
  while (insertAt > start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
  const before = lines.slice(0, insertAt);
  const rest = lines.slice(end); // next heading onward (empty if the section runs to EOF)
  return [...before, "", block, ...(rest.length ? ["", ...rest] : [""])].join("\n");
}
