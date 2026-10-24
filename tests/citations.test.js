import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCitation, formatChicagoNote, sortForBibliography, formatBibliography, citationToPlain, citationToHtml,
} from "../src/lib/citations.js";

const person = (given, family) => ({ given, family });
const org = (literal) => ({ given: "", family: "", literal });

const journal = {
  type: "journal-article",
  title: "Real Journal Title",
  authors: [person("Jane", "Doe"), person("John", "Smith")],
  journal: "Journal of Tests", volume: "12", issue: "3", pages: "100–112",
  doi: "10.1000/test.1", published: "2020-03-14", url: "https://journal.example.org/a/1", accessed: "2026-10-21",
};
const news = {
  type: "news-article", title: "Big Story", authors: [person("Jane", "Doe")],
  site: "Example News", published: "2025-03-14", url: "https://news.example.com/s", accessed: "2026-10-21",
};
const web = {
  type: "web-page", title: "Page Title", authors: [person("Jane", "Doe")],
  site: "Example Site", published: "2025-03-14", url: "https://example.com/p", accessed: "2026-10-21",
};
const book = {
  type: "book", title: "The Book Title", authors: [person("Jane", "Doe")],
  publisher: "Big Press", published: "2019", url: "https://example.com/book", accessed: "2026-10-21",
};
const video = {
  type: "video", title: "Intro to Algebra", authors: [org("Khan Academy")],
  site: "YouTube", published: "2025-03-14", url: "https://www.youtube.com/watch?v=x", accessed: "2026-10-21",
};

// ---------- APA ----------

test("APA: journal article with two authors and DOI", () => {
  assert.equal(
    formatCitation(journal, "apa"),
    "Doe, J., & Smith, J. (2020). Real Journal Title. *Journal of Tests*, *12*(3), 100–112. https://doi.org/10.1000/test.1",
  );
});

test("APA: news article and web page", () => {
  assert.equal(formatCitation(news, "apa"), "Doe, J. (2025, March 14). Big Story. *Example News*. https://news.example.com/s");
  assert.equal(formatCitation(web, "apa"), "Doe, J. (2025, March 14). *Page Title*. Example Site. https://example.com/p");
});

test("APA: organization author that is also the site name is not repeated", () => {
  const who = { ...web, authors: [org("World Health Organization")], site: "World Health Organization", title: "Fact sheet" };
  assert.equal(formatCitation(who, "apa"), "World Health Organization. (2025, March 14). *Fact sheet*. https://example.com/p");
});

test("APA: three authors, hyphenated and multiple given names", () => {
  const m = { ...web, authors: [person("Jean-Paul", "Sartre"), person("Mary Ann", "Evans"), person("J. R. R.", "Tolkien")] };
  assert.equal(
    formatCitation(m, "apa"),
    "Sartre, J.-P., Evans, M. A., & Tolkien, J. R. R. (2025, March 14). *Page Title*. Example Site. https://example.com/p",
  );
});

test("APA: no author moves the title first; no date gives n.d.", () => {
  const m = { ...web, authors: [], published: "" };
  assert.equal(formatCitation(m, "apa"), "*Page Title*. (n.d.). Example Site. https://example.com/p");
  const n = { ...news, authors: [], published: "" };
  assert.equal(formatCitation(n, "apa"), "Big Story. (n.d.). *Example News*. https://news.example.com/s");
});

test("APA: 21+ authors list the first 19, an ellipsis, then the last", () => {
  const authors = Array.from({ length: 22 }, (_, i) => person("Ann", `Author${String.fromCharCode(65 + i)}`));
  const out = formatCitation({ ...journal, authors, doi: "" , url: ""}, "apa");
  assert.match(out, /^AuthorA, A\., AuthorB, A\., /);
  assert.match(out, /AuthorS, A\., \. \. \. AuthorV, A\. \(2020\)\./);
  assert.ok(!out.includes("AuthorT"));
});

test("APA: book, video, month-only date, suffix", () => {
  assert.equal(formatCitation(book, "apa"), "Doe, J. (2019). *The Book Title*. Big Press.");
  assert.equal(formatCitation(video, "apa"), "Khan Academy. (2025, March 14). *Intro to Algebra* [Video]. YouTube. https://www.youtube.com/watch?v=x");
  const jr = { ...web, authors: [{ given: "Martin Luther", family: "King", suffix: "Jr." }], published: "2025-03" };
  assert.equal(formatCitation(jr, "apa"), "King, M. L., Jr. (2025, March). *Page Title*. Example Site. https://example.com/p");
});

test("APA: titles ending in ? are not given an extra period", () => {
  assert.equal(formatCitation({ ...news, title: "Is it over?" }, "apa"), "Doe, J. (2025, March 14). Is it over? *Example News*. https://news.example.com/s");
});

// ---------- MLA ----------

test("MLA: web page with date, protocol removed from the URL", () => {
  assert.equal(formatCitation(web, "mla"), 'Doe, Jane. "Page Title." *Example Site*, 14 Mar. 2025, example.com/p.');
});

test("MLA: no date falls back to the access date", () => {
  assert.equal(
    formatCitation({ ...web, published: "" }, "mla"),
    'Doe, Jane. "Page Title." *Example Site*, example.com/p. Accessed 21 Oct. 2026.',
  );
});

test("MLA: no author starts with the title", () => {
  assert.equal(formatCitation({ ...news, authors: [] }, "mla"), '"Big Story." *Example News*, 14 Mar. 2025, news.example.com/s.');
});

