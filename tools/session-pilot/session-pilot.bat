@echo off
REM Session Pilot launcher — ensure server up, open dashboard as a standalone
REM app window. Idempotent: safe to double-click anytime. Any args are ignored
REM (all logic lives in launch.ps1, single source of truth for the port).

setlocal
where pwsh.exe >nul 2>&1 && (set "PS=pwsh.exe") || (set "PS=powershell.exe")
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
endlocal
