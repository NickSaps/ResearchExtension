// Builds browser-specific packages into dist/. Run: npm run build   (needs Node 22+)
//
// The source manifest.json works in every browser by declaring both browsers' keys; each
// browser ignores (with a harmless warning) the ones it doesn't know. The packages here
// strip those, so there are no warnings, and zip the result:
//   dist/chrome/  + dist/gleaner-chrome.zip    (also used for Edge)
//   dist/firefox/ + dist/gleaner-firefox.zip
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const INCLUDE = ["src", "icons"]; // folders copied as-is next to the manifest

const source = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const targets = {
  chrome(m) {
    delete m.sidebar_action;
    delete m.browser_specific_settings;
    delete m.background.scripts;
    return m;
  },
  firefox(m) {
    delete m.side_panel;
    m.permissions = m.permissions.filter((p) => p !== "sidePanel");
    delete m.background.service_worker;
    return m;
  },
};

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  });
}

// ---------- Minimal zip writer (deflate) ----------
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name);
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ---------- Build ----------
fs.rmSync(DIST, { recursive: true, force: true });

for (const [name, transform] of Object.entries(targets)) {
  const outDir = path.join(DIST, name);
  const manifest = transform(structuredClone(source));
  const entries = [{ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n") }];

  for (const folder of INCLUDE) {
    for (const rel of listFiles(path.join(ROOT, folder))) {
      entries.push({ name: `${folder}/${rel}`, data: fs.readFileSync(path.join(ROOT, folder, rel)) });
    }
  }
  for (const { name: file, data } of entries) {
    const dest = path.join(outDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
  const zipPath = path.join(DIST, `gleaner-${name}.zip`);
  fs.writeFileSync(zipPath, zip(entries));
  console.log(`${path.relative(ROOT, zipPath)}  (${entries.length} files, v${manifest.version})`);
}
