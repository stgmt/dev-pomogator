@echo off
chcp 65001 >nul 2>&1

echo ============================================
echo   Devcontainer Stop
echo ============================================
echo.

set "COMPOSE_FILE=.devcontainer\docker-compose.yml"

echo Stopping containers...
echo.

docker compose -f "%COMPOSE_FILE%" down --remove-orphans

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to stop containers.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Containers stopped and removed.
echo.

pause
