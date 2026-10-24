import { api } from "./lib/browser.js";
import { loadSettings } from "./lib/settings.js";
import { extractPageData, getSelectionText, extractImageInfo, showToast } from "./lib/extractPage.js";
import { gatherCandidates } from "./lib/imageCandidates.js";
import { expandCandidates } from "./lib/imageRules.js";
import { mergeMetadata, authorDisplay } from "./lib/metadata.js";
import { buildTextFragmentLink } from "./lib/textFragment.js";
import { cleanUrl, localDate, normalizeSelection } from "./lib/note.js";
import { saveCapture } from "./lib/capture.js";
import { getQueue, setQueue, setLastCapture, getSources, putSource, deleteSource } from "./lib/store.js";

// ---------- Toolbar icon opens the side UI ----------
// Chrome/Edge: the side panel can open itself on icon click.
// Firefox: no such switch, so we open the sidebar from the click (needs a user gesture).
if (api.sidePanel?.setPanelBehavior) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else if (api.sidebarAction?.open) {
  api.action.onClicked.addListener(() => api.sidebarAction.open());
}

// ---------- Right-click menu ----------
const MENU_SNIPPET = "gleaner-snippet";
const MENU_PAGE = "gleaner-page";
const MENU_IMAGE = "gleaner-image";

api.runtime.onInstalled.addListener(async () => {
  await api.contextMenus.removeAll();
  api.contextMenus.create({ id: MENU_SNIPPET, title: "Gleaner: capture selected text", contexts: ["selection"] });
  api.contextMenus.create({ id: MENU_IMAGE, title: "Gleaner: capture image", contexts: ["image"] });
  api.contextMenus.create({ id: MENU_PAGE, title: "Gleaner: capture this page", contexts: ["page"] });
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_IMAGE) return captureImageFromTab(tab, info);
  const kind = info.menuItemId === MENU_SNIPPET ? "snippet" : "page";
  captureFromTab(kind, tab, { frameId: info.frameId, fallbackText: info.selectionText });
});

// ---------- Keyboard shortcuts (declared in manifest "commands") ----------
api.commands.onCommand.addListener(async (command, tab) => {
  tab ??= (await api.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab) return;
  if (command === "capture-snippet") captureFromTab("snippet", tab, {});
  if (command === "capture-page") captureFromTab("page", tab, {});
});

// ---------- Messages from the side panel ----------
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  let work;
  if (msg?.type === "sync-queue") {
    work = serialize(async () => drainQueue(await loadSettings()));
  } else if (msg?.type === "add-note") {
    const cap = {
      id: crypto.randomUUID(),
      kind: "page",
      url: msg.url,
      meta: msg.meta,
      capturedAt: new Date().toISOString(),
      note: msg.text,
    };
    work = serialize(() => submit(cap));
  } else if (msg?.type === "update-meta") {
    work = serialize(() => updateMeta(msg.key, msg.meta));
  } else if (msg?.type === "delete-source") {
    work = serialize(async () => {
      await deleteSource(msg.key);
      return { ok: true };
    });
  } else {
    return false;
  }
  work.then(sendResponse, (err) => sendResponse({ error: String(err?.message ?? err) }));
  return true; // keep the channel open for the async response
});

api.runtime.onStartup.addListener(() => serialize(async () => drainQueue(await loadSettings())).catch(() => {}));

// ---------- Capture pipeline ----------

// All vault writes run one at a time, so two quick captures of the same page
// can't read the same note, each add a block, and overwrite each other.
let chain = Promise.resolve();
function serialize(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

async function captureFromTab(kind, tab, { frameId = 0, fallbackText = "" }) {
  try {
    // activeTab (granted by the click/shortcut) lets us inject into this tab only.
    const [{ result: raw }] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageData });

    let text = "";
    if (kind === "snippet") {
      try {
        // The selection may live in an iframe; metadata always comes from the top frame.
        const [{ result }] = await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId] }, func: getSelectionText });
        text = result;
      } catch {
        // fall through to the text the context menu gave us
      }
      text = normalizeSelection(text || fallbackText);
      if (!text) throw new Error("No text selected.");
    }

    const capturedAt = new Date().toISOString();
    const url = cleanUrl(raw.url);
    const cap = {
      id: crypto.randomUUID(),
      kind,
      url,
      meta: mergeMetadata(raw, { url, accessed: localDate(capturedAt) }),
      capturedAt,
      text,
      fragmentLink: kind === "snippet" ? buildTextFragmentLink(raw.url, text) : "",
    };
    await serialize(() => submit(cap, tab.id));
  } catch (err) {
    // Typically a page extensions can't script (about:, the web store, PDF viewers).
    await setLastCapture({ status: "error", error: friendlyScriptError(err), capturedAt: new Date().toISOString() });
    flashBadge("!", "#c62828");
    toast(tab.id, friendlyScriptError(err), "err");
  }
}

