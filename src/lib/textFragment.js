// Builds "text fragment" links (#:~:text=...) that make the browser scroll to
// and highlight a quoted passage. Spec: https://wicg.github.io/scroll-to-text-fragment/

const MAX_EXACT_LENGTH = 200; // quotes longer than this use the start,end form
const MAX_EDGE_CHARS = 60;
const MAX_EDGE_WORDS = 8;

// encodeURIComponent leaves "-" alone, but "-" is syntax inside a fragment directive.
function encode(s) {
  return encodeURIComponent(s).replace(/-/g, "%2D");
}

function leadingWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (out.length >= MAX_EDGE_WORDS) break;
    if (out.length && out.join(" ").length + w.length + 1 > MAX_EDGE_CHARS) break;
    out.push(w);
  }
  return out.join(" ");
}

function trailingWords(text) {
  const words = text.split(/\s+/).filter(Boolean).reverse();
  const out = [];
  for (const w of words) {
    if (out.length >= MAX_EDGE_WORDS) break;
    if (out.length && out.join(" ").length + w.length + 1 > MAX_EDGE_CHARS) break;
    out.unshift(w);
  }
  return out.join(" ");
}

/**
 * @param {string} pageUrl  the page's URL (any existing fragment directive is replaced)
 * @param {string} text     the selected text; blank lines separate paragraphs
 * @returns {string} the link, or the plain URL if there is no usable text
 */
export function buildTextFragmentLink(pageUrl, text) {
  // Keep a normal fragment (e.g. "#/route") but drop any old ":~:" directive.
  const base = pageUrl.replace(/:~:.*$/, "").replace(/#$/, "");
  const blocks = text.split(/\n+/).map((b) => b.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!blocks.length) return base;

  const hash = base.includes("#") ? "" : "#";
  let directive;
  if (blocks.length === 1 && blocks[0].length <= MAX_EXACT_LENGTH) {
    directive = encode(blocks[0]);
  } else {
    // A match can't span a paragraph break as one string, but a start,end range can.
    const start = leadingWords(blocks[0]);
    const end = trailingWords(blocks[blocks.length - 1]);
    directive = start === end || !end ? encode(start) : `${encode(start)},${encode(end)}`;
  }
  return `${base}${hash}:~:text=${directive}`;
}
