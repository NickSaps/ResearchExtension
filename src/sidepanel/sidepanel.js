import { api } from "../lib/browser.js";
import { loadSettings, saveSettings } from "../lib/settings.js";
import { authorDisplay, authorLine, parseAuthorLines, normalizeDate, findDoi } from "../lib/metadata.js";
import { urlKey } from "../lib/note.js";
import { crossrefToMeta, fetchCrossref } from "../lib/crossref.js";
import { testConnection, certificateUrl, openNote } from "../lib/obsidian.js";
import { formatCitation, formatChicagoNote, formatBibliography, citationToPlain, citationToHtml, STYLES } from "../lib/citations.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["apiUrl", "apiKey", "notesFolder", "attachmentsFolder", "citationStyle"];
const IMAGE_ORIGINS = ["<all_urls>"];
const ORIGINS = ["https://127.0.0.1/*", "http://127.0.0.1/*", "https://localhost/*", "http://localhost/*"];

// --- Tabs ---
for (const tab of document.querySelectorAll(".tabs [role=tab]")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll(".tabs [role=tab]")) {
      const active = t === tab;
      t.setAttribute("aria-selected", String(active));
      $(`tab-${t.dataset.tab}`).hidden = !active;
    }
  });
}

// --- Settings form ---
function readForm() {
  return Object.fromEntries(FIELDS.map((f) => [f, $(f).value]));
}

function showStatus(ok, message) {
  const el = $("status");
  el.hidden = false;
  el.className = `status ${ok ? "ok" : "err"}`;
  el.textContent = message;
}

function updateCertLink() {
  $("cert-link").href = certificateUrl(readForm());
}

async function init() {
  const settings = await loadSettings();
  for (const f of FIELDS) $(f).value = settings[f];
  $("lib-style").value = settings.citationStyle;
  updateCertLink();
  await refreshPermissionState();
}

$("apiUrl").addEventListener("input", updateCertLink);

$("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSettings(readForm());
  showStatus(true, "Settings saved.");
});

$("test").addEventListener("click", async () => {
  const btn = $("test");
  btn.disabled = true;
  showStatus(true, "Testing…");
  try {
    const result = await testConnection(readForm());
    showStatus(result.ok, result.ok ? `Connected to Obsidian (Local REST API ${result.version}) ✓` : result.message);
  } finally {
    btn.disabled = false;
  }
});

// --- Permissions ---
async function refreshPermissionState() {
  const granted = await api.permissions.contains({ origins: ORIGINS });
  $("perm-state").textContent = granted ? "Granted ✓" : "Not granted yet";
  $("grant").disabled = granted;
  const imagesGranted = await api.permissions.contains({ origins: IMAGE_ORIGINS });
  $("img-perm-state").textContent = imagesGranted ? "Allowed ✓" : "Not allowed yet";
  $("grant-images").disabled = imagesGranted;
}

$("grant").addEventListener("click", async () => {
  // permissions.request must run directly inside the click handler (user gesture).
  await api.permissions.request({ origins: ORIGINS });
  await refreshPermissionState();
});

$("grant-images").addEventListener("click", async () => {
  await api.permissions.request({ origins: IMAGE_ORIGINS });
  await refreshPermissionState();
});

// --- Last capture ---
let lastCapture = null;

