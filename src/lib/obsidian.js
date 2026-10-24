// Client for the Obsidian Local REST API plugin.
// Docs: https://coddingtonbear.github.io/obsidian-local-rest-api/

function baseUrl(settings) {
  return settings.apiUrl.trim().replace(/\/+$/, "");
}

function authHeaders(settings) {
  return { Authorization: `Bearer ${settings.apiKey.trim()}` };
}

/**
 * Check that Obsidian is reachable and the API key is accepted.
 * GET / needs no key but reports `authenticated` when one is sent, so one call
 * tells us both "is it there?" and "is the key right?".
 *
 * Returns { ok: true, version } or { ok: false, kind, message } where kind is
 * "config" | "network" | "auth" | "unexpected".
 */
export async function testConnection(settings) {
  if (!settings.apiUrl.trim()) {
    return { ok: false, kind: "config", message: "Enter the API URL first." };
  }
  if (!settings.apiKey.trim()) {
    return { ok: false, kind: "config", message: "Enter your API key first." };
  }

  const url = baseUrl(settings) + "/";
  let res;
  try {
    res = await fetch(url, { headers: authHeaders(settings) });
  } catch {
    // fetch() gives no detail on failure, so the message covers the usual causes.
    const isHttps = url.startsWith("https:");
    return {
      ok: false,
      kind: "network",
      message:
        "Could not reach Obsidian. Check that Obsidian is open and the Local REST API plugin is enabled." +
        (isHttps
          ? " If it is running, the browser probably doesn't trust its self-signed certificate: see the setup steps below, or switch to the HTTP URL."
          : " For HTTP, make sure \"Enable HTTP server\" is on in the plugin settings."),
    };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: "auth", message: "Obsidian answered, but rejected the API key." };
  }
  if (!res.ok) {
    return { ok: false, kind: "unexpected", message: `Unexpected response: HTTP ${res.status}.` };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, kind: "unexpected", message: "That address answered, but not like Obsidian's REST API." };
  }
  if (body.service !== "Obsidian Local REST API") {
    return { ok: false, kind: "unexpected", message: "That address answered, but not like Obsidian's REST API." };
  }
  if (!body.authenticated) {
    return { ok: false, kind: "auth", message: "Obsidian is running, but the API key was not accepted." };
  }
  return { ok: true, version: body.versions?.self ?? body.manifest?.version ?? "unknown" };
}

/** URL where the plugin serves its certificate authority, for trusting it. */
export function certificateUrl(settings) {
  return baseUrl(settings) + "/obsidian-local-rest-api.crt";
}

// ---------- Vault access ----------

/** kind: "network" (unreachable), "auth" (key rejected), "http" (anything else). */
export class ObsidianError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

async function vaultRequest(settings, method, path, { body, headers } = {}) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  let res;
  try {
    res = await fetch(`${baseUrl(settings)}/vault/${encoded}`, {
      method,
      body,
      headers: { ...authHeaders(settings), ...headers },
    });
  } catch {
    throw new ObsidianError("network", "Could not reach Obsidian (is it open, with the Local REST API plugin enabled?).");
  }
  if (res.status === 401 || res.status === 403) {
    throw new ObsidianError("auth", "Obsidian rejected the API key.", res.status);
  }
  return res;
}

/** Returns the note's Markdown, or null if it doesn't exist. */
export async function readNote(settings, path) {
  const res = await vaultRequest(settings, "GET", path, { headers: { Accept: "text/markdown" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new ObsidianError("http", `Obsidian returned HTTP ${res.status} reading ${path}.`, res.status);
  return res.text();
}

/** Writes a binary file (an image). Some plugin versions reject unusual types, so fall back to octet-stream. */
export async function writeBinary(settings, path, bytes, mime) {
  let res = await vaultRequest(settings, "PUT", path, { body: bytes, headers: { "Content-Type": mime } });
  if (res.status === 400 || res.status === 415) {
    res = await vaultRequest(settings, "PUT", path, { body: bytes, headers: { "Content-Type": "application/octet-stream" } });
  }
  if (!res.ok) throw new ObsidianError("http", `Obsidian returned HTTP ${res.status} writing ${path}.`, res.status);
}

/** Creates or replaces a note. Callers must only pass content derived from the current file. */
export async function writeNote(settings, path, content) {
  const res = await vaultRequest(settings, "PUT", path, {
    body: content,
    headers: { "Content-Type": "text/markdown" },
  });
  if (!res.ok) throw new ObsidianError("http", `Obsidian returned HTTP ${res.status} writing ${path}.`, res.status);
}

/** Opens a note in the Obsidian app. */
export async function openNote(settings, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  let res;
  try {
    res = await fetch(`${baseUrl(settings)}/open/${encoded}`, { method: "POST", headers: authHeaders(settings) });
  } catch {
    throw new ObsidianError("network", "Could not reach Obsidian (is it open, with the Local REST API plugin enabled?).");
  }
  if (res.status === 401 || res.status === 403) throw new ObsidianError("auth", "Obsidian rejected the API key.", res.status);
  if (!res.ok) throw new ObsidianError("http", `Obsidian returned HTTP ${res.status} opening ${path}.`, res.status);
}
