"use strict";
// 把 exe 的 PE 子系统从 CONSOLE(3) 改为 WINDOWS/GUI(2)：双击启动不再弹出终端窗口
// 用法: node patch-subsystem.js <exe路径>
const fs = require("node:fs");

const file = process.argv[2];
if (!file) { console.error("usage: node patch-subsystem.js <exe>"); process.exit(1); }
const buf = fs.readFileSync(file);
if (buf.readUInt16LE(0) !== 0x5a4d) { console.error("not a PE file"); process.exit(1); }
const e_lfanew = buf.readUInt32LE(0x3c);
if (buf.readUInt32LE(e_lfanew) !== 0x00004550) { console.error("bad PE signature"); process.exit(1); }
const optMagic = buf.readUInt16LE(e_lfanew + 24);
if (optMagic !== 0x20b && optMagic !== 0x10b) { console.error("unknown optional header magic"); process.exit(1); }
const subsystemOff = e_lfanew + 24 + 0x44; // Subsystem 字段：PE32 与 PE32+ 均为 opt+0x44
const before = buf.readUInt16LE(subsystemOff);
if (before !== 3) { console.log("subsystem already " + before + " (not console), skipping"); process.exit(0); }
buf.writeUInt16LE(2, subsystemOff);
fs.writeFileSync(file, buf);
console.log("patched subsystem 3 (console) -> 2 (GUI): " + file);