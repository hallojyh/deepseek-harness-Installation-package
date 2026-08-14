@echo off
rem ============================================================
rem  DeepSeek Harness 安装包 + 绿色版 构建脚本
rem  需要: Node.js v24+、Inno Setup 7（含 ISCC.exe）、网络
rem  用法: build-installer.cmd
rem  产物:
rem    dist\DeepSeek-Harness-Setup.exe   安装包（向导式）
rem    DeepSeek-Harness.exe              绿色单文件版
rem ============================================================
setlocal
cd /d "%~dp0"
set LSRC=launcher-src
set ISCC=%LOCALAPPDATA%\Programs\Inno Setup 7\ISCC.exe
if not exist "%ISCC%" ( echo [错误] 未找到 Inno Setup 7，请先安装: https://jrsoftware.org/isdl.php & exit /b 1 )

rem 1) 打包启动器源码
echo [1/6] 打包启动器源码...
cd "%LSRC%"
call npx --yes esbuild launcher.js --bundle --platform=node --format=cjs --target=node24 --outfile=dist.cjs
if errorlevel 1 exit /b 1
cd /d "%~dp0"

rem 2) 构建安装版启动器 exe（无内嵌 payload，运行时由安装包放置）
echo [2/6] 构建安装版启动器 exe ...
cd "%LSRC%"
node --experimental-sea-config sea-config-install.json
if errorlevel 1 exit /b 1
cd /d "%~dp0"
copy /y "C:\Program Files\nodejs\node.exe" "install-files\DeepSeek Harness.exe" >nul
"%LSRC%\node_modules\rcedit\bin\rcedit-x64.exe" "install-files\DeepSeek Harness.exe" --set-icon "%LSRC%\icon.ico"
node "%LSRC%\node_modules\postject\dist\cli.js" "install-files\DeepSeek Harness.exe" NODE_SEA_BLOB "%LSRC%\sea-prep-install.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 exit /b 1

rem 3) 生成绿色版 payload（runtime + app + tools，含内置 pnpm）
echo [3/6] 生成绿色版 payload.tar.gz ...
cd install-files
tar.exe -a -cf "..\payload.tar.gz" runtime app tools
if errorlevel 1 exit /b 1
cd /d "%~dp0"

rem 4) 构建绿色版 exe（内嵌 payload）
echo [4/6] 构建绿色版 exe ...
cd "%LSRC%"
node --experimental-sea-config sea-config.json
if errorlevel 1 exit /b 1
cd /d "%~dp0"
copy /y "C:\Program Files\nodejs\node.exe" "DeepSeek-Harness.exe" >nul
"%LSRC%\node_modules\rcedit\bin\rcedit-x64.exe" "DeepSeek-Harness.exe" --set-icon "%LSRC%\icon.ico"
node "%LSRC%\node_modules\postject\dist\cli.js" "DeepSeek-Harness.exe" NODE_SEA_BLOB "%LSRC%\sea-prep.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
if errorlevel 1 exit /b 1

rem 5) 编译安装包
echo [5/6] 编译安装包（LZMA2 压缩，需要几分钟）...
"%ISCC%" "installer\setup.iss"
if errorlevel 1 exit /b 1

rem 6) 打包发布 zip
echo [6/6] 生成发布包 ...
powershell -NoProfile -Command "Compress-Archive -Path 'dist\DeepSeek-Harness-Setup.exe','DeepSeek-Harness.exe','使用说明.txt' -DestinationPath 'dist\DeepSeek-Harness-发布包.zip' -CompressionLevel Optimal -Force"

echo.
echo 构建完成:
echo   安装包: %~dp0dist\DeepSeek-Harness-Setup.exe
echo   绿色版: %~dp0DeepSeek-Harness.exe
endlocal
