# docker-win-test

Win 11 в Docker через [dockur/windows](https://github.com/dockur/windows) + fixture management.

## Quick Start
```bash
docker compose -f docker-compose.win-test.yml up -d
open http://localhost:8006
.\tools\hyperv-test-runner\docker-fixture.ps1 -Action save -Name baseline-clean
.\tools\hyperv-test-runner\docker-fixture.ps1 -Action restore -Name baseline-clean
```
