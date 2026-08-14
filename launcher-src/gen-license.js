"use strict";
// 把 license.txt 转成 Inno Setup 可显示的 RTF（中文用 \uN 转义，保证不乱码）
const fs = require("node:fs");
const text = fs.readFileSync("D:\\DS_workplace\\installer\\license.txt", "utf8");
let out = "{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0\\fnil\\fcharset134 Microsoft YaHei;}}\\viewkind4\\uc1\\pard\\f0\\fs20 ";
for (const ch of text) {
  const code = ch.codePointAt(0);
  if (ch === "\\") out += "\\\\";
  else if (ch === "{") out += "\\{";
  else if (ch === "}") out += "\\}";
  else if (ch === "\n") out += "\\par ";
  else if (code > 126) out += "\\u" + code + "?";
  else out += ch;
}
out += "}";
fs.writeFileSync("D:\\DS_workplace\\installer\\license.rtf", out, "utf8");
console.log("license.rtf written, " + Buffer.byteLength(out, "utf8") + " bytes");
