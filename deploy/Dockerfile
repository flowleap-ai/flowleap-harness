# syntax=docker/dockerfile:1.7
# FlowLeap Patent AI harness: one image, one container per attorney.
#
#   docker build -f deploy/Dockerfile -t flowleap-harness:dev \
#     --build-arg HARNESS_COMMIT=$(git rev-parse --short=12 HEAD) .
#
# Stages: `builder` installs and builds the whole repository, then deploys the
# production closure of the `dsh` CLI (apps/cli) to /opt/harness; `skills`
# fetches the FlowLeap skill pack; `runtime` is the slim image that runs
# `dsh --profile flowleap-web` with DSH_HOME=/data. Every base image and
# download is pinned by version; nothing says `latest`.
#
# Skill pack: by default the `skills` stage fetches flowleap-ai/flowleap-plugins
# at FLOWLEAP_PLUGINS_REF, a branch or a full commit SHA. A branch name does not
# change when the branch moves, so Buildx can reuse an old fetch from its cache;
# a release passes the commit SHA (flowleap-os release.sh resolves `main`), which
# also goes into BUILD_INFO.json. To vendor a local checkout instead, override the
# stage with a named build context whose root is the skills directory:
#   --build-context skills=../flowleap-plugins/plugins/flowleap/skills

# Debian trixie (glibc 2.41): the FlowLeap CLI's Linux aarch64 release binary
# needs glibc 2.39, which bookworm (2.36) does not have.
ARG NODE_IMAGE=node:26.4.0-trixie
ARG NODE_RUNTIME_IMAGE=node:26.4.0-trixie-slim
ARG GIT_IMAGE=alpine/git:v2.49.1
ARG PNPM_VERSION=11.28.5
ARG FLOWLEAP_CLI_VERSION=v0.12.2
ARG FLOWLEAP_PLUGINS_REF=main

# ── skill pack ───────────────────────────────────────────────────────────────
FROM ${GIT_IMAGE} AS skills-git
ARG FLOWLEAP_PLUGINS_REF
RUN git init -q /repo \
  && git -C /repo fetch -q --depth 1 https://github.com/flowleap-ai/flowleap-plugins.git "${FLOWLEAP_PLUGINS_REF}" \
  && git -C /repo checkout -q FETCH_HEAD \
  && rm -rf /repo/.git

FROM scratch AS skills
COPY --from=skills-git /repo/plugins/flowleap/skills /

# ── builder ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
ARG PNPM_VERSION
# The source commit, 7 to 40 hex digits: the build context carries no .git, so
# the client build metadata reads it from DSH_CLIENT_COMMIT_HASH instead.
ARG HARNESS_COMMIT=0000000
ARG HARNESS_BUILD_DATE=unknown
ARG FLOWLEAP_CLI_VERSION
ARG FLOWLEAP_PLUGINS_REF
# CI=true makes the repository's lefthook postinstall a no-op (no git hooks in an image).
ENV CI=true \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_OPTIONS=--max-old-space-size=6144
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ musl-tools \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /src
COPY . .
RUN --mount=type=cache,id=flowleap-harness-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile
RUN DSH_CLIENT_COMMIT_HASH="${HARNESS_COMMIT}" pnpm run build
# The shell sandbox: `pnpm run build` builds only the Node-API addon, so build
# every system binary of this platform here, the static `landlock-run`
# launcher included (it needs musl-gcc). Without it, the runtime has no
# sandbox backend and every confined `bash` call fails closed.
RUN pnpm exec tsx native/system/scripts/build.ts
# The doctor as one bundled module (js-yaml inlined), built while the development
# dependencies (tsdown) are still installed: the production deploy below prunes them.
RUN node_modules/.bin/tsdown scripts/flowleap/doctor.ts --no-config --no-dts --format esm --platform node --target node26 \
       --out-dir /opt/support \
  && test -f /opt/support/doctor.mjs
# Production closure of the CLI: the same dependency-only deploy root the
# single-executable build uses (python/sdk-runtime lists every workspace peer the
# plugin graph needs, checked by verify-runtime-closure), then the direct
# dependencies pnpm's legacy hoister leaves beside the source (the repair
# scripts/executable-packaging.ts applies). The dsh entry point ends up at
# /opt/harness/node_modules/@deepseek-ai/dsh/lib/bin.js.
RUN pnpm --filter dsh-python-runtime-closure deploy --legacy --prod /opt/harness \
  && node deploy/restore-legacy-hoists.mjs /opt/harness /src/python/sdk-runtime/node_modules \
  && rm -f /opt/harness/README.md