function renderLast() {
  const c = lastCapture;
  $("last").hidden = !c;
  if (!c) return;
  const status = $("last-status");
  const labels = {
    saved: [`Saved to Obsidian ✓ (${c.created ? "new note" : "added to note"}: ${c.notePath})${c.warning ? " " + c.warning : ""}`, c.warning ? "warn" : "ok"],
    queued: [`Not saved yet: queued for sync. ${c.error ?? ""}`, "warn"],
    error: [c.error, "err"],
  };
  const [text, cls] = labels[c.status] ?? ["", ""];
  status.textContent = text;
  status.className = `status ${cls}`;

  const meta = $("last-meta");
  meta.replaceChildren();
  if (c.status !== "error") {
    const rows = [
      ["Title", c.title], ["Authors", c.authors?.join(", ")], ["Type", c.type],
      ["Site", c.site], ["Published", c.published], ["DOI", c.meta?.doi],
      ["Image from", c.imageUrl],
    ];
    for (const [k, v] of rows) {
      if (!v) continue;
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      meta.append(dt, dd);
    }
  }
  $("note-form").hidden = c.status === "error";

  const editBtn = $("last-edit");
  const entry = c.url ? sources[urlKey(c.url)] : null;
  editBtn.hidden = !entry;
  if (entry) editBtn.textContent = entry.meta.doi ? "Enrich from CrossRef" : "Edit metadata";
}

$("last-edit").addEventListener("click", () => {
  const entry = sources[urlKey(lastCapture.url)];
  if (!entry) return;
  startEdit(entry);
  if (entry.meta.doi) $("e-crossref").click();
});

$("note-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("note-text").value.trim();
  if (!text || !lastCapture?.meta) return;
  $("note-status").textContent = "Saving…";
  const res = await api.runtime.sendMessage({ type: "add-note", url: lastCapture.url, meta: lastCapture.meta, text });
  $("note-status").textContent = res?.error ? res.error : "Added ✓";
  if (!res?.error) $("note-text").value = "";
});

// --- Pending queue ---
function renderQueue(queue = []) {
  $("queue-empty").hidden = queue.length > 0;
  const list = $("queue-list");
  list.replaceChildren();
  for (const item of queue) {
    const li = document.createElement("li");
    const c = item.capture;
    li.textContent = `${{ snippet: "Snippet", image: "Image", meta: "Metadata edit" }[c.kind] ?? "Page"}: ${c.meta.title}`;
    if (item.error) {
      const err = document.createElement("div");
      err.className = "err";
      err.textContent = item.error;
      li.append(err);
    }
    list.append(li);
  }
}

$("sync").addEventListener("click", async () => {
  $("sync").disabled = true;
  $("sync-status").textContent = "Syncing…";
  const res = await api.runtime.sendMessage({ type: "sync-queue" });
  $("sync-status").textContent = res?.error ?? `Synced ${res.synced}, ${res.remaining} still pending.`;
  $("sync").disabled = false;
});

async function loadState() {
  const { lastCapture: last, queue } = await api.storage.local.get(["lastCapture", "queue"]);
  lastCapture = last ?? null;
  renderLast();
  renderQueue(queue);
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.lastCapture || changes.queue)) loadState();
});

// --- Library ---
const MAX_RENDERED = 200;
let sources = {};
const selected = new Set();
let editingKey = null;

function setLibStatus(text) {
  $("lib-status").textContent = text;
}

function yearOf(meta) {
  return meta.published ? meta.published.slice(0, 4) : "n.d.";
}

