@echo off
REM SetupComplete.cmd — runs ONCE after Win 11 OOBE finishes (placed in
REM C:\Windows\Setup\Scripts\ by autounattend.xml's specialize pass via FirstLogonCommand).
REM
REM Triggers our 02-post-install.ps1 with admin rights, which enables RDP,
REM installs Node.js + Git + Claude Code, then writes a sentinel flag.

set LOGFILE=C:\post-install.log
echo [%DATE% %TIME%] SetupComplete.cmd started > "%LOGFILE%"

if exist C:\hyperv-test-runner\02-post-install.ps1 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\hyperv-test-runner\02-post-install.ps1 >> "%LOGFILE%" 2>&1
    echo [%DATE% %TIME%] 02-post-install.ps1 finished with exit %ERRORLEVEL% >> "%LOGFILE%"
) else (
    echo [%DATE% %TIME%] ERROR: C:\hyperv-test-runner\02-post-install.ps1 not found >> "%LOGFILE%"
)

exit /b 0
