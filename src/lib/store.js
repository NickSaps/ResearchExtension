import { api } from "./browser.js";

// Local state, all in storage.local:
//   sources:     { [urlKey]: { notePath, title, url, meta, snippetCount, imageCount, firstCaptured, lastCaptured } }
//   queue:       [ { id, capture, error, queuedAt } ]   captures waiting for Obsidian
//   lastCapture: summary of the most recent capture, shown in the side panel

export async function getSources() {
  return (await api.storage.local.get("sources")).sources ?? {};
}

export async function putSource(key, entry) {
  const sources = await getSources();
  sources[key] = entry;
  await api.storage.local.set({ sources });
}

export async function deleteSource(key) {
  const sources = await getSources();
  delete sources[key];
  await api.storage.local.set({ sources });
}

export async function getQueue() {
  return (await api.storage.local.get("queue")).queue ?? [];
}

export async function setQueue(queue) {
  await api.storage.local.set({ queue });
}

export async function setLastCapture(summary) {
  await api.storage.local.set({ lastCapture: summary });
}