function matchesSearch(entry, query) {
  if (!query) return true;
  const m = entry.meta;
  const haystack = [m.title, (m.authors ?? []).map(authorDisplay).join(" "), m.site, m.doi, entry.url, m.published].join(" ").toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderLibrary() {
  const list = $("source-list");
  list.replaceChildren();
  const all = Object.values(sources).sort((a, b) => b.lastCaptured.localeCompare(a.lastCaptured));
  $("lib-empty").hidden = all.length > 0;
  const shown = all.filter((e) => matchesSearch(e, $("search").value.trim()));
  for (const entry of shown.slice(0, MAX_RENDERED)) list.append(renderSource(entry));
  if (shown.length > MAX_RENDERED) setLibStatus(`Showing the ${MAX_RENDERED} most recent of ${shown.length}. Refine the search to see others.`);
  else if (all.length && !shown.length) setLibStatus("No sources match.");
  $("select-all").checked = shown.length > 0 && shown.every((e) => selected.has(e.key));
}

function renderSource(entry) {
  const m = entry.meta;
  const li = document.createElement("li");
  li.className = "source";

  const check = document.createElement("input");
  check.type = "checkbox";
  check.checked = selected.has(entry.key);
  check.setAttribute("aria-label", `Select ${m.title}`);
  check.addEventListener("change", () => {
    if (check.checked) selected.add(entry.key);
    else selected.delete(entry.key);
  });

  const title = document.createElement("div");
  title.className = "src-title";
  title.textContent = m.title;
  const sub = document.createElement("div");
  sub.className = "src-sub";
  const authors = (m.authors ?? []).map(authorDisplay);
  const who = authors.length > 2 ? `${authors[0]} et al.` : authors.join(" & ");
  sub.textContent = [who, m.site, yearOf(m)].filter(Boolean).join(" · ");
  const counts = document.createElement("div");
  counts.className = "src-sub";
  counts.textContent = `${entry.snippetCount} snippet${entry.snippetCount === 1 ? "" : "s"} · ${entry.imageCount} image${entry.imageCount === 1 ? "" : "s"}`;
  const info = document.createElement("div");
  info.className = "src-info";
  info.append(title, sub, counts);

  const actions = document.createElement("div");
  actions.className = "row src-actions";
  actions.append(
    button("Copy citation", () => copyCitation(entry)),
    ...(currentStyle() === "chicago" ? [button("Copy note", () => copyCitation(entry, { note: true }))] : []),
    button("Open", () => openInObsidian(entry)),
    button("Edit", () => startEdit(entry)),
    deleteButton(entry),
  );

  const head = document.createElement("div");
  head.className = "src-head";
  head.append(check, info);
  li.append(head, actions);
  return li;
}

// Delete asks twice, since there is no undo.
function deleteButton(entry) {
  const b = button("Delete", async () => {
    if (b.dataset.armed) {
      await api.runtime.sendMessage({ type: "delete-source", key: entry.key });
      selected.delete(entry.key);
      setLibStatus("Removed from the library. The note in Obsidian was not touched.");
      return;
    }
    b.dataset.armed = "1";
    b.textContent = "Confirm delete?";
    setTimeout(() => {
      delete b.dataset.armed;
      b.textContent = "Delete";
    }, 3000);
  });
  return b;
}

const currentStyle = () => $("lib-style").value;

async function copyCitation(entry, { note = false } = {}) {
  const text = note ? formatChicagoNote(entry.meta) : formatCitation(entry.meta, currentStyle());
  const plain = citationToPlain(text);
  try {
    // Rich text keeps the italics when pasted into Word or Google Docs.
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([plain], { type: "text/plain" }),
        "text/html": new Blob([citationToHtml(text)], { type: "text/html" }),
      }),
    ]);
  } catch {
    try {
      await navigator.clipboard.writeText(plain);
    } catch {
      setLibStatus("Couldn't access the clipboard. Click inside the panel and try again.");
      return;
    }
  }
  setLibStatus(note ? "Copied Chicago footnote ✓" : `Copied ${STYLES[currentStyle()]} citation ✓`);
}