# Support tooling inside the image: the doctor, the vendored-library pin it
# reports, and the build identity.
RUN mkdir -p /opt/harness/flowleap \
  && mv /opt/support/doctor.mjs /opt/harness/flowleap/doctor.mjs \
  && cp vendor/flowleap-connectors/SYNC.json /opt/harness/flowleap/SYNC.json \
  && node -e ' \
       const version = require("/opt/harness/node_modules/@deepseek-ai/dsh/package.json").version; \
       require("node:fs").writeFileSync("/opt/harness/BUILD_INFO.json", JSON.stringify({ \
         version, commit: process.argv[1], builtAt: process.argv[2], flowleapCli: process.argv[3], pluginsRef: process.argv[4], \
       }, null, 2) + "\n")' "${HARNESS_COMMIT}" "${HARNESS_BUILD_DATE}" "${FLOWLEAP_CLI_VERSION}" "${FLOWLEAP_PLUGINS_REF}"
# Smoke test of the deployed closure: the profile must compose without the source tree.
RUN DSH_HOME=/tmp/smoke-home HOME=/tmp/smoke-user FLOWLEAP_SKILLS_DIR=/tmp/no-skills \
    node /opt/harness/node_modules/@deepseek-ai/dsh/lib/bin.js --profile flowleap-web --dump-config > /dev/null \
  && node /opt/harness/node_modules/@deepseek-ai/dsh/lib/bin.js --version

# ── runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_RUNTIME_IMAGE} AS runtime
ARG FLOWLEAP_CLI_VERSION
ARG TARGETARCH
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git tini \
  && rm -rf /var/lib/apt/lists/*
# The FlowLeap CLI: the MCP server for the paid tools, verified against the release checksums.
RUN set -eu; \
  case "${TARGETARCH}" in \
    amd64) asset=flowleap-linux-x86_64-musl ;; \
    arm64) asset=flowleap-linux-aarch64 ;; \
    *) echo "unsupported TARGETARCH ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  base="https://github.com/flowleap-ai/flowleap-cli/releases/download/${FLOWLEAP_CLI_VERSION}"; \
  curl -fsSL -o /usr/local/bin/flowleap "${base}/${asset}"; \
  curl -fsSL -o /tmp/checksums.txt "${base}/checksums.txt"; \
  expected=$(awk -v name="${asset}/${asset}" '$2 == name { print $1 }' /tmp/checksums.txt); \
  [ -n "${expected}" ] || { echo "no checksum for ${asset}" >&2; exit 1; }; \
  echo "${expected}  /usr/local/bin/flowleap" | sha256sum -c -; \
  chmod 0755 /usr/local/bin/flowleap; rm -f /tmp/checksums.txt; \
  /usr/local/bin/flowleap --version
RUN groupadd --system --gid 10001 harness \
  && useradd --system --uid 10001 --gid harness --home-dir /data/home --shell /bin/bash harness \
  && mkdir -p /data/home && chown -R harness:harness /data
COPY --from=builder /opt/harness /opt/harness
COPY --from=skills / /opt/flowleap/skills
COPY --chmod=0755 deploy/entrypoint.sh /usr/local/bin/harness-entrypoint
COPY --chmod=0755 deploy/healthcheck.sh /usr/local/bin/harness-healthcheck
COPY --chmod=0755 deploy/doctor.sh /usr/local/bin/harness-doctor
ENV DSH_HOME=/data \
    HOME=/data/home \
    HARNESS_ROOT=/opt/harness \
    DSH_BIN=/opt/harness/node_modules/@deepseek-ai/dsh/lib/bin.js \
    FLOWLEAP_SKILLS_DIR=/opt/flowleap/skills \
    DSH_TELEMETRY_MODE=DISABLED \
    NODE_ENV=production \
    PORT=3080 \
    BIND_HOST=loopback
# Boot smoke test with the source tree gone: the profile must start and print
# its URL line from the deployed closure alone (the builder's --dump-config
# check loads no plugin code).
RUN set -eu; \
  DSH_HOME=/tmp/smoke HOME=/tmp/smoke/home PUBLIC_URL=http://localhost:3080/ TRUSTED_HOST=localhost \
    harness-entrypoint > /tmp/boot.log 2>&1 & pid=$!; \
  for _ in $(seq 1 90); do grep -q 'dsh web:' /tmp/boot.log && break; sleep 1; done; \
  kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; \
  grep -q 'dsh web:' /tmp/boot.log || { cat /tmp/boot.log; exit 1; }; \
  rm -rf /tmp/smoke /tmp/boot.log /tmp/harness-bind-host
VOLUME ["/data"]
EXPOSE 3080
USER harness
WORKDIR /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["harness-healthcheck"]
ENTRYPOINT ["tini", "--", "harness-entrypoint"]
