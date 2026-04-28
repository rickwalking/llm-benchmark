# Sandbox image for the objective gauntlet and the judge-phase app boot.
# Untrusted candidate code (npm install postinstall scripts, the dev server,
# whatever the LLM wrote) runs inside this container. The host runs only
# orchestration (Make, judge.py, claude CLI).
#
# Pin every version. Floating tags break reproducibility for the article.

FROM node:22-bookworm-slim

# Bash tools the gauntlet uses + Chromium runtime libraries for Playwright
# and Lighthouse. Apt list is per Playwright's official browser deps doc.
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash curl jq git ca-certificates procps \
      python3 python3-yaml \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
      libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
      libatspi2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Pre-install Playwright browsers into a system path so the runtime
# `--user $(id -u)` remap doesn't lose them.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN mkdir -p /opt/ms-playwright \
    && npx -y playwright@1.49.0 install chromium \
    && chmod -R a+rx /opt/ms-playwright

# Stable symlink for Lighthouse / direct chrome callers. The glob expands
# during build because RUN executes in a shell.
RUN ln -sf $(find /opt/ms-playwright -name chrome -path '*/chrome-linux/chrome' | head -1) /usr/local/bin/chrome
ENV CHROME_PATH=/usr/local/bin/chrome

# At runtime the container runs with --user $(id -u):$(id -g) and HOME=/tmp,
# so npm's cache lives at /tmp/.npm. The host mounts ~/.npm-docker into
# /tmp/.npm to persist it across runs. No in-image user needed.

WORKDIR /work
ENTRYPOINT ["/bin/bash"]
