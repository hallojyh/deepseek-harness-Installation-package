"use strict";
// 首次运行预热脚本：安装收尾阶段由安装向导调用（waituntilterminated）。
// 完整启动一次 dsh web 服务（完成 profile 初始化、会话库创建等一次性开销），
// 就绪后立即终止整个进程树，使安装完成后的首次启动变成热启动（约 1~2 秒）。
// 用法: node prewarm.js <node.exe> <bin.js> <port> [timeoutMs]
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");

const [nodeBin, binJs, portArg, timeoutArg] = process.argv.slice(2);
const port = Number(portArg);
const timeoutMs = Number(timeoutArg) > 0 ? Number(timeoutArg) : 180000;

if (!nodeBin || !binJs || !Number.isFinite(port)) {
  process.stderr.write("prewarm: usage: node prewarm.js <node.exe> <bin.js> <port> [timeoutMs]\n");
  process.exit(2);
}

function httpGet(url, ms) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: ms }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}


function ensureProfileJunctions() {
  if (process.platform !== "win32") return;
  const appDir = __dirname;
  const target = require("node:path").join(appDir, "app", "node_modules", "@deepseek-ai");
  const fs = require("node:fs");
  if (!fs.existsSync(require("node:path").join(target, "dsh-base"))) return;
  const home = (process.env.DSH_HOME || "").trim() || require("node:path").join(require("node:os").homedir(), ".dsh");
  for (const profile of ["web", "headless"]) {
    const nmScope = require("node:path").join(home, "profiles", profile, "node_modules");
    const link = require("node:path").join(nmScope, "@deepseek-ai");
    try {
      const healthy = (p) =>
        fs.existsSync(require("node:path").join(p, "dsh-base", "lib", "index.js")) &&
        fs.existsSync(require("node:path").join(p, "cordis-plugin-timer", "lib", "index.js"));
      if (fs.existsSync(link)) {
        if (healthy(link)) continue;
        try { fs.renameSync(link, link + ".incomplete-" + Date.now()); }
        catch (_) { try { fs.rmSync(link, { recursive: true, force: true }); } catch (_) {} }
      }
      fs.mkdirSync(nmScope, { recursive: true });
      fs.symlinkSync(target, link, "junction");
    } catch (_) {}
  }
}
ensureProfileJunctions();

const child = spawn(nodeBin, [binJs, "web", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: "ignore",
  windowsHide: true,
});

function killTree() {
  if (child.pid > 0) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
}

(async () => {
  const deadline = Date.now() + timeoutMs;
  let up = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    if (child.exitCode !== null) break;
    if (await httpGet("http://127.0.0.1:" + port + "/", 1500)) { up = true; break; }
  }
  killTree();
  if (up) {
    process.stdout.write("prewarm: ok\n");
    process.exit(0);
  }
  process.stderr.write("prewarm: timed out or failed\n");
  process.exit(1);
})();