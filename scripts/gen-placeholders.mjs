// Generates 4 valid 64x64 PNG placeholder token images into mcp/assets/.
// Pattern: dark background with a centered accent square — no deps beyond node:zlib.
import { deflateSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CRC_TABLE = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 1 + x * 3 + 1] = g;
      raw[row + 1 + x * 3 + 2] = b;
    }
  }
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const BG = [13, 13, 13];
const ACCENTS = [
  [0, 255, 136],
  [0, 204, 106],
  [102, 255, 178],
  [0, 153, 85],
];
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "mcp", "assets");
fs.mkdirSync(outDir, { recursive: true });
ACCENTS.forEach((accent, i) => {
  const buf = png(64, 64, (x, y) => {
    const inSquare = x >= 16 && x < 48 && y >= 16 && y < 48;
    const onBorder = (x === 4 || x === 59 || y === 4 || y === 59) && x >= 4 && x <= 59 && y >= 4 && y <= 59;
    return inSquare || onBorder ? accent : BG;
  });
  fs.writeFileSync(path.join(outDir, `placeholder-${i}.png`), buf);
  console.log(`wrote placeholder-${i}.png (${buf.length} bytes)`);
});
