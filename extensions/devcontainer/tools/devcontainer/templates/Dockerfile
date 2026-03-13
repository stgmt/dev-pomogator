# syntax=docker/dockerfile:1.7
# {{PROJECT_NAME}} DevContainer
# Claude Code CLI + GUI Desktop (Mutter + tint2 + noVNC) + Desktop Automation
#
# Multi-stage build:
#   Stage 1 (rust-builder): OculOS binary from source with AT-SPI2 patch
#   Stage 2 (node-builder): mcp-desktop-pro + playwright-core native addons
#   Stage 3 (final): Runtime image with all tools, no build deps

# ============================================================
# Stage 1: Build OculOS (AT-SPI2 accessibility MCP server)
# ============================================================
FROM rust:1.85-bookworm AS rust-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -y \
    && apt-get install -y --no-install-recommends \
        libatspi2.0-dev libdbus-1-dev pkg-config git

COPY patches/oculos-atspi2-fix.patch /tmp/oculos-atspi2-fix.patch

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cd /tmp \
    && git clone https://github.com/huseyinstif/oculos.git oculos-build \
    && cd oculos-build \
    && git checkout ce2b01e18088 \
    && git apply /tmp/oculos-atspi2-fix.patch \
    && cargo build --release \
    && cp target/release/oculos /usr/local/bin/oculos \
    && strip /usr/local/bin/oculos

# ============================================================
# Stage 2: Build native Node.js addons (mcp-desktop-pro)
# ============================================================
FROM node:22-bookworm-slim AS node-builder

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -y \
    && apt-get install -y --no-install-recommends \
        build-essential libxtst-dev libpng-dev python3

# Build as vscode-compatible user (UID 1000)
# Handle base images where UID 1000 already exists (e.g. node:22 has 'node:1000')
RUN existing_user=$(getent passwd 1000 | cut -d: -f1 || true) \
    && if [ -n "$existing_user" ] && [ "$existing_user" != "vscode" ]; then \
         usermod -l vscode -d /home/vscode -m -s /bin/bash "$existing_user"; \
         groupmod -n vscode "$(getent group 1000 | cut -d: -f1)" 2>/dev/null || true; \
       elif [ -z "$existing_user" ]; then \
         useradd -m -u 1000 -s /bin/bash vscode; \
       fi \
    && mkdir -p /home/vscode/.npm-global \
    && chown -R vscode:vscode /home/vscode/.npm-global

USER vscode
ENV NPM_CONFIG_PREFIX=/home/vscode/.npm-global
ENV PATH="/home/vscode/.npm-global/bin:${PATH}"

RUN --mount=type=cache,target=/home/vscode/.npm,uid=1000 \
    npm install -g mcp-desktop-pro playwright-core

# ============================================================
# Stage 3: Final runtime image
# ============================================================
FROM mcr.microsoft.com/devcontainers/base:bookworm AS final

SHELL ["/bin/bash", "-lc"]

# 1. Add ALL external apt repositories (Docker, NodeSource, GH CLI) — no apt-get update yet
RUN install -m 0755 -d /etc/apt/keyrings \
    # Docker
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    # Node.js 22
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
    # GitHub CLI
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list