async function openInObsidian(entry) {
  try {
    await openNote(await loadSettings(), entry.notePath);
    setLibStatus("");
  } catch (err) {
    setLibStatus(err.message);
  }
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function exportBibliography(entries) {
  if (!entries.length) {
    setLibStatus("Nothing to export. Tick some sources first.");
    return;
  }
  const style = currentStyle();
  const format = $("export-format").value;
  download(`bibliography-${style}.${format}`, formatBibliography(entries.map((e) => e.meta), style, format));
  setLibStatus(`Exported ${entries.length} source${entries.length === 1 ? "" : "s"} in ${STYLES[style]} ✓`);
}

$("export-selected").addEventListener("click", () => exportBibliography(Object.values(sources).filter((e) => selected.has(e.key))));
$("export-all").addEventListener("click", () => exportBibliography(Object.values(sources)));
$("search").addEventListener("input", () => {
  setLibStatus("");
  renderLibrary();
});
$("select-all").addEventListener("change", () => {
  const query = $("search").value.trim();
  for (const e of Object.values(sources)) {
    if (!matchesSearch(e, query)) continue;
    if ($("select-all").checked) selected.add(e.key);
    else selected.delete(e.key);
  }
  renderLibrary();
});

$("lib-style").addEventListener("change", async () => {
  const settings = await loadSettings();
  await saveSettings({ ...settings, citationStyle: currentStyle() });
  $("citationStyle").value = currentStyle();
  renderLibrary();
});

// --- Metadata editing ---
const EDIT_TEXT_FIELDS = ["title", "site", "url", "doi", "journal", "volume", "issue", "pages", "publisher", "isbn"];

function fillEditForm(m) {
  for (const f of EDIT_TEXT_FIELDS) $(`e-${f}`).value = m[f] ?? "";
  $("e-authors").value = (m.authors ?? []).map(authorLine).join("\n");
  $("e-type").value = m.type;
  $("e-published").value = m.published ?? "";
  $("e-accessed").value = m.accessed ?? "";
}

/** The metadata as currently typed into the form, on top of the entry's other fields. */
function readEditForm(base) {
  const meta = { ...base, authors: parseAuthorLines($("e-authors").value), type: $("e-type").value };
  for (const f of EDIT_TEXT_FIELDS) meta[f] = $(`e-${f}`).value.trim();
  meta.title = meta.title || base.title;
  meta.published = normalizeDate($("e-published").value);
  meta.accessed = normalizeDate($("e-accessed").value);
  return meta;
}

function startEdit(entry) {
  editingKey = entry.key;
  fillEditForm(entry.meta);
  $("edit-status").textContent = "";
  $("e-crossref-status").textContent = "";
  $("library-view").hidden = true;
  $("edit-view").hidden = false;
  $("e-title").focus();
}

function closeEdit() {
  editingKey = null;
  $("edit-view").hidden = true;
  $("library-view").hidden = false;
}

$("edit-cancel").addEventListener("click", closeEdit);

$("e-crossref").addEventListener("click", async () => {
  const status = $("e-crossref-status");
  const doi = findDoi($("e-doi").value);
  if (!doi) {
    status.textContent = "Enter a DOI first.";
    return;
  }
  status.textContent = "Asking CrossRef…";
  $("e-crossref").disabled = true;
  try {
    const current = readEditForm(sources[editingKey].meta);
    fillEditForm(crossrefToMeta(await fetchCrossref(doi), { ...current, doi }));
    status.textContent = "Filled in from CrossRef. Review, then Save.";
  } catch (err) {
    status.textContent = err.message;
  } finally {
    $("e-crossref").disabled = false;
  }
});

$("edit-view").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entry = sources[editingKey];
  if (!entry) return closeEdit();
  const meta = readEditForm(entry.meta);

  $("edit-status").textContent = "Saving…";
  const res = await api.runtime.sendMessage({ type: "update-meta", key: editingKey, meta });
  closeEdit();
  if (res?.error) setLibStatus(res.error);
  else if (res.status === "queued") setLibStatus("Saved in the library. The note will update when Obsidian is reachable (see Pending sync).");
  else setLibStatus(res.warning ?? "Saved ✓");
});

async function loadSources() {
  sources = (await api.storage.local.get("sources")).sources ?? {};
  for (const key of selected) if (!sources[key]) selected.delete(key);
  renderLibrary();
  renderLast(); // the edit button on the last capture depends on the source being in the library
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sources) loadSources();
});

async function renderShortcuts() {
  const list = $("shortcut-list");
  list.replaceChildren();
  try {
    for (const cmd of await api.commands.getAll()) {
      if (!cmd.description) continue; // skips built-in entries such as _execute_action
      const li = document.createElement("li");
      li.textContent = `${cmd.description}: ${cmd.shortcut || "not set"}`;
      list.append(li);
    }
  } catch {
    list.textContent = "Shortcuts are unavailable in this browser.";
  }
}

init();
loadState();
loadSources();
renderShortcuts();
