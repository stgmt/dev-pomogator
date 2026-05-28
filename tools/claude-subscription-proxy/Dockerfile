# Custom Dockerfile for Meridian on Linux Alpine.
#
# Issue solved here that upstream Dockerfile doesn't:
# `@anthropic-ai/claude-code` ships a Windows .exe placeholder; the real
# native binary comes from a platform-specific package (linux-x64-musl
# for Alpine). Postinstall must run in an environment whose libc matches
# the runtime image — running it in the bun build stage (glibc Debian)
# detects `linux-x64` (not -musl) and silently does nothing useful.
#
# Fix: run platform install in the runtime stage (Alpine/musl) where
# install.cjs correctly detects the target.

# ---- Build stage: bun build only ----
FROM oven/bun:1 AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ARG MERIDIAN_REF=main
RUN git clone --depth=1 --branch ${MERIDIAN_REF} https://github.com/rynfar/meridian.git /app

RUN --mount=type=cache,target=/root/.bun bun install

# Build (skip postbuild's `node --check` — bun image lacks node)
RUN rm -rf dist && bun build bin/cli.ts src/proxy/server.ts \
    --outdir dist --target node --splitting \
    --external @anthropic-ai/claude-agent-sdk --external libsql \
    --entry-naming '[name].js'

# ---- Runtime stage: Alpine/musl, install platform binary HERE ----
FROM node:22-alpine
RUN deluser --remove-home node 2>/dev/null; \
    adduser -D -u 1000 claude \
    && mkdir -p /home/claude/.claude \
    && chown -R claude:claude /home/claude

WORKDIR /app

# Copy build artifacts as root (for install.cjs)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/bin ./bin

# === FIX: install platform-specific musl binary IN ALPINE so install.cjs
# detects musl correctly (process.report.glibcVersionRuntime is undefined
# on Alpine, which is the install.cjs detection signal for musl).
RUN cd /app && \
    npm install --no-save @anthropic-ai/claude-code-linux-x64-musl@$(node -e "console.log(require('./node_modules/@anthropic-ai/claude-code/package.json').version)") && \
    node node_modules/@anthropic-ai/claude-code/install.cjs && \
    chmod +x node_modules/@anthropic-ai/claude-code/bin/claude.exe
# === END FIX ===

# Permissions for entrypoint scripts and ownership
RUN chmod +x ./bin/docker-entrypoint.sh ./bin/claude-proxy-supervisor.sh && \
    chown -R claude:claude /app

USER claude
EXPOSE 3456
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3456/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENV CLAUDE_PROXY_PASSTHROUGH=1 \
    CLAUDE_PROXY_HOST=0.0.0.0 \
    IS_SANDBOX=1
ENTRYPOINT ["./bin/docker-entrypoint.sh"]
CMD ["./bin/claude-proxy-supervisor.sh"]
