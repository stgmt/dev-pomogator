@echo off
REM Fixture F-10 (Windows): Docker probe mock — always fails.
echo Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running? 1>&2
exit /b 1
