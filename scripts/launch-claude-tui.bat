@echo off
REM Launch Windows Terminal with Claude Code + TUI test runner
REM Double-click this file or run from any terminal
powershell -ExecutionPolicy Bypass -File "%~dp0launch-claude-tui.ps1" %*
