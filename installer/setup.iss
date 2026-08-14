; ============================================================
;  DeepSeek Harness Windows 安装包脚本（Inno Setup 7）
;  产物: dist\DeepSeek-Harness-Setup.exe
; ============================================================
#define MyAppName "DeepSeek Harness"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "DeepSeek Harness Packaging"
#define MyAppURL "https://github.com/deepseek-ai/deepseek-harness"
#define MyAppExeName "DeepSeek Harness.exe"

[Setup]
AppId={{8E5A2C41-7B3D-4F9E-8C1A-2D6B7F3E9A54}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\DeepSeek Harness
DefaultGroupName=DeepSeek Harness
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=D:\DS_workplace\dist
OutputBaseFilename=DeepSeek-Harness-Setup
SetupIconFile=D:\DS_workplace\launcher-src\favicon.ico
LicenseFile=D:\DS_workplace\installer\license.rtf
UninstallDisplayIcon={app}\favicon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
CloseApplications=force
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "D:\DS_workplace\install-files\DeepSeek Harness.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\DS_workplace\launcher-src\favicon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\DS_workplace\使用说明.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "D:\DS_workplace\install-files\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "D:\DS_workplace\install-files\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "D:\DS_workplace\install-files\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\DeepSeek Harness\DeepSeek Harness"; Filename: "{app}\DeepSeek Harness.exe"; IconFilename: "{app}\favicon.ico"
Name: "{autoprograms}\DeepSeek Harness\使用说明"; Filename: "{app}\使用说明.txt"
Name: "{autoprograms}\DeepSeek Harness\卸载 DeepSeek Harness"; Filename: "{uninstallexe}"; IconFilename: "{app}\favicon.ico"
Name: "{autoprograms}\卸载 DeepSeek Harness"; Filename: "{uninstallexe}"; IconFilename: "{app}\favicon.ico"
Name: "{autodesktop}\DeepSeek Harness"; Filename: "{app}\DeepSeek Harness.exe"; IconFilename: "{app}\favicon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\DeepSeek Harness.exe"; Description: "{cm:LaunchProgram,DeepSeek Harness}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\logs"