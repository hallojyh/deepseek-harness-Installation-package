"use strict";
// 用 GitHub 仓库 apps/web/public/favicon.svg 的黑色鲸鱼原样渲染为 favicon.ico
// 不做任何背景/变色加工：黑鲸鱼 + 透明底，多尺寸 256/64/48/32/16
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("D:\\DS_workplace\\install-files\\app\\node_modules\\sharp");

const SRC_SVG = "D:\\DS_workplace\\install-files\\app\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist\\favicon.svg";
const OUT_ICO = path.join(__dirname, "favicon.ico");

function makeSvg(size, whale) {
  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 50 50">');
  parts.push(whale);
  parts.push('</svg>');
  return parts.join("");
}

async function main() {
  let svg = fs.readFileSync(SRC_SVG, "utf8");
  svg = svg.replace(/<style>[\s\S]*?<\/style>/, "");
  const whale = svg.match(/<path[\s\S]*?<\/svg>/)[0].replace(/<\/svg>$/, "");
  const sizes = [256, 64, 48, 32, 16];
  const pngs = [];
  for (const size of sizes) {
    const svgText = makeSvg(size, whale);
    const buf = await sharp(Buffer.from(svgText), { density: 72 }).png().toBuffer();
    pngs.push({ size, data: buf });
    console.log("rendered " + size + "px (" + buf.length + " bytes)");
  }
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
  const ico = Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
  fs.writeFileSync(OUT_ICO, ico);
  console.log("favicon.ico written, " + ico.length + " bytes");
}

main().catch((e) => { console.error(e); process.exit(1); });
