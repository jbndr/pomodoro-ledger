// Packs extension/ into dist-extension/pomodoro-ledger-site-blocker-<version>.zip, with no dependencies.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "extension");
const out = path.join(root, "dist-extension");
const { version } = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.name.startsWith(".") || e.name === "README.md") return [];
  return e.isDirectory() ? files(p) : [p];
}).sort();

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

const local = [], central = [];
let offset = 0;
for (const file of files(src)) {
  const name = Buffer.from(path.relative(src, file).split(path.sep).join("/"));
  const data = fs.readFileSync(file), packed = zlib.deflateRawSync(data, { level: 9 }), crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 8); dir.writeUInt16LE(8, 10);
  dir.writeUInt32LE(0, 12); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(packed.length, 20); dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28); dir.writeUInt32LE(offset, 42);
  local.push(head, name, packed);
  central.push(dir, name);
  offset += head.length + name.length + packed.length;
}
const size = central.reduce((n, b) => n + b.length, 0), count = central.length / 2;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);

fs.mkdirSync(out, { recursive: true });
const zip = path.join(out, `pomodoro-ledger-site-blocker-${version}.zip`);
fs.writeFileSync(zip, Buffer.concat([...local, ...central, end]));
console.log(`${path.relative(root, zip)} (${count} files)`);
