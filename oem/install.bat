@echo off
REM oem/install.bat — auto-runs inside dockur/windows container after Win 11 first boot.
REM Installs Chocolatey + Node.js LTS + Git + Claude Code.
REM Mounted via docker-compose: ./oem:/oem

set LOGFILE=C:\OEM\install.log
echo [%DATE% %TIME%] install.bat started > "%LOGFILE%"

REM 1. Install Chocolatey
echo [%DATE% %TIME%] Installing Chocolatey... >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))" >> "%LOGFILE%" 2>&1

REM 2. Install Node.js LTS + Git
echo [%DATE% %TIME%] Installing nodejs-lts + git... >> "%LOGFILE%"
C:\ProgramData\chocolatey\bin\choco.exe install nodejs-lts git -y --no-progress >> "%LOGFILE%" 2>&1

REM 3. Refresh PATH
set "PATH=C:\ProgramData\chocolatey\bin;C:\Program Files\nodejs;C:\Program Files\Git\cmd;%PATH%"

REM 4. Install Claude Code
echo [%DATE% %TIME%] Installing Claude Code... >> "%LOGFILE%"
"C:\Program Files\nodejs\npm.cmd" install -g @anthropic-ai/claude-code >> "%LOGFILE%" 2>&1

REM 5. Create sentinel flag
echo [%DATE% %TIME%] Done > C:\post-install-complete.flag
echo [%DATE% %TIME%] install.bat completed >> "%LOGFILE%"