# 2. ONE apt-get update, ONE apt-get install — ALL runtime packages
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update -y \
    && apt-get install -y --no-install-recommends \
        # System utilities
        ca-certificates curl gnupg git jq sudo \
        ripgrep fd-find fzf tmux vim \
        # Python
        python3 python3-pip python3-venv \
        # Docker CLI
        docker-ce-cli docker-compose-plugin \
        # Node.js 22
        nodejs \
        # GitHub CLI
        gh \
        # GUI stack: Mutter + tint2 + VNC + noVNC
        xvfb x11vnc xdotool scrot imagemagick \
        mutter tint2 \
        firefox-esr chromium \
        fonts-liberation fonts-dejavu-core fonts-noto-core fonts-freefont-ttf \
        dbus-x11 at-spi2-core x11-xserver-utils \
        tesseract-ocr tesseract-ocr-rus \
        python3-gi gir1.2-atspi-2.0 \
        net-tools netcat-openbsd novnc \
        # OculOS runtime deps (no -dev headers — binary is pre-built)
        libatspi2.0-0 libdbus-1-3 \
        # mcp-desktop-pro runtime deps (no -dev headers — native addon is pre-built)
        libxtst6 libpng16-16 \
        # Clipboard for browser automation
        xclip \
        # Real-ESRGAN dependency
        libomp5 \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/* \
    # Docker group + sudo
    && ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null || true \
    && groupadd -f docker \
    && usermod -aG docker vscode \
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/vscode \
    && chmod 0440 /etc/sudoers.d/vscode \
    # Node.js global config
    && corepack enable || true \
    && mkdir -p /home/vscode/.npm-global \
    && chown -R vscode:vscode /home/vscode/.npm-global \
    && npm config set prefix /home/vscode/.npm-global -g

# 3. Copy pre-built binaries from builder stages
COPY --from=rust-builder /usr/local/bin/oculos /home/vscode/.cargo/bin/oculos
RUN mkdir -p /home/vscode/.cargo/bin && chown -R vscode:vscode /home/vscode/.cargo

COPY --from=node-builder /home/vscode/.npm-global /home/vscode/.npm-global
RUN chown -R vscode:vscode /home/vscode/.npm-global

# 4. Claude Code CLI (native installer, as vscode user)
USER vscode
RUN for i in 1 2 3; do curl -fsSL https://claude.ai/install.sh | bash && break || sleep 5; done
USER root

# Verify toolchain (non-fatal)
RUN node -v && npm -v && python3 --version && claude --version && gh --version || true

# 5. Firefox wrapper: stealth profile by default
RUN mv /usr/bin/firefox-esr /usr/bin/firefox-esr.real \
    && ln -s {{WORKSPACE_FOLDER}}/.devcontainer/scripts/firefox-wrapper.sh /usr/local/bin/firefox-esr \
    && ln -s {{WORKSPACE_FOLDER}}/.devcontainer/scripts/firefox-wrapper.sh /usr/local/bin/firefox

# 6. curl-impersonate (Chrome TLS fingerprint for HTTP requests)
RUN cd /tmp \
    && curl -sLO "https://github.com/lwthiker/curl-impersonate/releases/download/v0.6.1/curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz" \
    && tar xzf curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz -C /usr/local/bin/ \
    && rm -f curl-impersonate-v0.6.1.x86_64-linux-gnu.tar.gz \
    && chmod +x /usr/local/bin/curl_chrome* /usr/local/bin/curl_ff* /usr/local/bin/curl_safari* /usr/local/bin/curl_edge* 2>/dev/null || true

# 7. D-Bus runtime directory for vscode user
RUN mkdir -p /run/user/1000 && chown vscode:vscode /run/user/1000 && chmod 700 /run/user/1000

# 8. Telegram MCP server
RUN git clone --depth 1 https://github.com/chigwell/telegram-mcp.git /opt/telegram-mcp \
    && pip3 install --break-system-packages -r /opt/telegram-mcp/requirements.txt \
    && chown -R vscode:vscode /opt/telegram-mcp \
    && rm -rf /root/.cache/pip

# 9. Image processing: Real-ESRGAN AI upscale (realesrgan-ncnn-py)
RUN pip3 install --break-system-packages realesrgan-ncnn-py \
    && rm -rf /root/.cache/pip

# 10. Entrypoint: starts GUI stack in background before CMD
COPY scripts/entrypoint.sh /usr/local/bin/devcontainer-entrypoint.sh
RUN tr -d '\r' < /usr/local/bin/devcontainer-entrypoint.sh > /tmp/ep.sh \
    && mv /tmp/ep.sh /usr/local/bin/devcontainer-entrypoint.sh \
    && chmod +x /usr/local/bin/devcontainer-entrypoint.sh

# GUI environment
ENV DISPLAY_NUM=1
ENV DISPLAY=:1
ENV WIDTH=1280
ENV HEIGHT=800

# Container environment
ENV DEVCONTAINER=true
ENV CLAUDE_CONFIG_DIR=/home/vscode/.claude
ENV PATH="/home/vscode/.cargo/bin:/home/vscode/.local/bin:/home/vscode/.npm-global/bin:${PATH}"

WORKDIR {{WORKSPACE_FOLDER}}

CMD ["/usr/local/bin/devcontainer-entrypoint.sh", "sleep", "infinity"]
