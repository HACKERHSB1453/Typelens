// Draws the TypeLens icon (a white lens on black, matching the dashboard theme) as PNGs and a Windows .ico,
// with no dependencies. Run from the repository root or anywhere:
//   node apps/extension/scripts/make-icons.mjs
//   -> apps/extension/static/icon-{16,48,128}.png          (browser extension toolbar/store icons)
//   -> apps/desktop/build/icon.png (512), icon-256.png      (desktop app window/tray/installer source)
//   -> apps/desktop/build/icons/<n>x<n>.png for n in 16,32,48,64,128,256,512 (Linux icon set)
//   -> apps/desktop/build/icon.ico (16, 32, 48, 256; PNG-compressed entries)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'static');
const desktopBuild = path.join(here, '..', '..', 'desktop', 'build');

// signed-distance shapes in a 0..1 unit square
const ring = (x, y) => Math.abs(Math.hypot(x - 0.42, y - 0.42) - 0.24) - 0.07;
function handle(x, y) {
  // segment from (0.6,0.6) to (0.84,0.84), radius 0.07
  const ax = 0.6, ay = 0.6, bx = 0.84, by = 0.84;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) - 0.07;
}
function box(x, y) {
  // rounded square covering the icon
  const r = 0.2, qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function render(size) {
  const ss = 4; // supersampling for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inBox = 0, white = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size, v = (y + (sy + 0.5) / ss) / size;
          if (box(u, v) <= 0) {
            inBox++;
            if (ring(u, v) <= 0 || handle(u, v) <= 0) white++;
          }
        }
      }
      const n = ss * ss, i = (y * size + x) * 4;
      const c = inBox ? Math.round((255 * white) / inBox) : 0;
      px[i] = px[i + 1] = px[i + 2] = c;
      px[i + 3] = Math.round((255 * inBox) / n);
    }
  }
  return png(size, size, px);
}

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); // filter byte 0 per row
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Windows .icon container: ICONDIR + one ICONDIRENTRY per image + the PNG blobs (Windows Vista+ reads PNG entries). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, data }, i) => {
    const e = i * 16;
    entries[e] = size >= 256 ? 0 : size; // width: 0 means 256
    entries[e + 1] = size >= 256 ? 0 : size; // height
    entries[e + 2] = 0; // palette colours
    entries[e + 3] = 0; // reserved
    entries.writeUInt16LE(1, e + 4); // colour planes
    entries.writeUInt16LE(32, e + 6); // bits per pixel
    entries.writeUInt32LE(data.length, e + 8); // image bytes
    entries.writeUInt32LE(offset, e + 12); // image offset
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.data)]);
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  console.log(`wrote ${path.relative(process.cwd(), file) || file}`);
}

// browser extension
for (const s of [16, 48, 128]) write(path.join(out, `icon-${s}.png`), render(s));

// desktop app
const desktopPng = new Map([16, 32, 48, 64, 128, 256, 512].map((s) => [s, render(s)]));
write(path.join(desktopBuild, 'icon.png'), desktopPng.get(512));
write(path.join(desktopBuild, 'icon-256.png'), desktopPng.get(256));
for (const [s, data] of desktopPng) write(path.join(desktopBuild, 'icons', `${s}x${s}.png`), data);
write(
  path.join(desktopBuild, 'icon.ico'),
  ico([16, 32, 48, 256].map((size) => ({ size, data: desktopPng.get(size) }))),
);
