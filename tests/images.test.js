import test from "node:test";
import assert from "node:assert/strict";
import { expandCandidates } from "../src/lib/imageRules.js";
import { parseSrcset, gatherCandidates } from "../src/lib/imageCandidates.js";
import { sniffImage } from "../src/lib/images.js";
import { imageBlock, imageFilename } from "../src/lib/note.js";

// First rewrite produced for a single URL (what the rules think the original is).
const rewritten = (url) => expandCandidates([{ url, source: "src" }]).map((c) => c.url);

test("rule: wikimedia thumb -> original, but not for TIFF/PDF originals", () => {
  assert.equal(
    rewritten("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cat_November_2010-1a.jpg/220px-Cat_November_2010-1a.jpg")[0],
    "https://upload.wikimedia.org/wikipedia/commons/a/ab/Cat_November_2010-1a.jpg",
  );
  const tif = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Scan.tif/lossy-page1-800px-Scan.tif.jpg";
  assert.deepEqual(rewritten(tif), [tif]);
});

test("rule: wordpress size suffix and -scaled", () => {
  assert.equal(rewritten("https://blog.example.com/wp-content/uploads/2024/01/photo-300x200.jpg")[0], "https://blog.example.com/wp-content/uploads/2024/01/photo.jpg");
  assert.equal(rewritten("https://blog.example.com/wp-content/uploads/2024/01/photo-scaled.jpeg")[0], "https://blog.example.com/wp-content/uploads/2024/01/photo.jpeg");
});

test("rule: shopify suffix and width param", () => {
  assert.equal(rewritten("https://cdn.shopify.com/s/files/1/0001/products/shirt_300x.jpg?v=123&width=360")[0], "https://cdn.shopify.com/s/files/1/0001/products/shirt.jpg?v=123");
});

test("rule: amazon size token", () => {
  assert.equal(rewritten("https://m.media-amazon.com/images/I/71abcDEF._AC_UY218_.jpg")[0], "https://m.media-amazon.com/images/I/71abcDEF.jpg");
  assert.equal(rewritten("https://m.media-amazon.com/images/I/71abc._SX300_.jpg")[0], "https://m.media-amazon.com/images/I/71abc.jpg");
});

test("rule: twitter name=orig, legacy suffix, profile picture", () => {
  assert.equal(rewritten("https://pbs.twimg.com/media/Abc123?format=jpg&name=small")[0], "https://pbs.twimg.com/media/Abc123?format=jpg&name=orig");
  assert.equal(rewritten("https://pbs.twimg.com/media/Abc123.jpg:small")[0], "https://pbs.twimg.com/media/Abc123.jpg:orig?name=orig");
  assert.equal(rewritten("https://pbs.twimg.com/profile_images/1/me_normal.jpg")[0], "https://pbs.twimg.com/profile_images/1/me.jpg");
});

test("rule: reddit preview and pinterest size folder", () => {
  assert.equal(rewritten("https://preview.redd.it/abc123.jpg?width=640&format=pjpg&auto=webp&s=x")[0], "https://i.redd.it/abc123.jpg");
  assert.equal(rewritten("https://i.pinimg.com/236x/ab/cd/ef/hash.jpg")[0], "https://i.pinimg.com/originals/ab/cd/ef/hash.jpg");
  assert.equal(rewritten("https://i.pinimg.com/736x/ab/cd/hash.jpg")[0], "https://i.pinimg.com/originals/ab/cd/hash.jpg");
});

test("rule: unsplash/imgix resize parameters", () => {
  assert.equal(rewritten("https://images.unsplash.com/photo-123?w=400&q=80&fit=crop&ixid=abc")[0], "https://images.unsplash.com/photo-123?ixid=abc");
});

test("expandCandidates: rewrites come first, the original is always kept, no duplicates", () => {
  const list = expandCandidates([
    { url: "https://i.pinimg.com/236x/ab/hash.jpg", source: "src" },
    { url: "https://example.com/plain.png", source: "link" },
  ]);
  assert.deepEqual(list.map((c) => c.url), [
    "https://i.pinimg.com/originals/ab/hash.jpg",
    "https://i.pinimg.com/236x/ab/hash.jpg",
    "https://example.com/plain.png",
  ]);
  assert.equal(list[0].source, "src+pinterest");
});

