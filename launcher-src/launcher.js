"use strict";
// DeepSeek Harness 单文件启动器（SEA 编译）。
// 首次运行：把内嵌的 payload.tar.gz 解压安装到 %LOCALAPPDATA%\DeepSeekHarness
// 之后运行：直接复用安装目录。
// 行为：带参数 -> CLI 透传 node app/lib/bin.js <args...>
//       无参数 -> GUI 模式：若已有实例则打开浏览器；否则后台启动 web 服务并自动打开浏览器。
const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");
const sea = require("node:sea");

const APP_VERSION = "0.1.0";
const INSTALL_VERSION = "dsh-0.1.0-1";
const BASE_PORT = Number(process.env.DSH_BASE_PORT) > 0 ? Number(process.env.DSH_BASE_PORT) : 3080;
const NO_BROWSER = process.env.DSH_NO_BROWSER === "1";
const ARGS = process.argv.slice(2);

let logFd = null;
function log(msg) {
  try { process.stdout.write(msg + "\n"); } catch (_) {}
  try { if (logFd !== null) fs.writeSync(logFd, msg + "\n"); } catch (_) {}
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function resolveInstallDir() {
  // 安装版：运行时与本 exe 同目录（由安装包放到一起）
  const exeDir = path.dirname(process.execPath);
  if (fs.existsSync(path.join(exeDir, "runtime", "node.exe")) && fs.existsSync(path.join(exeDir, "app", "lib", "bin.js"))) {
    return exeDir;
  }
  // 绿色版：解压内嵌 payload 到指定目录
  if (process.env.DSH_INSTALL_DIR && process.env.DSH_INSTALL_DIR.trim()) {
    return path.resolve(process.env.DSH_INSTALL_DIR.trim());
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.TEMP || ".", "dsh");
  return path.join(base, "DeepSeekHarness");
}

// 让 dsh 及其子进程能找到内置的 node 与 pnpm（dsh plugin 依赖 PATH 中的 pnpm）
function buildEnv(installDir) {
  const env = { ...process.env };
  const sep = process.platform === "win32" ? ";" : ":";
  const parts = [];
  parts.push(path.join(installDir, "runtime"));
  parts.push(path.join(installDir, "tools", "pnpm", "node_modules", ".bin"));
  parts.push(path.join(installDir, "tools", "pnpm", "node_modules", "pnpm", "bin"));
  const existing = env.PATH || env.Path || "";
  env.PATH = [...parts, existing].join(sep);
  env.Path = env.PATH;
  return env;
}

function resolveLogDir(installDir) {
  const candidates = [path.join(installDir, "logs")];
  try {
    const base = process.env.LOCALAPPDATA || process.env.TEMP || ".";
    candidates.push(path.join(base, "DeepSeekHarness", "logs"));
  } catch (_) {}
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".probe-" + process.pid);
      fs.writeFileSync(probe, "x");
      fs.rmSync(probe, { force: true });
      return dir;
    } catch (_) {}
  }
  return null;
}

function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve({ ok: res.statusCode === 200, status: res.statusCode });
    });
    req.on("error", () => resolve({ ok: false, status: 0 }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0 }); });
  });
}

function tcpConnect(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(800, () => done(false));
  });
}

async function findServingPort(start) {
  const r = await httpGet("http://127.0.0.1:" + start + "/", 1500);
  if (r.ok) return start;
  return null;
}

async function findFreePort(start) {
  for (let p = start; p < start + 100; p++) {
    if (!(await tcpConnect(p))) return p;
  }
  return null;
}

function openBrowser(url) {
  if (NO_BROWSER) {
    log("[launcher] browser auto-open disabled (DSH_NO_BROWSER=1): " + url);
    return;
  }
  const c = spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
  c.unref();
}

