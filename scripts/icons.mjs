// Generates simple PNG icons (no dependencies) into public/icons.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // rounded square, indigo gradient, white "speech bubble" dot in the middle
      const dx = Math.max(r - x, 0, x - (size - 1 - r)), dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = dx * dx + dy * dy <= r * r;
      const cx = x - size / 2, cy = y - size / 2 - size * 0.04;
      const bubble = (Math.abs(cx) < size * 0.27 && Math.abs(cy) < size * 0.18) ;
      let col = [79 + (y / size) * 40, 70 + (y / size) * 30, 229 - (y / size) * 30, 255];
      if (bubble) col = [255, 255, 255, 255];
      if (!inside) col = [0, 0, 0, 0];
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = col[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
mkdirSync("public/icons", { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`public/icons/${s}.png`, png(s));
