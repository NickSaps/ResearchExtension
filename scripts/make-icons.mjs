// Generates icons/icon-{16,32,48,128}.png with no dependencies (a tiny PNG encoder over node:zlib).
// Run: node scripts/make-icons.mjs
// The design is a purple rounded square with a white "G"-like ring and bar.
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "icons");
const SIZES = [16, 32, 48, 128];
const BG = [91, 75, 214];
const FG = [255, 255, 255];

/** Coverage (0..1) of the design at a point in unit coordinates, as [bgAlpha, fgAlpha]. */
function sample(x, y) {
  // Rounded square background.
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const inBg = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (!inBg) return [0, 0];
  // "G": ring with a gap on the upper right, plus a bar into the centre.
  const dx = x - 0.5;
  const dy = y - 0.5;
  const d = Math.hypot(dx, dy);
  const angle = Math.atan2(-dy, dx); // 0 = right, counter-clockwise positive
  const inRing = d >= 0.2 && d <= 0.33;
  const inGap = angle > 0 && angle < 0.9;
  const inBar = x >= 0.5 && x <= 0.67 && y >= 0.46 && y <= 0.54 && d <= 0.33;
  return [1, (inRing && !inGap) || inBar ? 1 : 0];
}

function render(size) {
  const SS = 4; // supersampling per axis, for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0; // filter type: none
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [b, f] = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          bg += b;
          fg += f;
        }
      }
      const n = SS * SS;
      const alpha = bg / n;
      const mix = bg ? fg / bg : 0;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix);
      raw[o + 3] = Math.round(alpha * 255);
    }
  }
  return raw;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(render(size))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(size));
  console.log(`icons/icon-${size}.png`);
}
