Feature: PLUGIN012 DevContainer templates ship correctly
  The devcontainer extension ships a Docker-in-Docker + accessible-Chromium dev environment as templates
  So a worktree can spin up a working, GUI-capable, dynamically-ported container

  # Drives the REAL tools/devcontainer/ template artifacts via tests/step_definitions/feature_devcontainer.ts
  # (file existence + real content/structure assertions — the same checks the retired vitest ran, a real
  # distribution guarantee that the shipped templates are correctly structured).

  @feature1
  Scenario: PLUGIN012_01 the devcontainer ships its entrypoints, core templates, scripts and patch
    Then the devcontainer ships "postinstall.ts"
    And the devcontainer ships "launch-worktree.ps1"
    And the devcontainer ships "templates/Dockerfile"
    And the devcontainer ships "templates/docker-compose.yml"
    And the devcontainer ships "templates/devcontainer.json"
    And the devcontainer ships "templates/.dockerignore"
    And the devcontainer ships "templates/start.bat"
    And the devcontainer ships "templates/stop.bat"
    And the devcontainer ships "templates/scripts/pre-create.sh"
    And the devcontainer ships "templates/scripts/post-create.sh"
    And the devcontainer ships "templates/scripts/post-start.sh"
    And the devcontainer ships "templates/scripts/entrypoint.sh"
    And the devcontainer ships "templates/scripts/start-gui.sh"
    And the devcontainer ships "templates/scripts/oculos-wrapper.sh"
    And the devcontainer ships "templates/scripts/open-browser.sh"
    And the devcontainer ships "templates/scripts/firefox-wrapper.sh"
    And the devcontainer ships "templates/scripts/create-stealth-profile.sh"
    And the devcontainer ships "templates/scripts/save.sh"
    And the devcontainer ships "templates/scripts/restore.sh"
    And the devcontainer ships "templates/scripts/auto-snapshot.sh"
    And the devcontainer ships "templates/scripts/update-content.sh"
    And the devcontainer ships "templates/patches/oculos-atspi2-fix.patch"

  @feature2
  Scenario: PLUGIN012_02 the Dockerfile is a multi-stage rust + node build
    Then the devcontainer template "templates/Dockerfile" contains "AS rust-builder"
    And the devcontainer template "templates/Dockerfile" contains "AS node-builder"
    And the devcontainer template "templates/Dockerfile" contains "AS final"
    And the devcontainer template "templates/Dockerfile" contains "COPY --from=rust-builder"
    And the devcontainer template "templates/Dockerfile" contains "COPY --from=node-builder"

  @feature2
  Scenario: PLUGIN012_03 docker-compose declares a healthcheck and the security capabilities
    Then the devcontainer template "templates/docker-compose.yml" contains "healthcheck:"
    And the devcontainer template "templates/docker-compose.yml" contains "pgrep -f"
    And the devcontainer template "templates/docker-compose.yml" contains "Xvfb"
    And the devcontainer template "templates/docker-compose.yml" contains "SYS_ADMIN"
    And the devcontainer template "templates/docker-compose.yml" contains "NET_ADMIN"
    And the devcontainer template "templates/docker-compose.yml" contains "SYS_PTRACE"
    And the devcontainer template "templates/docker-compose.yml" contains "seccomp=unconfined"

  @feature2
  Scenario: PLUGIN012_04 devcontainer.json parses to the expected compose service and ports
    Then the devcontainer.json parses with service "app" remoteUser "vscode" and forwards port 6080

  @feature2
  Scenario: PLUGIN012_05 the start and stop batch files drive docker compose
    Then the devcontainer template "templates/start.bat" contains "docker info"
    And the devcontainer template "templates/start.bat" contains "docker compose"
    And the devcontainer template "templates/start.bat" contains "up -d --build"
    And the devcontainer template "templates/start.bat" contains "localhost"
    And the devcontainer template "templates/stop.bat" contains "docker compose"
    And the devcontainer template "templates/stop.bat" contains "down --remove-orphans"

  @feature3
  Scenario: PLUGIN012_06 templates carry parameterization placeholders and no legacy slug
    Then the devcontainer template "templates/Dockerfile" contains "{{WORKSPACE_FOLDER}}"
    And the devcontainer template "templates/docker-compose.yml" contains "{{PROJECT_NAME}}"
    And the devcontainer template "templates/devcontainer.json" contains "{{WORKSPACE_FOLDER}}"
    And no devcontainer template references the legacy "ai-pomogator-smi" slug

  @feature5
  Scenario: PLUGIN012_07 Docker-in-Docker is wired (socket mount, CLI, GID sync)
    Then the devcontainer template "templates/docker-compose.yml" contains "/var/run/docker.sock:/var/run/docker.sock"
    And the devcontainer template "templates/Dockerfile" contains "docker-ce-cli"
    And the devcontainer template "templates/Dockerfile" contains "docker-compose-plugin"
    And the devcontainer template "templates/scripts/post-start.sh" contains "docker.sock"
    And the devcontainer template "templates/scripts/post-start.sh" contains "groupadd"
    And the devcontainer template "templates/scripts/post-start.sh" contains "usermod"

  @feature6
  Scenario: PLUGIN012_08 Chromium accessibility (OculOS + AT-SPI2) is built and wired
    Then the devcontainer template "templates/Dockerfile" contains "oculos"
    And the devcontainer template "templates/Dockerfile" contains "cargo build --release"
    And the devcontainer template "templates/Dockerfile" contains "oculos-atspi2-fix.patch"
    And the devcontainer template "templates/Dockerfile" contains "at-spi2-core"
    And the devcontainer template "templates/Dockerfile" contains "libatspi2.0-0"
    And the devcontainer template "templates/scripts/start-gui.sh" contains "at-spi2-registryd"
    And the devcontainer template "templates/scripts/start-gui.sh" contains "toolkit-accessibility true"
    And the devcontainer template "templates/scripts/oculos-wrapper.sh" contains "org.a11y.Bus"
    And the devcontainer template "templates/scripts/oculos-wrapper.sh" contains "GetAddress"
    And the devcontainer template "templates/scripts/open-browser.sh" contains "--no-sandbox"
    And the devcontainer template "templates/scripts/open-browser.sh" contains "--remote-debugging-port"

  @feature7
  Scenario: PLUGIN012_09 dynamic port allocation is plumbed through compose, ps1 and start.bat
    Then the devcontainer template "templates/docker-compose.yml" contains "HOST_NOVNC_PORT"
    And the devcontainer template "templates/docker-compose.yml" contains "HOST_VNC_PORT"
    And the devcontainer template "launch-worktree.ps1" contains "Get-NextPorts"
    And the devcontainer template "launch-worktree.ps1" contains "Get-WorktreeEnvPort"
    And the devcontainer template "launch-worktree.ps1" contains "HOST_NOVNC_PORT"
    And the devcontainer template "templates/start.bat" contains ".env"
    And the devcontainer template "templates/start.bat" contains "HOST_NOVNC_PORT"
    And the devcontainer template "templates/start.bat" contains "NOVNC_PORT"
