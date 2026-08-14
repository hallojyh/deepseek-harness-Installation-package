"use strict";
// DeepSeek Harness 单文件启动器（SEA 编译）。
// 首次运行：把内嵌的 payload.tar.gz 解压安装到 %LOCALAPPDATA%\DeepSeekHarness
// 之后运行：直接复用安装目录。
// 行为：带参数 -> CLI 透传 node app/lib/bin.js <args...>
//       无参数 -> GUI 模式：若已有实例则打开浏览器；否则后台启动 web 服务并自动打开浏览器。
const { spawn } = require("node:child_process");
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

function log(msg) { try { process.stdout.write(msg + "\n"); } catch (_) {} }
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
async function main() {
  const installDir = resolveInstallDir();
  const siblingMode = fs.existsSync(path.join(installDir, "runtime", "node.exe"));
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
  const existing = await findServingPort(BASE_PORT);
  if (existing !== null) {
    log("DeepSeek Harness 已在运行：http://127.0.0.1:" + existing);
    openBrowser("http://127.0.0.1:" + existing);
    process.exit(0);
  }
  const port = await findFreePort(BASE_PORT);
  if (port === null) { log("错误：找不到可用端口（从 " + BASE_PORT + " 起）。"); process.exit(1); }
  let out = "ignore";
  const logDir = resolveLogDir(installDir);
  if (logDir) {
    try { out = fs.openSync(path.join(logDir, "dsh-web.log"), "a"); } catch (_) {}
  }
  const child = spawn(NODE_EXE, [BIN_JS, "web", "--host", "127.0.0.1", "--port", String(port)], {
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: true,
    env,
  });
  child.unref();
  const url = "http://127.0.0.1:" + port;
  log("正在启动 DeepSeek Harness（首次启动需初始化配置，请稍候）… " + url);
  const deadline = Date.now() + 45000;
  let up = false;
  while (Date.now() < deadline) {
    await sleep(500);
    if (child.exitCode !== null) {
      log("启动失败：服务进程提前退出，详情见 " + path.join(installDir, "logs", "dsh-web.log"));
      process.exit(1);
    }
    const res = await httpGet(url + "/", 1500);
    if (res.ok) { up = true; break; }
  }
  if (!up) { log("启动超时：详情见 " + path.join(installDir, "logs", "dsh-web.log")); process.exit(1); }
  log("DeepSeek Harness 已启动：" + url);
  openBrowser(url);
  process.exit(0);
}

main().catch((e) => { log("启动器错误：" + (e && e.message)); process.exit(1); });