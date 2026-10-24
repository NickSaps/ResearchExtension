import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilename, cleanUrl, urlKey, normalizeFolder, normalizeSelection, buildNote, snippetBlock, insertUnderHeading } from "../src/lib/note.js";
import { buildTextFragmentLink } from "../src/lib/textFragment.js";

test("sanitizeFilename strips Obsidian-forbidden characters and truncates", () => {
  assert.equal(sanitizeFilename('A*B"C\\D/E<F>G:H|I?J#K^L[M]N'), "A B C D E F G H I J K L M N");
  assert.equal(sanitizeFilename("   ...  "), "Untitled");
  const long = sanitizeFilename("word ".repeat(40));
  assert.ok(long.length <= 80 && !long.endsWith(" "));
});

test("cleanUrl / urlKey", () => {
  assert.equal(cleanUrl("https://a.com/p?utm_source=x&id=2#frag"), "https://a.com/p?id=2");
  assert.equal(urlKey("https://A.com/p/?fbclid=1#x"), urlKey("https://a.com/p"));
  assert.equal(normalizeFolder("/Sources\\Web"), "Sources/Web/");
  assert.equal(normalizeFolder(""), "");
});

test("normalizeSelection keeps paragraph breaks", () => {
  assert.equal(normalizeSelection("One  two\nthree\n\nFour"), "One two three\n\nFour");
  assert.equal(normalizeSelection("Para one\nPara two"), "Para one\n\nPara two");
  assert.equal(normalizeSelection("  single line  "), "single line");
});

const meta = { title: 'He said "hi"', authors: [{ given: "Jane", family: "Doe" }], type: "news-article", site: "Ex", published: "2025-03-14", url: "https://e.com/a", doi: "" };

test("buildNote produces frontmatter and empty sections", () => {
  const note = buildNote(meta, "2026-10-21T20:14:00");
  assert.match(note, /^---\ntitle: "He said \\"hi\\""\nauthors: \["Jane Doe"\]\ntype: news-article/);
  assert.match(note, /published: 2025-03-14\naccessed: 2026-10-21\nurl: "https:\/\/e.com\/a"\ndoi:\ntags: \[source\]\n---/);
  assert.match(note, /\n# He said "hi"\n\n## Snippets\n\n## Images\n\n## Notes\n$/);
});

test("insertUnderHeading appends within the section and preserves the rest", () => {
  let note = buildNote(meta, "2026-10-21T20:14:00");
  note = insertUnderHeading(note, "Snippets", "> first");
  note = insertUnderHeading(note, "Snippets", "> second");
  note = insertUnderHeading(note, "Notes", "my note");
  assert.match(note, /## Snippets\n\n> first\n\n> second\n\n## Images\n\n## Notes\n\nmy note\n$/);
});

test("insertUnderHeading keeps user edits and adds a missing section", () => {
  const edited = "---\ntitle: x\n---\n\n# x\n\n## Snippets\n\n> mine\n\nuser text\n\n## My Thoughts\n\nhello\n";
  const out = insertUnderHeading(edited, "Snippets", "> new");
  assert.equal(out, "---\ntitle: x\n---\n\n# x\n\n## Snippets\n\n> mine\n\nuser text\n\n> new\n\n## My Thoughts\n\nhello\n");
  assert.match(insertUnderHeading("# x\n", "Notes", "n"), /\n## Notes\n\nn\n$/);
});

test("snippetBlock quotes paragraphs and links to the passage", () => {
  const b = snippetBlock({ text: "Line one.\n\nLine two.", fragmentLink: "https://e.com/a#:~:text=Line", capturedAt: "2026-10-21T20:14:00" });
  assert.equal(b, "> Line one.\n>\n> Line two.\n\n[Jump to passage](https://e.com/a#:~:text=Line) · captured 2026-10-21 20:14");
});

test("text fragments: short quote, long quote, multi-paragraph, existing hash", () => {
  assert.equal(buildTextFragmentLink("https://e.com/a", "Hello, world-wide"), "https://e.com/a#:~:text=Hello%2C%20world%2Dwide");
  const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
  const link = buildTextFragmentLink("https://e.com/a#old:~:text=zzz", long);
  assert.match(link, /^https:\/\/e\.com\/a#old:~:text=word0%20word1.*,.*word59$/);
  assert.match(buildTextFragmentLink("https://e.com/a", "Para one here.\n\nPara two here."), /text=Para%20one%20here\.,Para%20two%20here\.$/);
  assert.equal(buildTextFragmentLink("https://e.com/a", "  "), "https://e.com/a");
});
