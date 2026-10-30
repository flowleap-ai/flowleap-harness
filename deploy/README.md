# FlowLeap Patent AI on your own server

This guide is for the IT administrator of a law firm. It explains how to install the FlowLeap Patent AI harness on one Linux server, one instance per attorney, reachable only over the firm's Tailscale network, and how to work with FlowLeap support when something needs a look.

FlowLeap installs and configures the first instances with you, gives 15 days of initial support, then supports the installation on a monthly retainer. Everything in this guide is something you can do without FlowLeap.

## What you get

- One Docker image, `flowleap-harness`, built from this repository. It contains the harness (the browser application the attorney uses), the FlowLeap CLI (the connection to FlowLeap's paid patent data) and the FlowLeap skill pack (the patent research methods the agent follows).
- One container per attorney. Each has its own `/data` volume: sessions, settings, keys. Attorneys do not share a process and cannot see each other's data.
- One Tailscale sidecar per attorney. It gives the instance a name such as `https://harness-alice.tail1234.ts.net/` with a valid HTTPS certificate. Nothing listens on the server's public network interface.
- Two support tools: a doctor report and a log bundle. Both are scrubbed; they contain no keys, tokens or cookies.

## Prerequisites

| Item | Requirement |
|---|---|
| Server | Linux x86_64 or arm64, 4 CPU cores, 8 GB RAM, 40 GB disk for the image and the first instances; add about 2 GB of disk per attorney per year of sessions |
| Software | Docker Engine 24 or newer with the Compose plugin (`docker compose version` prints a version) |
| Network out | HTTPS to the model provider the firm uses (Anthropic, OpenRouter or Mistral), to the patent offices (`ops.epo.org`, `api.uspto.gov`, `api.semanticscholar.org`), to `api.mistral.ai` for OCR, to `api.flowleap.co` for paid data, and to `controlplane.tailscale.com` |
| Network in | None. Attorneys reach their instance through Tailscale |
| Tailscale | A tailnet with MagicDNS and HTTPS certificates enabled (admin console → DNS), one tag `tag:harness` in the ACL, and one reusable, pre-approved auth key for that tag |
| Keys | The firm's own keys: a model key (Anthropic, OpenRouter or Mistral), an EPO OPS consumer key and secret, a USPTO ODP key, a Mistral key for OCR, and one FlowLeap personal token (`fl_pat_…`) per attorney for the paid data. The attorney enters the first four in the browser; the FlowLeap token goes into the container once (see "First run of an attorney") |

## Install

1. Clone this repository on the server and build the image. Replace the tag with the harness version shown by `node -e "console.log(require('./package.json').version)"`.

   ```sh
   git clone <your copy of this repository> flowleap-harness
   cd flowleap-harness
   docker build -f deploy/Dockerfile -t flowleap-harness:0.2.1-rc.2 \
     --build-arg HARNESS_COMMIT="$(git rev-parse --short=12 HEAD)" \
     --build-arg HARNESS_BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" .
   ```

   The first build downloads about 2 GB of packages and takes 10 to 20 minutes on a server; a rebuild with a warm package cache takes about 4 minutes. The build needs about 6 GB of free disk while it runs; the finished image is about 950 MB. It downloads the FlowLeap CLI release pinned in `deploy/Dockerfile` (`FLOWLEAP_CLI_VERSION`) and verifies its checksum, and it fetches the skill pack from `flowleap-ai/flowleap-plugins` at `FLOWLEAP_PLUGINS_REF`, a branch or a full commit SHA. Pass a commit SHA when the pack must be the newest: with a branch name, Buildx can reuse an older fetch from its cache. The flowleap-os release passes the SHA of `main`. To build from a local copy of the skill pack instead, add `--build-context skills=/path/to/flowleap-plugins/plugins/flowleap/skills`.

2. Copy `deploy/.env.example` to `deploy/.env` and fill in `HARNESS_IMAGE` (the tag you built), `TAILNET` (your tailnet's DNS suffix) and `TS_AUTHKEY`.

3. Edit `deploy/docker-compose.yml`: keep one pair of services per attorney (the file ships `alice` and `bob` as examples), rename them to your attorneys, and list the volumes at the bottom.

4. Start everything:

   ```sh
   cd deploy
   docker compose up -d
   docker compose ps
   ```

   Each `harness-<name>` turns `healthy` within about a minute. Each `ts-<name>` registers in the Tailscale admin console as `harness-<name>`.

### What the compose file does

The compose file is the template. One attorney is two services:

```yaml
  ts-alice:
    <<: *tailscale                 # tailscale/tailscale, pinned version
    hostname: harness-alice
    container_name: ts-alice
    environment:
      <<: *tailscale-env           # TS_AUTHKEY, state dir, serve config
      TS_HOSTNAME: harness-alice   # the tailnet name
    volumes:
      - ./tailscale-serve.json:/config/serve.json:ro
      - ts-alice-state:/var/lib/tailscale

  harness-alice:
    <<: *harness                   # the flowleap-harness image, health check, log rotation
    container_name: harness-alice
    network_mode: service:ts-alice # shares the sidecar's network: listens on loopback only
    depends_on:
      - ts-alice
    environment:
      <<: *harness-env
      PUBLIC_URL: https://harness-alice.${TAILNET}/   # what browsers use
      TRUSTED_HOST: harness-alice.${TAILNET}          # what the harness accepts
    volumes:
      - harness-alice-data:/data   # sessions, settings, keys
```

`tailscale-serve.json` tells the sidecar to serve HTTPS on port 443 of its tailnet name and proxy to `http://127.0.0.1:3080`, the harness in the shared network namespace. Funnel (public exposure) is off. The harness itself is started by `deploy/entrypoint.sh` as `dsh --profile flowleap-web --no-open --port 3080 --public-url $PUBLIC_URL --trusted-host $TRUSTED_HOST`, with `DSH_HOME=/data`. To change the profile for one deployment, set `PATCH_FILES` to one or more overlay files (`dsh --patch`), separated by spaces and mounted into the container; the entrypoint passes each as `--patch <file>` before `--profile`, in order, and refuses to start when one is not a readable file. The doctor and the log bundle apply the same `PATCH_FILES`.

Two checks worth doing once per tailnet, with the first instance: open the instance in a browser and confirm the page loads and a chat turn answers (the harness checks the `Host` header of every browser request against `TRUSTED_HOST`), and run `docker exec harness-alice harness-doctor` and read the `profile row`, `key store`, and `connector` lines.

## First run of an attorney

1. Find the login URL in the container log. It carries a one-time launch token, so send it to the attorney over a channel you trust (not a group chat):

   ```sh
   docker compose logs harness-alice | grep 'dsh web:'
   ```

   The attorney opens the URL once; the browser receives a session cookie valid for 30 days and the token is no longer needed. For a new login later (new browser, expired cookie), restart the container (`docker compose restart harness-alice`) and read the new URL from the log.

2. The connector wizard opens on the first visit. The attorney (or you, over their shoulder) enters the firm's EPO OPS consumer key and secret, the USPTO ODP key, the Semantic Scholar key (optional) and the Mistral key for OCR, and presses **Test connection** on each card. These keys are stored in the credential store on the instance's `/data` volume. They can be changed later under **Settings → Patent data connectors**.

3. The model key goes in under **Settings → Models**: pick the provider (Anthropic, OpenRouter or Mistral) and paste the firm's key. Alternatively put `ANTHROPIC_API_KEY=…` (or `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`) into the file `/data/.env` of the instance; a key saved in the GUI takes precedence over the file.

4. Sign the instance in to FlowLeap for the paid data (PATSTAT statistics, enriched citations, examiner baseline, patent images, US full text). Create a personal token for the attorney on flowleap.co, then inside the container:

   ```sh
   docker exec -it harness-alice flowleap auth login --api-key fl_pat_...
   docker exec harness-alice flowleap mcp --check
   ```

   The check prints `backend ok`, `auth ok` and the tool count. The token is stored under `/data/home` on the volume and survives restarts and updates. Without it the office tools (search, bibliographic data, legal status, OCR) still work on the firm's keys; only the paid tools answer that FlowLeap sign-in is missing.

## Add an attorney

1. In `deploy/docker-compose.yml`, copy the `ts-alice` and `harness-alice` blocks, replace `alice` with the new name in every line of the copies, and add `ts-<name>-state:` and `harness-<name>-data:` under `volumes:`.
2. `docker compose up -d` starts the two new containers and leaves the others running.
3. Follow "First run of an attorney".

## Remove an attorney

1. Make a backup of the instance's data if the firm's retention policy asks for it (see "Backup").
2. `docker compose stop harness-<name> ts-<name>` and `docker compose rm harness-<name> ts-<name>`.
3. Delete the two blocks and the two volume entries from the compose file.
4. Delete the data: `docker volume rm deploy_harness-<name>-data deploy_ts-<name>-state` (the `deploy_` prefix is the compose project name; `docker volume ls` shows the exact names). This removes the attorney's sessions and every key stored in that instance.
5. Remove the node `harness-<name>` in the Tailscale admin console and revoke the attorney's FlowLeap personal token on flowleap.co.

## Update

1. Pull the new version of this repository and build the image with the new tag, exactly as in "Install" step 1.
2. Change `HARNESS_IMAGE` in `deploy/.env` to the new tag.
3. Recreate the harness containers. Data lives on the volumes and is kept.

   ```sh
   cd deploy
   docker compose pull ts-alice ts-bob    # only if the Tailscale version changed in the compose file
   docker compose up -d
   ```

   Compose recreates only the containers whose image or configuration changed. Attorneys keep their session cookie; a session that was open in a browser reconnects.
4. Run `docker exec harness-alice harness-doctor` on one instance and compare `harness version` and `harness commit` with what you built.

Keep the previous image until the new one has run for a day: `docker compose down` and `HARNESS_IMAGE=<previous tag> docker compose up -d` is the rollback.

## Backup

Everything an instance owns is in its `/data` volume:

| Path on the volume | Content |
|---|---|
| `/data/.credentials.yaml` | the credential store: the firm's office keys, the model key saved in the GUI, the cookie signing secret. Owner-only file. Treat the backup like the keys themselves |
| `/data/sessions/` | the attorney's conversations and the files the agent wrote |
| `/data/storages/` | search index and caches |
| `/data/profiles/flowleap-web/` | the attorney's settings (model choice, preset) |
| `/data/home/` | the FlowLeap CLI's own files, including the `fl_pat_` token |
| `/data/.env` | optional model keys as environment variables |

Back up a volume while the container is stopped, or accept that a running backup may miss the last seconds of a session:

```sh
docker compose stop harness-alice
docker run --rm -v deploy_harness-alice-data:/data:ro -v "$PWD":/backup debian:12-slim \
  tar -C /data -czf /backup/harness-alice-$(date -u +%Y%m%d).tar.gz .
docker compose start harness-alice
```

Restore into an empty volume with the same command and `tar -xzf` the other way round, then start the container. The Tailscale state volume (`ts-<name>-state`) needs no backup; a new one re-registers with the auth key, under the same name once you delete the old node in the admin console.

## Where keys live and what leaves the server

Keys never sit in the compose file or the image. They live in `/data/.credentials.yaml` of each instance (office keys, model key saved in the GUI, cookie secret), in `/data/home` (the FlowLeap token the CLI stores) and optionally in `/data/.env` (model keys as environment variables). A deployment that manages the keys for its attorneys, such as the firm OS, mounts one credential file read-only and names it in an overlay as the `credentials` row's `readOnlyPath` ([keys a host provides read-only](../packages/credentials/credentials-local/README.md#keys-a-host-provides-read-only)); those keys then win, the settings screens show them as read-only, and the instance's own store keeps only its own secrets. The settings screens show whether a key is set, never its value, and so do the doctor and the log bundle.

What leaves the server, and to whom:

| Traffic | Destination | Carries |
|---|---|---|
| Model calls | the provider the attorney chose: Anthropic, OpenRouter or Mistral | the conversation, the documents the attorney attached, the tool results, under the firm's model key |
| Office calls | EPO OPS, USPTO ODP, Semantic Scholar, arXiv, OpenAlex | the search queries and document numbers, under the firm's office keys |
| OCR | Mistral | the pages of the PDFs the attorney asks the agent to read, under the firm's Mistral key, billed per page by Mistral |
| Paid data | `api.flowleap.co` | the queries for PATSTAT, enriched citations, examiner baseline, images and US full text, under the attorney's FlowLeap token |
| Tailscale | the Tailscale control plane | node registration and key exchange; the attorney's traffic itself goes point to point inside the tailnet |
| Telemetry | none | `DSH_TELEMETRY_MODE=DISABLED` is set in the image |

The web search and page fetch tools of the harness are present in the profile; when the agent uses them, the query or URL goes to the search provider or the site.

### The shell sandbox

The agent's `bash` commands run confined by Landlock: a command writes only inside its workspace folder and `/tmp`, and it has no IP network, loopback included, so a command cannot send data out or call the harness itself. Web access goes through the web search and page fetch tools. A command that needs more runs unconfined only after the attorney approves it on an approval card. The image carries the `landlock-run` launcher; it needs a Linux kernel 5.13 or newer with Landlock enabled (`cat /sys/kernel/security/lsm` lists `landlock`) and Docker's default security settings. Do not add `--privileged`, `seccomp=unconfined`, or `apparmor=unconfined` to the container: Landlock and its seccomp network filter need no extra privilege, and these settings only widen what an attack can reach. On a kernel without Landlock, every confined command fails with `SANDBOX_UNAVAILABLE` and never runs unconfined by itself. The firm's own systems (DMS, docketing, Drive, SharePoint) are not connected unless you add an MCP row to the profile; FlowLeap configures those with you.

## Support

Two tools produce everything FlowLeap support needs. Both scrub their output: FlowLeap tokens, model keys, bearer headers, launch tokens, long hexadecimal and base64-looking strings are replaced by `[redacted]` markers before anything is written.

### The doctor report

```sh
docker exec harness-alice harness-doctor          # plain text
docker exec harness-alice harness-doctor --json   # the same as JSON
```

It prints the harness version and commit, Node and pnpm versions, the profile and whether each FlowLeap row is present, the credential stores the composed `credentials` row names (the read-only one first), each connector as `configured: yes (<store> store)` or `no (missing …)`, the name of each stored key with the store that supplies it (and each `*_API_KEY` name of the container environment), the FlowLeap CLI's own readiness check (`flowleap mcp --check`), the pin of the vendored connector library, the brand, and disk free on `/data`. Add `--log <file>` to append the last 50 error lines of a log you saved, or `--url https://harness-alice.<tailnet>/ --token <launch token>` to test the login exchange from where the doctor runs.

### The log bundle

From a checkout of this repository on the server:

```sh
scripts/flowleap/log-bundle.sh --container harness-alice
```

It writes `flowleap-support-harness-alice-<date>.tar.gz` in the current directory with the doctor report (text and JSON), `SYNC.json` (the connector library pin), `brand.json`, `BUILD_INFO.json`, the last 2,000 lines of the container log, the composed profile tree (`--dump-config`) with every key, token and secret value blanked, and a `MANIFEST` listing the files with sizes. The bundle never includes the credential store, the `storages/` directory, the FlowLeap CLI files or any `.env`; a `--include` or `--log` path that points at one of those is refused and named in the MANIFEST and on the console. Send the archive to support@flowleap.co with a sentence on what happened and when.

To check the scrub yourself before sending: `tar -xzf flowleap-support-*.tar.gz && grep -r fl_pat_ flowleap-support-*/` prints only `[redacted]` markers.

### Without Docker

The same two tools run in a source checkout: `pnpm run flowleap:doctor` and `pnpm run flowleap:log-bundle -- --log <file>` (the harness logs to standard output, so pass the file you captured it in).

## Running an instance without Tailscale

For a test on a workstation, or behind a reverse proxy the firm already operates, run one container with its port published and `BIND_HOST=auto`, so the harness listens on the container's own address:

```sh
docker volume create harness-test-data
docker run -d --name harness-test -p 3080:3080 \
  -e BIND_HOST=auto -e PUBLIC_URL=http://localhost:3080/ -e TRUSTED_HOST=localhost \
  -v harness-test-data:/data flowleap-harness:0.2.1-rc.2
docker logs harness-test | grep 'dsh web:'
```

Plain HTTP is for tests only: the launch token and the session cookie travel in clear. Behind a reverse proxy, follow the harness's own guide, `docs/user/guide/public-deployments.md`, which lists what the proxy must forward (the `Host` header, WebSocket upgrades, cookie scope). To terminate TLS on the harness itself, mount a certificate chain and key and set `TLS_CERT` and `TLS_KEY` to their paths inside the container.

## Files in this directory

| File | Purpose |
|---|---|
| `Dockerfile` | the multi-stage build: builder, skill pack, slim runtime |
| `Dockerfile.dockerignore` | what stays out of the build context |
| `docker-compose.yml` | the per-attorney template with the Tailscale sidecar |
| `tailscale-serve.json` | the sidecar's HTTPS-to-loopback proxy configuration |
| `.env.example` | the three variables the compose file needs |
| `entrypoint.sh` | starts the harness from the environment variables |
| `healthcheck.sh` | the container health check on the index route |
| `doctor.sh` | `harness-doctor` inside the container |
| `restore-legacy-hoists.mjs` | a build step: completes the production closure pnpm deploys |