// ---- 安装（首次解压内嵌 payload.tar.gz）----
async function ensureInstalled(installDir) {
  const marker = path.join(installDir, "install.marker");
  if (fs.existsSync(marker)) {
    try { if (fs.readFileSync(marker, "utf8").trim() === INSTALL_VERSION) return; } catch (_) {}
  }
  const rawAsset = sea.getAsset("payload.tar.gz");
  if (!rawAsset) {
    log("错误：exe 缺少内嵌运行时数据，请重新下载完整安装包。");
    process.exit(3);
  }
  const asset = Buffer.from(rawAsset);
  const lockPath = installDir + ".lock";
  let lockFd = null;
  for (let i = 0; i < 60; i++) {
    try { lockFd = fs.openSync(lockPath, "wx"); break; } catch (e) {
      if (e.code === "EEXIST") {
        // 其他进程正在安装：等它完成
        await sleep(1000);
        if (fs.existsSync(marker)) {
          try { if (fs.readFileSync(marker, "utf8").trim() === INSTALL_VERSION) return; } catch (_) {}
        }
        if (i === 59) { log("错误：等待其他进程安装超时。"); process.exit(3); }
        continue;
      }
      throw e;
    }
  }
  if (lockFd === null) { log("错误：无法获取安装锁。"); process.exit(3); }
  try {
    log("首次安装：正在解压 DeepSeek Harness 运行时（约 1-3 分钟，请稍候）…");
    const staging = installDir + ".staging-" + process.pid;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    await extractTarGz(asset, staging);
    // 校验关键文件
    for (const rel of ["runtime\\node.exe", "app\\lib\\bin.js"]) {
      if (!fs.existsSync(path.join(staging, rel))) {
        throw new Error("解压结果缺少关键文件: " + rel);
      }
    }
    fs.rmSync(installDir, { recursive: true, force: true });
    fs.renameSync(staging, installDir);
    fs.writeFileSync(marker, INSTALL_VERSION, "utf8");
    log("安装完成: " + installDir);
  } finally {
    try { fs.closeSync(lockFd); } catch (_) {}
    try { fs.rmSync(lockPath, { force: true }); } catch (_) {}
  }
}

function extractTarGz(gzBuffer, destDir) {
  return new Promise((resolve, reject) => {
    let tarExtract = null;
    try {
      tarExtract = require("tar-stream").extract();
    } catch (e) {
      reject(new Error("tar-stream 未正确打包: " + e.message));
      return;
    }
    let count = 0;
    tarExtract.on("entry", (header, stream, next) => {
      count++;
      if (count % 2000 === 0) log("  已解压 " + count + " 个文件…");
      const rel = header.name.replace(/\\/g, "/").replace(/^\/+/, "");
      const target = path.join(destDir, rel);
      if (!target.startsWith(destDir)) { next(); return; }
      const type = header.type;
      if (type === "directory" || rel.endsWith("/")) {
        fs.mkdirSync(target, { recursive: true });
        stream.resume();
        next();
        return;
      }
      if (type === "file" || type === "0" || type === "") {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const out = fs.createWriteStream(target);
        stream.pipe(out);
        out.on("close", () => {
          if (header.mtime) {
            try { fs.utimesSync(target, new Date(header.mtime * 1000), new Date(header.mtime * 1000)); } catch (_) {}
          }
          next();
        });
        out.on("error", (e) => { stream.destroy(); next(e); });
        stream.on("error", (e) => next(e));
        return;
      }
      if (type === "symlink" || type === "link") {
        stream.resume();
        try { fs.symlinkSync(header.linkname || "", target, "file"); } catch (_) {}
        next();
        return;
      }
      // 其他类型（pax 扩展头等由 tar-stream 处理，这里跳过未知类型）
      stream.resume();
      next();
    });
    tarExtract.on("finish", () => { log("解压完成，共 " + count + " 个文件。"); resolve(); });
    tarExtract.on("error", reject);
    const gunzip = zlib.createGunzip();
    gunzip.on("error", reject);
    Readable.from(gzBuffer).pipe(gunzip).pipe(tarExtract);
  });
}

// ---- 启动 ----
function fileUrlOf(p) {
  const segs = p.replace(/\\/g, "/").split("/");
  return "file:///" + segs.map((s, i) => (i === 0 ? s : encodeURIComponent(s))).join("/");
}

