import test from "node:test";
import assert from "node:assert/strict";
import { crossrefToMeta } from "../src/lib/crossref.js";
import { formatCitation } from "../src/lib/citations.js";

const existing = {
  title: "Nanometre-scale thermometry … | Nature", authors: [], type: "web-page", site: "nature.com",
  published: "", accessed: "2026-10-21", url: "https://www.nature.com/articles/nature12373", doi: "10.1038/nature12373",
};

const message = {
  title: ["Nanometre-scale thermometry in a living cell"],
  author: [{ given: "G.", family: "Kucsko", sequence: "first" }, { given: "P. C.", family: "Maurer" }, { name: "Some Consortium" }],
  "container-title": ["Nature"], volume: "500", issue: "7460", page: "54-58",
  issued: { "date-parts": [[2013, 7, 31]] }, DOI: "10.1038/nature12373",
  publisher: "Springer Science and Business Media LLC", type: "journal-article",
};

test("crossrefToMeta: fills citation fields and keeps URL and access date", () => {
  const m = crossrefToMeta(message, existing);
  assert.equal(m.title, "Nanometre-scale thermometry in a living cell");
  assert.deepEqual(m.authors, [
    { given: "G.", family: "Kucsko" }, { given: "P. C.", family: "Maurer" }, { given: "", family: "", literal: "Some Consortium" },
  ]);
  assert.equal(m.type, "journal-article");
  assert.equal(m.journal, "Nature");
  assert.equal(m.site, "Nature");
  assert.equal(m.pages, "54–58");
  assert.equal(m.published, "2013-07-31");
  assert.equal(m.url, existing.url);
  assert.equal(m.accessed, "2026-10-21");
});

test("crossrefToMeta: strips markup, handles partial dates, keeps existing data when CrossRef has none", () => {
  const m = crossrefToMeta(
    { title: ["Effects of <i>E. coli</i> &amp; friends"], issued: { "date-parts": [[2020, 5]] }, DOI: "10.1/x", type: "posted-content" },
    { ...existing, authors: [{ given: "Keep", family: "Me" }] },
  );
  assert.equal(m.title, "Effects of E. coli & friends");
  assert.equal(m.published, "2020-05");
  assert.deepEqual(m.authors, [{ given: "Keep", family: "Me" }]);
  assert.equal(m.type, "web-page"); // unmapped CrossRef types leave the type alone
});

test("crossrefToMeta: books pick up ISBN and publisher, and produce a good citation", () => {
  const m = crossrefToMeta(
    { title: ["The Book"], author: [{ given: "Jane", family: "Doe" }], publisher: "Big Press", type: "monograph", ISBN: ["9781234567890"], issued: { "date-parts": [[2019]] }, DOI: "10.9/b" },
    existing,
  );
  assert.equal(m.type, "book");
  assert.equal(m.isbn, "9781234567890");
  assert.equal(formatCitation(m, "apa"), "Doe, J. (2019). *The Book*. Big Press. https://doi.org/10.9/b");
});
