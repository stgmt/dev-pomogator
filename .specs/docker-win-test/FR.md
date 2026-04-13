# Functional Requirements (FR)

## FR-1: Docker-based Win test VM via dockur/windows @feature1
Container-based Win 11 test environment через `docker-compose.win-test.yml`. KVM acceleration через WSL2. Auto-install + auto unattend.

## FR-2: OEM post-install automation @feature2
`oem/install.bat` auto-runs после первого Win boot. Chocolatey + Node.js LTS + Git + Claude Code.

## FR-3: Fixture management via docker-fixture.ps1 @feature3
save/restore/list actions. data.img copy between Docker volume и `D:\fixtures\`.

## FR-4: Physical fixture storage @feature4
`D:\fixtures\<name>.img` (~10 GB each). Isolated from Docker volume lifecycle.

## FR-5: GUI access via noVNC + RDP @feature5
noVNC `:8006`, RDP `:3389`.

## FR-6: Local ISO cache @feature6
Mount `./Win11.iso:/boot.iso` to skip download.

## FR-7: Integration with test catalog @feature7
Reuse `tests/hyperv-scenarios/HV*.yaml` for Docker backend.