async function captureImageFromTab(tab, info) {
  try {
    const [{ result: raw }] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageData });

    let imageInfo;
    try {
      // The image may live in an iframe; ask the frame that was right-clicked.
      [{ result: imageInfo }] = await api.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        func: extractImageInfo,
        args: [info.srcUrl],
      });
    } catch {
      imageInfo = { srcUrl: info.srcUrl, baseURI: raw.url, srcsets: [], links: [], lazy: [], caption: "" };
    }

    const capturedAt = new Date().toISOString();
    const url = cleanUrl(raw.url);
    const cap = {
      id: crypto.randomUUID(),
      kind: "image",
      url,
      meta: mergeMetadata(raw, { url, accessed: localDate(capturedAt) }),
      capturedAt,
      image: {
        srcUrl: info.srcUrl,
        candidates: expandCandidates(gatherCandidates(imageInfo)),
        caption: imageInfo.caption,
      },
    };
    await serialize(() => submit(cap, tab.id));
  } catch (err) {
    await setLastCapture({ status: "error", error: friendlyScriptError(err), capturedAt: new Date().toISOString() });
    flashBadge("!", "#c62828");
    toast(tab.id, friendlyScriptError(err), "err");
  }
}

function friendlyScriptError(err) {
  const msg = String(err?.message ?? err);
  if (msg === "No text selected.") return msg;
  return `Couldn't read this page (${msg}). Browser-internal pages and PDFs can't be captured.`;
}

/** Try to save; if Obsidian can't take it, queue it. Never drops a capture. */
async function submit(cap, tabId = null) {
  const settings = await loadSettings();
  let toastText;
  let toastKind;
  try {
    if (!settings.apiKey.trim()) throw new Error("API key not set. Open Gleaner settings.");
    const { notePath, created, warning, imageUrl } = await saveCapture(settings, cap);
    await setLastCapture(summary(cap, { status: "saved", notePath, created, warning, imageUrl }));
    if (warning) flashBadge("!", "#e08a00");
    else flashBadge("✓", "#1a7f37");
    [toastText, toastKind] = warning ? [warning, "warn"] : ["Saved to Obsidian ✓", "ok"];
    await drainQueue(settings); // Obsidian is evidently reachable: flush anything waiting
  } catch (err) {
    const queue = await getQueue();
    queue.push({ id: cap.id, capture: cap, error: String(err?.message ?? err), queuedAt: new Date().toISOString() });
    await setQueue(queue);
    await setLastCapture(summary(cap, { status: "queued", error: String(err?.message ?? err) }));
    flashBadge(String(queue.length), "#e08a00");
    [toastText, toastKind] = [`Not saved yet: ${String(err?.message ?? err)} The capture is queued.`, "warn"];
  }
  await toast(tabId, toastText, toastKind);
}

/** Shows the on-page confirmation. Never throws: some pages can't be scripted, and the badge still tells the story. */
async function toast(tabId, text, kind) {
  if (tabId == null || !text) return;
  try {
    await api.scripting.executeScript({ target: { tabId }, func: showToast, args: [text, kind] });
  } catch {
    // restricted page or the tab has since navigated away
  }
}

/**
 * Metadata edits take effect in the library immediately. The note's frontmatter is patched
 * right away if Obsidian is reachable, and otherwise queued like any other capture.
 */
async function updateMeta(key, meta) {
  const entry = (await getSources())[key];
  if (!entry) return { error: "That source is no longer in the library." };
  await putSource(key, { ...entry, title: meta.title, meta });
  const cap = { id: crypto.randomUUID(), kind: "meta", url: entry.url, meta, capturedAt: new Date().toISOString() };
  const settings = await loadSettings();
  try {
    if (!settings.apiKey.trim()) throw new Error("API key not set. Open Gleaner settings.");
    const { warning } = await saveCapture(settings, cap);
    return { status: "saved", warning };
  } catch (err) {
    const queue = await getQueue();
    queue.push({ id: cap.id, capture: cap, error: String(err?.message ?? err), queuedAt: cap.capturedAt });
    await setQueue(queue);
    flashBadge(String(queue.length), "#e08a00");
    return { status: "queued", error: String(err?.message ?? err) };
  }
}

/** Replays queued captures in order. Stops at the first connection/auth failure. */
async function drainQueue(settings) {
  const queue = await getQueue();
  const remaining = [];
  let stopped = false;
  for (const item of queue) {
    if (stopped) {
      remaining.push(item);
      continue;
    }
    try {
      await saveCapture(settings, item.capture);
    } catch (err) {
      remaining.push({ ...item, error: String(err?.message ?? err) });
      if (err?.kind === "network" || err?.kind === "auth" || !settings.apiKey.trim()) stopped = true;
    }
  }
  await setQueue(remaining);
  await refreshBadge();
  return { synced: queue.length - remaining.length, remaining: remaining.length };
}

function summary(cap, extra) {
  const m = cap.meta;
  return {
    id: cap.id,
    kind: cap.kind,
    title: m.title,
    authors: m.authors.map(authorDisplay),
    type: m.type,
    site: m.site,
    published: m.published,
    url: cap.url,
    meta: m,
    capturedAt: cap.capturedAt,
    ...extra,
  };
}

// ---------- Toolbar badge ----------
let badgeTimer;
function flashBadge(text, color) {
  api.action.setBadgeBackgroundColor({ color });
  api.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(refreshBadge, 3000);
}

async function refreshBadge() {
  const n = (await getQueue()).length;
  api.action.setBadgeBackgroundColor({ color: "#e08a00" });
  api.action.setBadgeText({ text: n ? String(n) : "" });
}
refreshBadge();
