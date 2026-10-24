import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthor, parseAuthors, normalizeDate, findDoi, mergeMetadata, authorDisplay } from "../src/lib/metadata.js";

test("parseAuthor: 'First Last' and 'Last, First'", () => {
  assert.deepEqual(parseAuthor("Jane Doe"), { given: "Jane", family: "Doe" });
  assert.deepEqual(parseAuthor("Doe, Jane"), { given: "Jane", family: "Doe" });
  assert.deepEqual(parseAuthor("Doe, Jane Marie"), { given: "Jane Marie", family: "Doe" });
  assert.deepEqual(parseAuthor("By Jane Q. Doe"), { given: "Jane Q.", family: "Doe" });
});

test("parseAuthor: particles, suffixes, organizations", () => {
  assert.deepEqual(parseAuthor("Ludwig van Beethoven"), { given: "Ludwig", family: "van Beethoven" });
  assert.deepEqual(parseAuthor("Martin Luther King Jr."), { given: "Martin Luther", family: "King", suffix: "Jr." });
  assert.equal(parseAuthor("World Health Organization").literal, "World Health Organization");
  assert.equal(parseAuthor("Reuters Staff").literal, "Reuters Staff");
  assert.equal(parseAuthor("https://example.com/author/jane"), null);
});

test("parseAuthors: lists in one string", () => {
  const names = (x) => parseAuthors(x).map(authorDisplay);
  assert.deepEqual(names("Jane Doe and John Smith"), ["Jane Doe", "John Smith"]);
  assert.deepEqual(names("Jane Doe, John Smith, and Ann Lee"), ["Jane Doe", "John Smith", "Ann Lee"]);
  assert.deepEqual(names("Doe, Jane; Smith, John"), ["Jane Doe", "John Smith"]);
  assert.deepEqual(names(["Doe, Jane", "Doe, Jane"]), ["Jane Doe"]); // de-duplicated
});

test("normalizeDate", () => {
  assert.equal(normalizeDate("2025-03-14T22:00:00-05:00"), "2025-03-14");
  assert.equal(normalizeDate("2020/3/4"), "2020-03-04");
  assert.equal(normalizeDate("2019"), "2019");
  assert.equal(normalizeDate("2019-07"), "2019-07");
  assert.equal(normalizeDate("March 14, 2025"), "2025-03-14");
  assert.equal(normalizeDate("garbage"), "");
});

test("findDoi", () => {
  assert.equal(findDoi("doi:10.1000/xyz123"), "10.1000/xyz123");
  assert.equal(findDoi("https://doi.org/10.1038/s41586-020-2649-2."), "10.1038/s41586-020-2649-2");
  assert.equal(findDoi("https://x.org/a?doi=10.1000%2Fabc"), "10.1000/abc");
  assert.equal(findDoi("no doi here"), "");
});

const academic = {
  url: "https://journal.example.org/article/1",
  title: "Fallback title",
  canonical: "",
  lang: "en",
  meta: {
    citation_title: ["Real Journal Title"],
    citation_author: ["Doe, Jane", "Smith, John"],
    citation_journal_title: ["Journal of Tests"],
    citation_volume: ["12"],
    citation_issue: ["3"],
    citation_firstpage: ["100"],
    citation_lastpage: ["112"],
    citation_doi: ["10.1000/test.1"],
    citation_publication_date: ["2020/03/14"],
    "og:title": ["OG Title"],
    "og:site_name": ["Example Journals"],
  },
  jsonld: [],
};

test("mergeMetadata: citation_* wins and type is journal-article", () => {
  const m = mergeMetadata(academic, { accessed: "2026-10-21" });
  assert.equal(m.title, "Real Journal Title");
  assert.deepEqual(m.authors.map(authorDisplay), ["Jane Doe", "John Smith"]);
  assert.equal(m.type, "journal-article");
  assert.equal(m.published, "2020-03-14");
  assert.equal(m.pages, "100–112");
  assert.equal(m.doi, "10.1000/test.1");
  assert.equal(m.journal, "Journal of Tests");
});

test("mergeMetadata: JSON-LD NewsArticle with @graph author reference", () => {
  const raw = {
    url: "https://www.news.example.com/story",
    title: "Story | News",
    meta: { "og:site_name": ["Example News"] },
    jsonld: [
      { "@type": "NewsArticle", headline: "Big Story", datePublished: "2025-03-14T08:00:00Z", author: [{ "@id": "#a1" }], publisher: { "@type": "Organization", name: "Example News Co" } },
      { "@type": "Person", "@id": "#a1", name: "Jane Doe" },
    ],
  };
  const m = mergeMetadata(raw);
  assert.equal(m.type, "news-article");
  assert.equal(m.title, "Big Story");
  assert.deepEqual(m.authors.map(authorDisplay), ["Jane Doe"]);
  assert.equal(m.site, "Example News");
  assert.equal(m.published, "2025-03-14");
});

test("mergeMetadata: bare page falls back to <title> and hostname", () => {
  const m = mergeMetadata({ url: "https://www.plain.example.com/a", title: "Plain Page", meta: {}, jsonld: [] });
  assert.equal(m.title, "Plain Page");
  assert.equal(m.site, "plain.example.com");
  assert.equal(m.type, "web-page");
  assert.deepEqual(m.authors, []);
  assert.equal(m.published, "");
});

test("mergeMetadata: finds a DOI in the URL and detects video", () => {
  assert.equal(mergeMetadata({ url: "https://doi.org/10.1000/abc.def", title: "x", meta: {}, jsonld: [] }).doi, "10.1000/abc.def");
  assert.equal(mergeMetadata({ url: "https://www.youtube.com/watch?v=1", title: "x", meta: {}, jsonld: [] }).type, "video");
});