test("MLA: two authors, three or more authors (et al.)", () => {
  assert.equal(
    formatCitation(journal, "mla"),
    'Doe, Jane, and John Smith. "Real Journal Title." *Journal of Tests*, vol. 12, no. 3, 2020, pp. 100–112, https://doi.org/10.1000/test.1.',
  );
  const three = { ...journal, authors: [person("Jane", "Doe"), person("John", "Smith"), person("Ann", "Lee")] };
  assert.match(formatCitation(three, "mla"), /^Doe, Jane, et al\. "Real Journal Title\."/);
});

test("MLA: book, video, question-mark title, September abbreviation", () => {
  assert.equal(formatCitation(book, "mla"), "Doe, Jane. *The Book Title*. Big Press, 2019.");
  assert.equal(
    formatCitation(video, "mla"),
    '"Intro to Algebra." *YouTube*, uploaded by Khan Academy, 14 Mar. 2025, youtube.com/watch?v=x.'.replace("youtube.com", "www.youtube.com"),
  );
  assert.equal(formatCitation({ ...web, title: "Why?", published: "2025-09-05" }, "mla"), 'Doe, Jane. "Why?" *Example Site*, 5 Sept. 2025, example.com/p.');
});

// ---------- Chicago ----------

test("Chicago: news article bibliography entry and first note", () => {
  assert.equal(formatCitation(news, "chicago"), 'Doe, Jane. "Big Story." *Example News*, March 14, 2025. https://news.example.com/s.');
  assert.equal(formatChicagoNote(news), 'Jane Doe, "Big Story," *Example News*, March 14, 2025, https://news.example.com/s.');
});

test("Chicago: journal article", () => {
  assert.equal(
    formatCitation(journal, "chicago"),
    'Doe, Jane, and John Smith. "Real Journal Title." *Journal of Tests* 12, no. 3 (2020): 100–112. https://doi.org/10.1000/test.1.',
  );
  assert.equal(
    formatChicagoNote(journal),
    'Jane Doe and John Smith, "Real Journal Title," *Journal of Tests* 12, no. 3 (2020): 100–112, https://doi.org/10.1000/test.1.',
  );
});

test("Chicago: book and video", () => {
  assert.equal(formatCitation(book, "chicago"), "Doe, Jane. *The Book Title*. Big Press, 2019.");
  assert.equal(formatChicagoNote(book), "Jane Doe, *The Book Title* (Big Press, 2019).");
  assert.equal(formatCitation(video, "chicago"), 'Khan Academy. "Intro to Algebra." YouTube video. March 14, 2025. https://www.youtube.com/watch?v=x.');
  assert.equal(formatChicagoNote(video), 'Khan Academy, "Intro to Algebra," YouTube video, March 14, 2025, https://www.youtube.com/watch?v=x.');
});

test("Chicago: no author, no date uses the access date", () => {
  const m = { ...web, authors: [], published: "" };
  assert.equal(formatCitation(m, "chicago"), '"Page Title." Example Site. Accessed October 21, 2026. https://example.com/p.');
  assert.equal(formatChicagoNote(m), '"Page Title," Example Site, accessed October 21, 2026, https://example.com/p.');
});

test("Chicago: authors beyond three in a note use et al.; four to ten are all listed in the bibliography", () => {
  const four = { ...web, authors: [person("A", "One"), person("B", "Two"), person("C", "Three"), person("D", "Four")] };
  assert.match(formatChicagoNote(four), /^A One et al\., "Page Title,"/);
  assert.match(formatCitation(four, "chicago"), /^One, A, B Two, C Three, and D Four\. "Page Title\."/);
  const three = { ...web, authors: four.authors.slice(0, 3) };
  assert.match(formatChicagoNote(three), /^A One, B Two, and C Three, "Page Title,"/);
});

test("Chicago: question-mark titles drop the comma in notes", () => {
  assert.match(formatChicagoNote({ ...news, title: "Is it over?" }), /^Jane Doe, "Is it over\?" \*Example News\*,/);
});

// ---------- Bibliographies ----------

test("sortForBibliography: by first author, then title ignoring A/An/The, then year", () => {
  const sorted = sortForBibliography([
    { title: "Zeta", authors: [person("Z", "Zed")], published: "2020" },
    { title: "The Apple Report", authors: [], published: "2021" },
    { title: "B", authors: [person("J", "Doe")], published: "2022" },
    { title: "A", authors: [person("J", "Doe")], published: "2019" },
  ]);
  assert.deepEqual(sorted.map((m) => m.title), ["The Apple Report", "A", "B", "Zeta"]);
});

test("formatBibliography: heading per style, markdown keeps italics, text strips them", () => {
  const md = formatBibliography([web, book], "apa", "md");
  assert.match(md, /^# References\n\nDoe, J\. \(2019\)\. \*The Book Title\*\. Big Press\.\n\nDoe, J\. \(2025, March 14\)\./);
  const txt = formatBibliography([web, book], "mla", "txt");
  assert.match(txt, /^Works Cited\n\n/);
  assert.ok(!txt.includes("*"));
  assert.match(formatBibliography([web], "chicago", "txt"), /^Bibliography\n/);
});

test("output conversions and asterisks in data", () => {
  assert.equal(citationToPlain("A *b* c"), "A b c");
  assert.equal(citationToHtml("A & <b> *i*"), "A &amp; &lt;b&gt; <i>i</i>");
  assert.ok(!formatCitation({ ...web, title: "5 * 3 = 15" }, "apa").includes("5 *"));
});
