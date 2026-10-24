import test from "node:test";
import assert from "node:assert/strict";
import { updateFrontmatter, buildNote } from "../src/lib/note.js";
import { authorLine, parseAuthorLines } from "../src/lib/metadata.js";

const meta = {
  title: "Original", authors: [{ given: "Jane", family: "Doe" }], type: "web-page", site: "Site",
  published: "2025-03-14", accessed: "2026-10-21", url: "https://e.com/a", doi: "",
};

test("updateFrontmatter: changes managed properties, keeps user properties, tags and body", () => {
  const note =
    '---\ntitle: "Original"\nauthors: ["Jane Doe"]\ntype: web-page\nsite: "Site"\npublished: 2025-03-14\n' +
    'accessed: 2026-10-21\nurl: "https://e.com/a"\ndoi:\ntags: [source, mine]\nrating: 5\n---\n\n# Original\n\n## Snippets\n\n> my quote\n';
  const out = updateFrontmatter(note, {
    ...meta, title: "Edited: A Title", authors: [{ given: "Ann", family: "Lee" }, { given: "", family: "", literal: "WHO" }],
    type: "news-article", doi: "10.1000/x", journal: "J Tests",
  });
  assert.match(out, /^---\ntitle: "Edited: A Title"\nauthors: \["Ann Lee", "WHO"\]\ntype: news-article\n/);
  assert.match(out, /doi: "10\.1000\/x"/);
  assert.match(out, /tags: \[source, mine\]\nrating: 5\njournal: "J Tests"\n---\n\n# Original\n\n## Snippets\n\n> my quote\n$/);
});

test("updateFrontmatter: replaces block-style lists and removes cleared optional properties", () => {
  const note = '---\ntitle: "T"\nauthors:\n  - "A B"\n  - "C D"\ntype: web-page\njournal: "Old"\ntags: [source]\n---\nbody\n';
  const out = updateFrontmatter(note, { ...meta, title: "T", authors: [{ given: "E", family: "F" }], journal: "" });
  assert.equal(out.includes("  - "), false);
  assert.match(out, /authors: \["E F"\]\ntype: web-page/);
  assert.equal(out.includes("journal"), false);
  assert.ok(out.endsWith("---\nbody\n"));
});

test("updateFrontmatter: notes without frontmatter, and CRLF line endings, are handled safely", () => {
  assert.equal(updateFrontmatter("# just text\n", meta), "# just text\n");
  const crlf = '---\r\ntitle: "Old"\r\ntags: [source]\r\n---\r\nbody\r\n';
  const out = updateFrontmatter(crlf, { ...meta, title: "New" });
  assert.match(out, /^---\r\ntitle: "New"\r\n/);
  assert.ok(out.endsWith("---\r\nbody\r\n"));
});

test("updateFrontmatter on a freshly built note round-trips", () => {
  const note = buildNote(meta, "2026-10-21T20:14:00");
  assert.equal(updateFrontmatter(note, meta), note);
});

test("author lines round-trip, including organizations and suffixes", () => {
  const authors = [
    { given: "Jane", family: "Doe" },
    { given: "Martin Luther", family: "King", suffix: "Jr." },
    { given: "", family: "", literal: "Acme Widgets" },
    { given: "", family: "Madonna" },
  ];
  const text = authors.map(authorLine).join("\n");
  assert.equal(text, "Doe, Jane\nKing, Martin Luther, Jr.\n{Acme Widgets}\nMadonna");
  assert.deepEqual(parseAuthorLines(text), authors);
  assert.deepEqual(parseAuthorLines("Jane Doe\n\n  \n"), [{ given: "Jane", family: "Doe" }]);
});
