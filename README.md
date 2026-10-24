# Gleaner

Capture research sources into your Obsidian vault while you browse. Every capture becomes Markdown in your vault with clean metadata attached, and you can export citations in APA, MLA and Chicago.

Works in **Chrome, Edge and Firefox** (Manifest V3). Plain JavaScript, no dependencies, no bundler.

## What it does

| Capture | How | What is saved |
|---|---|---|
| **Text snippet** | Select text → right-click → *Gleaner: capture selected text* (Alt+Shift+S) | The quote with paragraph breaks, a link that jumps to the passage (`#:~:text=`), the capture time, and the page's metadata |
| **Image** | Right-click an image → *Gleaner: capture image* | The highest-resolution version it can find, saved to your attachments folder and embedded with caption, page link, original URL and date |
| **Page** | Right-click the page → *Gleaner: capture this page* (Alt+Shift+G) | Just the page and its metadata; add an optional note afterwards in the side panel |

- **One note per source.** The first capture from a page creates its note; later captures from the same page are added to it. Existing note content is never replaced, only extended.
- **Metadata** is merged from `citation_*` tags, JSON-LD, Dublin Core, OpenGraph and plain fallbacks, in that order, and a source type is guessed (journal article, news article, web page, book, video).
- **Library** (side panel): search your sources, copy a citation in your chosen style, open the note in Obsidian, edit metadata, remove from the library, export a bibliography.
- **Offline-safe.** If Obsidian isn't reachable, captures wait in a queue (Settings → Pending sync) and are never lost.
- A small confirmation toast appears on the page after each capture, and the toolbar badge shows ✓, ! or the number of queued captures.

## Install

You need a build or the source folder. To build packages (Node 22+):

```
npm run build
```

This creates `dist/chrome/`, `dist/firefox/` and a zip of each (`dist/gleaner-chrome.zip` also works for Edge).

### Chrome

1. Open `chrome://extensions` and turn on *Developer mode*.
2. Click *Load unpacked* and choose `dist/chrome` (or the project folder itself).
3. Click the Gleaner icon in the toolbar to open the side panel.

### Edge

1. Open `edge://extensions` and turn on *Developer mode*.
2. Click *Load unpacked* and choose `dist/chrome` (or the project folder).
3. Click the Gleaner icon to open the side panel.

### Firefox (128 or newer)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click *Load Temporary Add-on…* and choose `dist/firefox/manifest.json` (or the project's `manifest.json`).
3. Click the Gleaner icon to open the sidebar.

Temporary add-ons are removed when Firefox closes. For a permanent install, the Firefox package has to be signed by Mozilla (submit `dist/gleaner-firefox.zip` at addons.mozilla.org as an unlisted add-on). The manifest declares that Gleaner collects no data (`data_collection_permissions: none`), which Mozilla now asks for.

Running the project folder directly works in all three browsers too; it just shows harmless warnings about manifest keys the browser doesn't use.

## Set up Obsidian

1. In Obsidian: *Settings → Community plugins → Browse*, install and enable **Local REST API**.
2. Open that plugin's settings and copy the **API key**.
3. Pick one connection method:
   - **HTTP (simplest):** turn on *Enable HTTP server* in the plugin, then use `http://127.0.0.1:27123` as the API URL.
   - **HTTPS:** keep `https://127.0.0.1:27124`, and make your browser trust the plugin's certificate (the Settings tab shows the link and steps).
4. In Gleaner's Settings tab: paste the URL and key, press **Save**, then **Test connection**, then **Grant permissions**.
5. For images, also press **Allow image downloads** (see Permissions).

The notes folder (default `Sources/`) and attachments folder (default `Sources/attachments/`) are configurable.

## Citations

Copy a single citation from the Library, or export a bibliography (`.md` or `.txt`) for selected or all sources, alphabetized for the chosen style: **APA 7th**, **MLA 9th**, and **Chicago 17th** notes-bibliography (bibliography entry, plus the first footnote via *Copy note*). Copied citations keep their italics when pasted into Word or Google Docs.

Titles are used exactly as captured. APA wants sentence case and MLA/Chicago want title case, so fix capitalization in the metadata editor when a style needs it. Chicago footnotes cite the whole page range, since Gleaner can't know which page you're citing.

For journal articles, **Fetch from CrossRef** in the metadata editor fills in clean data from the DOI. It's the only request Gleaner makes besides your local Obsidian: only the DOI is sent, and only when you press the button.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saves your settings, library index and pending queue locally. Your API key is stored only here. |
| `contextMenus` | Adds the right-click capture items. |
| `scripting` + `activeTab` | Reads the page you chose to capture (selection and metadata), only on the tab where you clicked or pressed the shortcut. |
| `sidePanel` | The Chrome/Edge side panel (ignored by Firefox, which uses `sidebar_action`). |
| optional: `127.0.0.1` / `localhost` | Lets the extension talk to Obsidian on your own computer. Requested by the **Grant permissions** button. |
| optional: all sites | Needed only to download images: browsers block reading an image from another site unless the extension has permission for it. Requested by **Allow image downloads**; Gleaner fetches only the image you right-click. |

**Privacy:** everything stays on your computer. Gleaner talks to the page you're on, your local Obsidian, and CrossRef (only when you enrich a DOI). No analytics, no remote servers. The API key never leaves extension storage.

## Keyboard shortcuts

Alt+Shift+S captures the selected text and Alt+Shift+G captures the page. Change them in Chrome at `chrome://extensions/shortcuts`, in Edge at `edge://extensions/shortcuts`, or in Firefox via the gear menu on `about:addons` → *Manage Extension Shortcuts*. The Settings tab lists the current bindings.

## Troubleshooting

- **"Could not reach Obsidian":** Obsidian must be open with the Local REST API plugin enabled. With HTTPS the usual cause is the untrusted certificate; try the HTTP URL.
- **Captures say "queued":** Obsidian wasn't reachable or the key was rejected. Fix the cause, then press **Sync pending** in Settings.
- **An image came out as a link, "not downloaded":** the site blocked the download (hotlink protection) or **Allow image downloads** isn't on. Extensions can't send the Referer header some sites require.
- **A snippet's link doesn't highlight the passage:** text fragments need Chrome/Edge 80+ or Firefox 131+, and some pages change their text after loading.
- **Can't capture on a page:** browser-internal pages (`chrome://`, `about:`), extension stores and built-in PDF viewers can't be scripted.

## Development

```
npm test         # unit tests (Node 20+, no dependencies)
npm run build    # per-browser packages in dist/
npm run icons    # regenerate icons/ from scripts/make-icons.mjs
```

Layout:

- `manifest.json`: one manifest that works everywhere; `scripts/build.mjs` strips the other browser's keys for the packages.
- `src/background.js`: menus, shortcuts, the capture pipeline, the offline queue, toasts.
- `src/lib/`: `metadata.js` (merging, names, DOIs), `textFragment.js`, `note.js` (Markdown/YAML), `capture.js` (writes to the vault), `obsidian.js` (REST client), `citations.js`, `crossref.js`, `images.js`, `imageCandidates.js`, `imageRules.js`, `extractPage.js` (code injected into pages), `settings.js`, `store.js`.
- `src/sidepanel/`: the side panel UI.

**Adding an image site:** open `src/lib/imageRules.js` and add an entry to `RULES` (instructions are at the top of the file). Candidates are downloaded in order and verified to be images, so a wrong guess just falls through to the next one.
