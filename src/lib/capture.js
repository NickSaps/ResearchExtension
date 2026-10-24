// Saves one capture into the vault: creates the source's note on first capture,
// and adds to the existing note afterwards. Existing note content is never replaced,
// only extended: we read the current file, insert one block, and write it back.
import { readNote, writeNote, writeBinary } from "./obsidian.js";
import { downloadFirstImage } from "./images.js";
import { getSources, putSource } from "./store.js";
import { buildNote, imageBlock, imageFilename, insertUnderHeading, noteBlock, updateFrontmatter, normalizeFolder, sanitizeFilename, snippetBlock, urlKey } from "./note.js";

const MAX_NAME_ATTEMPTS = 25;

/**
 * Picks a note path for a new source. A file with the same name is reused only if
 * its frontmatter points at the same URL (e.g. the local index was cleared);
 * otherwise we try "Title (2).md", "Title (3).md", ...
 */
async function chooseNotePath(settings, meta, url) {
  const folder = normalizeFolder(settings.notesFolder);
  const base = sanitizeFilename(meta.title);
  for (let n = 1; n <= MAX_NAME_ATTEMPTS; n++) {
    const path = `${folder}${n === 1 ? base : `${base} (${n})`}.md`;
    const existing = await readNote(settings, path);
    if (existing === null) return { path, existing: null };
    if (existing.includes(url)) return { path, existing };
  }
  throw new Error(`Could not find a free filename for "${base}".`);
}

/**
 * Downloads the best available version of the image and stores it in the attachments
 * folder. If no candidate can be downloaded, the capture still goes into the note as a
 * remote link, so nothing is lost.
 */
async function storeImage(settings, cap) {
  const dl = await downloadFirstImage(cap.image.candidates);
  if (!dl.ok) {
    const first = dl.attempts[0];
    return {
      vaultPath: null,
      imageUrl: cap.image.srcUrl,
      warning:
        `Couldn't download the image (${first ? first.error : "no candidates"}), so it was linked instead. ` +
        'If this happens on many sites, press "Allow image downloads" in Gleaner\'s Settings.',
    };
  }
  const vaultPath = normalizeFolder(settings.attachmentsFolder) + imageFilename(dl.url, dl.hash, dl.ext);
  await writeBinary(settings, vaultPath, dl.bytes, dl.mime);
  return { vaultPath, imageUrl: dl.url, source: dl.source };
}

/** Returns the updated note text, or null if there is nothing to add. */
function applyCapture(content, cap, img) {
  if (cap.kind === "snippet") return insertUnderHeading(content, "Snippets", snippetBlock(cap));
  if (cap.kind === "page" && cap.note) return insertUnderHeading(content, "Notes", noteBlock({ text: cap.note, capturedAt: cap.capturedAt }));
  if (cap.kind === "image") {
    if (img.vaultPath && content.includes(`![[${img.vaultPath}]]`)) return null; // same image already embedded
    const block = imageBlock({ ...img, caption: cap.image.caption, pageUrl: cap.url, capturedAt: cap.capturedAt });
    return insertUnderHeading(content, "Images", block);
  }
  return content;
}

/**
 * @param cap { kind: "snippet"|"page"|"image", url, meta, capturedAt,
 *              text?, fragmentLink?, note?, image?: { srcUrl, candidates, caption } }
 * @returns { notePath, created, warning?, imageUrl? }
 */
export async function saveCapture(settings, cap) {
  if (cap.kind === "meta") return saveMetaEdit(settings, cap);
  const key = urlKey(cap.url);
  const sources = await getSources();
  const entry = sources[key];

  let notePath = entry?.notePath;
  let existing = notePath ? await readNote(settings, notePath) : null;
  if (existing === null) {
    ({ path: notePath, existing } = await chooseNotePath(settings, cap.meta, cap.url));
  }

  const img = cap.kind === "image" ? await storeImage(settings, cap) : null;
  const created = existing === null;
  const base = created ? buildNote(cap.meta, cap.capturedAt) : existing;
  const updated = applyCapture(base, cap, img);
  const added = updated !== null;
  if (created || (added && updated !== existing)) await writeNote(settings, notePath, updated ?? base);

  // Reset counts if we had to recreate a note the user deleted.
  const prior = created ? undefined : entry;
  await putSource(key, {
    key,
    notePath,
    url: cap.url,
    title: prior?.title ?? cap.meta.title,
    meta: prior?.meta ?? cap.meta,
    snippetCount: (prior?.snippetCount ?? 0) + (cap.kind === "snippet" ? 1 : 0),
    imageCount: (prior?.imageCount ?? 0) + (cap.kind === "image" && added ? 1 : 0),
    firstCaptured: prior?.firstCaptured ?? cap.capturedAt,
    lastCaptured: cap.capturedAt,
  });
  const warning = img?.warning ?? (cap.kind === "image" && !added ? "That image was already in the note." : undefined);
  return { notePath, created, warning, imageUrl: img?.imageUrl };
}

/**
 * Applies edited metadata: patches the note's frontmatter (never its body) and the local index.
 * @param cap { kind: "meta", url, meta }
 */
async function saveMetaEdit(settings, cap) {
  const key = urlKey(cap.url);
  const entry = (await getSources())[key];
  if (!entry) return { notePath: null, created: false, warning: "That source is no longer in the library." };

  const existing = await readNote(settings, entry.notePath);
  let warning;
  if (existing === null) {
    warning = "The note no longer exists in Obsidian, so only the library entry was updated.";
  } else {
    const updated = updateFrontmatter(existing, cap.meta);
    if (updated !== existing) await writeNote(settings, entry.notePath, updated);
  }
  await putSource(key, { ...entry, title: cap.meta.title, meta: cap.meta });
  return { notePath: entry.notePath, created: false, warning };
}
