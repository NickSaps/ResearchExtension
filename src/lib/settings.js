import { api } from "./browser.js";

export const DEFAULT_SETTINGS = {
  apiUrl: "https://127.0.0.1:27124",
  apiKey: "",
  notesFolder: "Sources/",
  attachmentsFolder: "Sources/attachments/",
  citationStyle: "apa",
};

// storage.local (not storage.sync) so the API key never leaves this machine.
export async function loadSettings() {
  const { settings } = await api.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function saveSettings(settings) {
  await api.storage.local.set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
}
