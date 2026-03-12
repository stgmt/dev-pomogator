@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================
echo   Devcontainer Start
echo ============================================
echo.

:: -------------------------------------------
:: 1. Check Docker is running
:: -------------------------------------------
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Docker daemon is not running.
    echo         Start Docker Desktop and try again.
    echo.
    pause
    exit /b 1
)
echo [OK] Docker is running.

:: -------------------------------------------
:: 2. Read ports from .devcontainer\.env
:: -------------------------------------------
set "NOVNC_PORT=6080"
set "ENV_FILE=.devcontainer\.env"

if exist "%ENV_FILE%" (
    echo [OK] Found %ENV_FILE%, reading ports...
    for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
        set "LINE=%%A"
        :: Skip comments and empty lines
        if not "!LINE:~0,1!"=="#" (
            if "%%A"=="HOST_NOVNC_PORT" set "NOVNC_PORT=%%B"
        )
    )
) else (
    echo [--] No %ENV_FILE% found, using default port %NOVNC_PORT%.
)

echo [OK] noVNC port: %NOVNC_PORT%
echo.

:: -------------------------------------------
:: 3. Build and start containers
:: -------------------------------------------
echo Starting containers...
echo.

set "COMPOSE_FILE=.devcontainer\docker-compose.yml"

if exist "%ENV_FILE%" (
    docker compose -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" up -d --build
) else (
    docker compose -f "%COMPOSE_FILE%" up -d --build
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start containers.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Containers started.

:: -------------------------------------------
:: 4. Wait for healthcheck (up to 30s)
:: -------------------------------------------
echo Waiting for healthcheck...

set "MAX_WAIT=30"
set "WAITED=0"
set "HEALTHY=0"

:healthloop
if %WAITED% geq %MAX_WAIT% goto :healthdone

:: Get health status from docker compose ps
for /f "tokens=*" %%H in ('docker compose -f "%COMPOSE_FILE%" ps --format "{{.Health}}" 2^>nul') do (
    if "%%H"=="healthy" (
        set "HEALTHY=1"
        goto :healthdone
    )
)

timeout /t 2 /nobreak >nul
set /a WAITED+=2
echo   ... waited %WAITED%s / %MAX_WAIT%s
goto :healthloop

:healthdone
echo.
if %HEALTHY%==1 (
    echo [OK] Healthcheck: healthy
) else (
    echo [!!] Healthcheck did not pass within %MAX_WAIT%s.
    echo      Container is running but services may still be starting.
)

:: -------------------------------------------
:: 5. Open noVNC in default browser
:: -------------------------------------------
echo.
echo Opening noVNC in browser: http://localhost:%NOVNC_PORT%
start http://localhost:%NOVNC_PORT%

:: -------------------------------------------
:: 6. Show helpful commands
:: -------------------------------------------
echo.
echo ============================================
echo   Container is ready!
echo ============================================
echo.
echo Useful commands:
echo   docker compose -f %COMPOSE_FILE% exec app bash        # shell into container
echo   docker compose -f %COMPOSE_FILE% exec app claude      # run Claude Code
echo   docker compose -f %COMPOSE_FILE% logs -f              # follow logs
echo   docker compose -f %COMPOSE_FILE% ps                   # check status
echo   stop.bat                                              # stop container
echo.
echo noVNC: http://localhost:%NOVNC_PORT%
echo.

pause
