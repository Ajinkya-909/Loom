// Dependency-free PNG writer: draws a terracotta rounded square with a cream "port" ring.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const bg = [201, 100, 66], fg = [250, 247, 240];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22, cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // Rounded-square mask with 1px antialias
      const dx = Math.max(Math.abs(x + 0.5 - cx) - (cx - r), 0);
      const dy = Math.max(Math.abs(y + 0.5 - cy) - (cy - r), 0);
      const d = Math.hypot(dx, dy) - r;
      const a = Math.min(1, Math.max(0, 0.5 - d));
      // Ring + dot
      const rd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / size;
      const ring = Math.abs(rd - 0.27) < 0.065;
      const dot = rd < 0.1;
      const c = ring || dot ? fg : bg;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`public/icons/icon${s}.png`, png(s));
console.log('icons written');
