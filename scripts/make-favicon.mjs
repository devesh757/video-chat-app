import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 32;
const W = S, H = S;
const bg = [0x63, 0x66, 0xf1, 0xff];   // indigo #6366f1
const fg = [0xff, 0xff, 0xff, 0xff];   // white

// draw a thick "S"-like block glyph on a 32x32 grid
const d = 5;                            // stroke depth
const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
  const inTop = y >= 0 && y < d && x >= 3 && x < W - 3;
  const inBottom = y >= H - d && y < H && x >= 3 && x < W - 3;
  const inLeftTop = y >= 6 && y < 14 && x >= 3 && x < 3 + d;
  const inRightTop = y >= 6 && y < 14 && x > W - 3 - d && x < W - 3;
  const inLeftBottom = y >= H - 14 && y < H - 6 && x >= 3 && x < 3 + d;
  const inRightBottom = y >= H - 14 && y < H - 6 && x > W - 3 - d && x < W - 3;
  const inMidRight = y >= 13 && y < H - 13 && x > W - 3 - d && x < W - 3;
  return inTop || inBottom || inLeftTop || inRightTop || inLeftBottom || inRightBottom || inMidRight;
}));

// RGBA rows top-to-bottom
const raw = Buffer.alloc(W * H * 4);
rows.forEach((row, y) => {
  row.forEach((on, x) => {
    const off = (y * W + x) * 4;
    const c = on ? fg : bg;
    raw[off] = c[0]; raw[off + 1] = c[1]; raw[off + 2] = c[2]; raw[off + 3] = c[3];
  });
});

// filters (0 for each scanline)
const stride = W * 4 + 1;
const rawWithFilter = Buffer.alloc(stride * H);
for (let y = 0; y < H; y++) {
  rawWithFilter[y * stride] = 0;
  raw.copy(rawWithFilter, y * stride + 1, y * W * 4, (y + 1) * W * 4);
}

const idat = deflateSync(rawWithFilter);

// --- CRC32 (declare before chunk is used) --- //
const table = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(W, 0); b.writeUInt32BE(H, 4);
    b[8] = 8; b[9] = 6; b[10] = 0; b[11] = 0; b[12] = 0;
    return b;
  })()),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

// ICO container (single PNG entry)
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0);      // reserved
ico.writeUInt16LE(1, 2);      // type: icon
ico.writeUInt16LE(1, 4);      // count
ico[6] = 32;                  // width
ico[7] = 32;                  // height
ico[8] = 0;                   // colors
ico[9] = 0;                   // reserved
ico.writeUInt16LE(1, 10);     // planes
ico.writeUInt16LE(32, 12);    // bit count
ico.writeUInt32LE(png.length, 14); // size
ico.writeUInt32LE(22, 18);    // offset
const icon = Buffer.concat([ico, png]);

mkdirSync("public", { recursive: true });
writeFileSync("public/favicon.ico", icon);
console.log("wrote public/favicon.ico", icon.length, "bytes");