"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

function draw(size) {
  const png = new PNG({ width: size, height: size });
  const s = size;
  const corner = Math.round(s * 0.22);
  // 圆角矩形测试
  function inRoundedRect(x, y) {
    const r = corner;
    const x0 = r, y0 = r, x1 = s - r, y1 = s - r;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true;
    for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r && x >= Math.min(cx, x0) - r && x <= Math.max(cx, x1) + r && y >= Math.min(cy, y0) - r && y <= Math.max(cy, y1) + r) return true;
    }
    return false;
  }
  // 星芒（4 尖）
  function inStar(x, y, cx, cy, R) {
    const dx = (x - cx) / R, dy = (y - cy) / R;
    return Math.pow(Math.abs(dx), 1.35) + Math.pow(Math.abs(dy), 1.35) <= 1;
  }
  const top = [77, 118, 233];   // #4D76E9
  const bot = [30, 42, 110];    // #1E2A6E
  const white = [255, 255, 255];
  const accent = [122, 217, 255];
  for (let y = 0; y < s; y++) {
    const t = y / (s - 1);
    for (let x = 0; x < s; x++) {
      const idx = (s * y + x) << 2;
      let r = 0, g = 0, b = 0, a = 0;
      if (inRoundedRect(x + 0.5, y + 0.5)) {
        r = top[0] + (bot[0] - top[0]) * t;
        g = top[1] + (bot[1] - top[1]) * t;
        b = top[2] + (bot[2] - top[2]) * t;
        a = 255;
        // 前景星芒 + 小圆点
        const c = s * 0.5;
        const R = s * 0.30;
        if (inStar(x + 0.5, y + 0.5, c, c, R)) { r = white[0]; g = white[1]; b = white[2]; }
        const dc = s * 0.135;
        const dx = x + 0.5 - (c + s * 0.18), dy = y + 0.5 - (c - s * 0.22);
        if (dx * dx + dy * dy <= dc * dc) { r = accent[0]; g = accent[1]; b = accent[2]; }
      }
      png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

const sizes = [256, 64, 48, 32, 16];
const pngs = sizes.map((s) => ({ size: s, data: draw(s) }));
const count = pngs.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
let offset = 6 + 16 * count;
const entries = [];
for (const p of pngs) {
  const e = Buffer.alloc(16);
  e.writeUInt8(p.size === 256 ? 0 : p.size, 0);
  e.writeUInt8(p.size === 256 ? 0 : p.size, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(p.data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += p.data.length;
  entries.push(e);
}
const ico = Buffer.concat([header, ...entries.map((e) => e), ...pngs.map((p) => p.data)]);
fs.writeFileSync(path.join(__dirname, "icon.ico"), ico);
console.log("icon.ico written, " + ico.length + " bytes");
