# Kane Loop, running for real on a container host.
#
# This is not a static build of the UI — it is the whole loop: the orchestrator,
# the target app under Vite (so the agent's edits are live immediately), the
# Claude Code CLI it spawns, and a real Chromium for Kane to drive. All of that
# needs a persistent process with a browser, which is why this is a container and
# not a serverless deploy.
#
# The Playwright image is the shortest path to a working Chromium: it carries the
# browser binaries and the system libraries (libgbm, libnss3, libatk-bridge2.0,
# fonts) that a plain node image does not.
FROM mcr.microsoft.com/playwright:v1.56.0-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_OPTIONS=--max-old-space-size=2048 \
    KANE_HOST=0.0.0.0 \
    KANE_TARGET_URL=http://127.0.0.1:5173

# The hooks are shell scripts: jq parses every Kane verdict, curl probes the dev
# server, and the integrity manifest needs a sha256 tool. The Playwright image
# ships none of them, and serve.sh's preflight caught that on the first boot —
# which is the whole reason that preflight exists rather than failing silently.
RUN apt-get update \
 && apt-get install -y --no-install-recommends jq curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Kane wants GOOGLE CHROME specifically, not the Chromium this image ships:
# "Google Chrome is required but was not found at /usr/bin/google-chrome".
# That is the real reason every run exited 2 — nothing to do with sandboxing.
# This is the install its own error message recommends. amd64 only, which is
# what the host runs; Google publishes no Chrome for Linux ARM.
RUN curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
 && apt-get update \
 && apt-get install -y --no-install-recommends /tmp/chrome.deb \
 && rm -f /tmp/chrome.deb \
 && rm -rf /var/lib/apt/lists/* \
 && google-chrome --version

WORKDIR /app

# The two CLIs the loop is made of. Pinned so a deployment cannot drift from the
# versions the evidence in this repo was produced with.
RUN npm install -g @testmuai/kane-cli@0.8.4 @anthropic-ai/claude-code@2.1.238

# Dependencies first, so a source-only change does not reinstall the world.
COPY server/package*.json ./server/
COPY web/package*.json ./web/
COPY target-app/package*.json ./target-app/
RUN cd server && npm ci --include=dev \
 && cd ../web && npm ci --include=dev \
 && cd ../target-app && npm ci --include=dev

COPY . .

# The UI is served by the orchestrator, so one origin serves everything.
RUN cd web && npm run build

# The demo rests on the app being broken to begin with. A container built from a
# tree where someone left the fix applied would open green and prove nothing.
RUN cp target-app/.seed/App.tsx target-app/src/App.tsx \
 && ! grep -q localStorage target-app/src/App.tsx \
 && chmod 444 tests/*_test.md

# Chromium refuses to start as root without --no-sandbox, and Kane exposes no
# flag for it. The Playwright image ships a non-root pwuser for exactly this;
# /app has to be writable by it because the agent edits files and the hooks
# write the event log beside them.
RUN chown -R pwuser:pwuser /app
USER pwuser

EXPOSE 8080
CMD ["./scripts/serve.sh"]
