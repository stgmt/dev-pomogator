# User Stories

- Как developer, я хочу запускать Windows 11 в Docker container через dockur/windows, чтобы тестировать dev-pomogator install/uninstall на чистой Windows без ручной настройки Hyper-V VM
- Как developer, я хочу хранить fixture-snapshots физически на `D:\fixtures\`, чтобы не потерять их при `docker compose down -v`
- Как developer, я хочу иметь несколько named fixtures (baseline-clean, after-install, broken-state), чтобы быстро переключаться между test states через `docker-fixture.ps1`
- Как developer, я хочу oem/install.bat для автоматической установки Node + Git + Claude Code при первом boot, чтобы не делать post-install руками
- Как AI agent, я хочу access к VM через RDP (:3389) и noVNC (:8006), чтобы оркестрировать test scenarios и визуально верифицировать GUI