test("parseSrcset: w and x descriptors, commas inside URLs", () => {
  assert.deepEqual(parseSrcset("a.jpg 400w, b.jpg 1200w, c.jpg 800w").map((e) => e.url), ["b.jpg", "c.jpg", "a.jpg"]);
  assert.deepEqual(parseSrcset("a.jpg 1x, b.jpg 2x").map((e) => e.url), ["b.jpg", "a.jpg"]);
  assert.deepEqual(parseSrcset("https://cdn.x/w_300,h_200/a.jpg 300w, https://cdn.x/w_900,h_600/a.jpg 900w").map((e) => e.url), [
    "https://cdn.x/w_900,h_600/a.jpg",
    "https://cdn.x/w_300,h_200/a.jpg",
  ]);
});

test("gatherCandidates: srcset > link > lazy > src, resolved and de-duplicated", () => {
  const list = gatherCandidates({
    srcUrl: "https://site.com/img/small.jpg",
    baseURI: "https://site.com/article/",
    srcsets: ["/img/small.jpg 300w, /img/big.jpg 1500w"],
    links: ["https://site.com/img/full.png", "https://site.com/other-page"],
    lazy: [{ attr: "data-src", value: "../img/lazy.jpg" }, { attr: "data-src", value: "data:image/gif;base64,R0lGOD" }],
  });
  assert.deepEqual(list.map((c) => [c.url, c.source]), [
    ["https://site.com/img/big.jpg", "srcset"],
    ["https://site.com/img/small.jpg", "srcset"],
    ["https://site.com/img/full.png", "link"],
    ["https://site.com/img/lazy.jpg", "lazy:data-src"],
  ]);
});

test("sniffImage identifies formats from bytes and rejects HTML", () => {
  const pad = (arr) => Uint8Array.from([...arr, ...new Array(16).fill(0)]);
  const text = (s) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
  assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])).ext, "jpg");
  assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])).ext, "png");
  assert.equal(sniffImage(text("GIF89a............")).ext, "gif");
  assert.equal(sniffImage(text("RIFF\0\0\0\0WEBPVP8 ")).ext, "webp");
  assert.equal(sniffImage(text("\0\0\0\x1cftypavif....")).ext, "avif");
  assert.equal(sniffImage(text('<?xml version="1.0"?><svg xmlns="x"></svg>')).ext, "svg");
  assert.equal(sniffImage(text("<!DOCTYPE html><html><body>nope</body></html>")), null);
});

test("imageFilename: readable name plus content hash", () => {
  assert.equal(imageFilename("https://e.com/a/My%20Photo.JPG?x=1", "1a2b3c4d", "jpg"), "My Photo-1a2b3c4d.jpg");
  assert.equal(imageFilename("data:image/png;base64,AAAA", "deadbeef", "png"), "image-deadbeef.png");
  assert.equal(imageFilename("https://e.com/", "00000000", "png"), "image-00000000.png");
});

test("imageBlock: embed with caption, page, original and date; or remote link when not downloaded", () => {
  const args = { imageUrl: "https://e.com/i.jpg", caption: "A cat", pageUrl: "https://e.com/p", capturedAt: "2026-10-21T20:16:00" };
  assert.equal(
    imageBlock({ ...args, vaultPath: "Sources/attachments/i-1.jpg" }),
    "![[Sources/attachments/i-1.jpg]]\nA cat · [page](https://e.com/p) · [original image](https://e.com/i.jpg) · captured 2026-10-21 20:16",
  );
  assert.equal(
    imageBlock({ ...args, vaultPath: null }),
    "![A cat](https://e.com/i.jpg)\nA cat · [page](https://e.com/p) · [original image](https://e.com/i.jpg) · captured 2026-10-21 20:16 · not downloaded",
  );
});
