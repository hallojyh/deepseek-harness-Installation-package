[English](README.md) | [简体中文](README.zh.md)

# DeepSeek Harness 封装版（Windows 安装包）

将开源项目 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（上游 0.1.0-rc.6，MIT 协议）封装为标准 Windows 安装包形态，开箱即用，无需安装 Node.js / npm / pnpm。

- **封装版本**：v0.1.0
- **安装包 / 绿色版 / 发布包**：均见 [Releases](https://github.com/hallojyh/deepseek-harness-Installation-package/releases) 附件
- 安装包为向导式安装（可选安装路径，含许可协议页）

## 功能特性

- 向导式安装：欢迎 -> 使用许可与免责声明（必须接受才能继续）-> 选择安装位置 -> 安装 -> 完成
- 标准卸载：开始菜单「卸载 DeepSeek Harness」或 Windows 设置 -> 应用 中卸载
- 内置 Node.js 运行时 + pnpm + 全部依赖：`dsh plugin` 插件管理开箱即用
- 双击即用：自动启动 Web GUI 并打开浏览器（http://127.0.0.1:3080，端口占用自动顺延；已有实例自动复用）
- CLI 全能力透传：`DeepSeek Harness.exe --help` / `--version` / `web --port 8080` / `--profile headless "..."`
- 官方黑鲸鱼 favicon 图标（取自上游仓库 favicon.svg 原样渲染）

## 快速开始

1. 在 [Releases](https://github.com/hallojyh/deepseek-harness-Installation-package/releases) 下载 `DeepSeek-Harness-Setup.exe` 并双击；
2. 阅读许可协议并勾选接受 -> 选择安装路径 -> 完成；
3. 自动打开浏览器进入界面，在设置中配置模型 API Key（如 DeepSeek API）。

详细说明见 [使用说明.txt](使用说明.txt)。

## 插件管理（内置 pnpm）

```
"DeepSeek Harness.exe" plugin --profile my add <插件包名>
"DeepSeek Harness.exe" plugin --profile my add .\我的本地插件目录
```

安装后插件会作为 profile 的 bundle 层自动生效。

## 完整源码

仓库包含安装包的全部可重建内容：

- `installer/` 安装脚本与许可条款；`launcher-src/` 启动器源码与图标；`build-installer.cmd` 一键重建脚本
- **`install-files.tar.gz`（87MB）**：安装目录完整树（dsh 运行时 0.1.0-rc.6 依赖树 + 内置 pnpm 11 + Node.js 24 运行时 + 前端资源），即安装包实际写入用户机器的内容

解包：`tar.exe -xzf install-files.tar.gz` 得到 `runtime/`、`app/`、`tools/` 三个目录（与构建脚本约定一致）。

上游 DeepSeek Harness 的 TypeScript 源码见 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。

## 重新构建

依赖：Windows 10/11 x64、Node.js v24+、Inno Setup 7。

```
# 1) 解包安装目录树（若本地尚无 install-files/）
tar.exe -xzf install-files.tar.gz

# 2) 一键重建
build-installer.cmd
```

产物：`dist/DeepSeek-Harness-Setup.exe`（安装包）+ `DeepSeek-Harness.exe`（绿色版）。
安装目录树也可由 `npm install @deepseek-ai/dsh@0.1.0-rc.6` 的依赖树裁剪后重新生成。

## 目录结构

```
installer/           Inno Setup 安装脚本与许可条款（setup.iss / license.txt / license.rtf）
launcher-src/        启动器源码（Node SEA：安装解压、参数透传、GUI 启动、pnpm PATH 注入）
install-files.tar.gz 安装目录完整树源码归档（runtime + app + tools）
build-installer.cmd  一键重建脚本
使用说明.txt          用户文档
```

## 免责声明

本软件为第三方封装，非 DeepSeek 官方发布；使用前请阅读安装向导中的许可协议（[installer/license.txt](installer/license.txt)）。

## 上游项目

- GitHub: https://github.com/deepseek-ai/deepseek-harness
- License: MIT