function writeSplash(logDir, installDir, port, failedText) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>DeepSeek Harness</title>
<style>
  html,body{margin:0;height:100%}
  body{background:#0e1226;color:#e9edff;font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}
  .spin{width:46px;height:46px;border-radius:50%;border:4px solid rgba(255,255,255,.12);border-top-color:#4d6bfe;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  h1{font-size:17px;font-weight:600;margin:0}
  p{font-size:13px;color:#8f98c0;margin:0}
  #err{display:none;color:#ff8a8a;max-width:460px;text-align:center;line-height:1.6}
</style>
</head>
<body>
<div class="spin"></div>
<h1>DeepSeek Harness 正在启动…</h1>
<p id="st">__STATUS__</p>
<p id="err">启动超时。请稍后重新打开，或查看日志：安装目录 logs 文件夹下的 dsh-web.log</p>
<script>
(function () {
  var url = "http://127.0.0.1:__PORT__";
  var tries = 0;
  function probe() {
    var img = new Image();
    img.onload = function () { location.replace(url); };
    img.onerror = function () {
      tries++;
      if (tries > 180) {
        document.getElementById("st").style.display = "none";
        document.getElementById("err").style.display = "block";
        return;
      }
      setTimeout(probe, 500);
    };
    img.src = url + "/favicon.svg?t=" + Date.now();
  }
  probe();
})();
</script>
</body>
</html>`;
  const dir = logDir ?? path.join(installDir, "logs");
  const file = path.join(dir, "starting.html");
  try {
    fs.mkdirSync(dir, { recursive: true });
    const finalHtml = failedText ? html.replace("__PORT__", String(port)).replace("__STATUS__", "启动失败，详情见下方日志").replace("var tries = 0;", "var tries = 180;").replace(/<div class=\"spin\"><\/div>/, "").replace("</h1>", "</h1><pre style=\"font-size:11px;color:#c9c9c9;max-width:640px;white-space:pre-wrap;max-height:40vh;overflow:auto;background:rgba(0,0,0,.25);padding:12px;border-radius:8px\">" + failedText.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]) + "</pre>") : html.replace("__PORT__", String(port)).replace("__STATUS__", "首次启动需要初始化配置，约需 15~30 秒，请稍候");
    fs.writeFileSync(file, finalHtml, "utf8");
    return file;
  } catch (_) {
    return null;
  }
}

// 为内置 profile 创建指向安装目录 @deepseek-ai 包的 junction：
// 让插件解析走纯标准 Node 解析（profile/node_modules/@deepseek-ai -> 安装目录），
// 不依赖原生加载器的目录桥接（在部分设备上该桥接会失效，导致启动卡死）。
function ensureProfileJunctions(installDir) {
  if (process.platform !== "win32") return;
  const target = path.join(installDir, "app", "node_modules", "@deepseek-ai");
  if (!fs.existsSync(path.join(target, "dsh-base"))) return;
  const home = (process.env.DSH_HOME || "").trim() || path.join(require("node:os").homedir(), ".dsh");
  const junctionFor = (nmScope) => {
    const link = path.join(nmScope, "@deepseek-ai");
    try {
      fs.mkdirSync(nmScope, { recursive: true });
      const healthy = (p) =>
        fs.existsSync(path.join(p, "dsh-base", "lib", "index.js")) &&
        fs.existsSync(path.join(p, "cordis-plugin-timer", "lib", "index.js"));
      if (fs.existsSync(link)) {
        if (healthy(link)) return; // 已就绪（完整联接或完整真实目录）
        // 存在但为空壳/残缺：挪开，让标准解析走安装目录
        try { fs.renameSync(link, link + ".incomplete-" + Date.now()); }
        catch (_) { try { fs.rmSync(link, { recursive: true, force: true }); } catch (_) {} }
        log("发现残缺的插件目录，已移开并重建联接: " + nmScope);
      }
      let created = false;
      try {
        fs.symlinkSync(target, link, "junction");
        created = true;
      } catch (err1) {
        const r = spawnSync("cmd", ["/d", "/s", "/c", 'mklink /J "' + link + '" "' + target + '"'], { windowsHide: true, encoding: "utf8" });
        if (r.status !== 0) throw new Error(err1 && err1.message + " | mklink: " + (r.stderr || r.stdout || "").trim());
        created = true;
      }
      if (!healthy(link)) throw new Error("联接已建但解析不到插件包，可能被系统还原");
      log("已建立插件解析联接: " + nmScope);
    } catch (e) {
      log("警告：插件解析联接建立失败（" + nmScope + "）：" + (e && e.message));
    }
  };
  // 兜底层：.dsh/node_modules 上的联接（pnpm 只管理各 profile 内的 node_modules，不会动这一层）
  try { junctionFor(path.join(home, "node_modules")); } catch (_) {}
  for (const profile of ["web", "headless"]) {
    try { junctionFor(path.join(home, "profiles", profile, "node_modules")); } catch (_) {}
  }
}

async function main() {
  const installDir = resolveInstallDir();
  const siblingMode = fs.existsSync(path.join(installDir, "runtime", "node.exe"));
  const earlyLogDir = resolveLogDir(installDir);
  if (earlyLogDir) {
    try { logFd = fs.openSync(path.join(earlyLogDir, "dsh-web.log"), "a"); } catch (_) {}
  }
  if (siblingMode) ensureProfileJunctions(installDir);
  if (!siblingMode) {
    await ensureInstalled(installDir);
  }
  const NODE_EXE = path.join(installDir, "runtime", "node.exe");
  const BIN_JS = path.join(installDir, "app", "lib", "bin.js");
  if (!fs.existsSync(NODE_EXE) || !fs.existsSync(BIN_JS)) {
    log("错误：运行时文件缺失。安装版请通过安装包重新安装；绿色版请删除 " + installDir + " 后重新运行。");
    process.exit(2);
  }
  const env = buildEnv(installDir);
  if (ARGS.length > 0) {
    const child = spawn(NODE_EXE, [BIN_JS, ...ARGS], { stdio: "inherit", env });
    child.on("exit", (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
    child.on("error", (err) => { log("启动失败：" + err.message); process.exit(1); });
    return;
  }
  // GUI 模式
  const logDir = resolveLogDir(installDir);
  const lockPath = path.join(logDir ?? installDir, "launch.lock");
  const readLock = () => {
    try { return JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch (_) { return null; }
  };
  const writeLock = (port, pid) => {
    try { fs.writeFileSync(lockPath, JSON.stringify({ port, pid: pid ?? 0, time: Date.now() }), { flag: "wx" }); return true; } catch (_) { return false; }
  };
  const lockAlive = (lock) => {
    if (!lock || typeof lock.pid !== "number" || lock.pid <= 0) return Date.now() - (lock.time ?? 0) < 30000;
    try { process.kill(lock.pid, 0); return true; } catch (_) { return false; }
  };

  // 1) 已有实例：直接打开
  const existing = await findServingPort(BASE_PORT);
  if (existing !== null) {
    log("DeepSeek Harness 已在运行：http://127.0.0.1:" + existing);
    openBrowser("http://127.0.0.1:" + existing);
    process.exit(0);
  }

  // 2) 另一个启动器正在引导：等待其端口就绪（避免慢启动期间重复开服）
  const booting = readLock();
  if (booting && typeof booting.port === "number" && lockAlive(booting)) {
    log("检测到正在进行的启动，等待其就绪（端口 " + booting.port + "）…");
    for (let i = 0; i < 60; i++) {
      if (!lockAlive(booting) && !(await tcpConnect(booting.port))) break; // 进程已死且端口未监听 -> 陈旧锁
      const r = await httpGet("http://127.0.0.1:" + booting.port + "/", 1500);
      if (r.ok) {
        openBrowser("http://127.0.0.1:" + booting.port);
        process.exit(0);
      }
      await sleep(1000);
    }
    log("此前的启动已失效，清理并重新启动。");
    try { fs.rmSync(lockPath, { force: true }); } catch (_) {}
  }

  // 3) 自己启动
  const port = await findFreePort(BASE_PORT);
  if (port === null) { log("错误：找不到可用端口（从 " + BASE_PORT + " 起）。"); process.exit(1); }
  let out = "ignore";
  if (logDir) {
    try { out = fs.openSync(path.join(logDir, "dsh-web.log"), "a"); if (typeof out === "number") logFd = out; } catch (_) {}
  }
  writeLock(port, -1);
  const child = spawn(NODE_EXE, [BIN_JS, "web", "--host", "127.0.0.1", "--port", String(port)], {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
    env,
    cwd: installDir,
  });
  child.unref();
  if (child.pid > 0) {
    try { fs.writeFileSync(lockPath, JSON.stringify({ port, pid: child.pid, time: Date.now() }), "utf8"); } catch (_) {}
  }
  const url = "http://127.0.0.1:" + port;

  // 4) 快速失败检测：服务在数秒内退出说明启动失败，改为错误页并附日志
  let failedText = null;
  for (let i = 0; i < 6; i++) {
    await sleep(500);
    if (child.exitCode !== null) {
      try { fs.rmSync(lockPath, { force: true }); } catch (_) {}
      try {
        const logFile = path.join(logDir ?? path.join(installDir, "logs"), "dsh-web.log");
        const tail = fs.readFileSync(logFile, "utf8").split(/\r?\n/).slice(-25).join("\n");
        failedText = tail || "（无日志）";
      } catch (_) {
        failedText = "（无日志）";
      }
      break;
    }
  }

  // 5) 立即打开浏览器：正常显示"正在启动"占位页；失败显示错误页
  const splashPath = writeSplash(logDir, installDir, port, failedText);
  openBrowser(splashPath ? fileUrlOf(splashPath) : url);
  log("DeepSeek Harness 正在启动：" + url);
  process.exit(0);
}

main().catch((e) => { log("启动器错误：" + (e && e.message)); process.exit(1); });