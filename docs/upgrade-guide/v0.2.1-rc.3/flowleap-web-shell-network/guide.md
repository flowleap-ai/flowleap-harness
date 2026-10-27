---
kind: upgrade-guide
description: "Confined `bash` commands of the `flowleap-web` profile lose IP network access."
---

# `flowleap-web` confines `bash` commands without network

## Change

Before, a confined `bash` command of the `flowleap-web` profile could open any network connection. Now the profile sets `network: deny` on the `sandbox` row (`@deepseek-ai/dsh-sandbox-local`): a confined command gets no IP network, loopback included. A `curl`, `pip install`, or `git clone` inside a confined command fails at its socket call. Unix sockets keep working. Web access goes through the web search and page fetch tools, and a `danger-full-access` run, which needs approval, keeps the network. Other profiles keep the `inherit` default.

The runtime image (`deploy/Dockerfile`) now also carries the static `landlock-run` launcher, so `bash` calls in the container run confined instead of failing with `SANDBOX_UNAVAILABLE`.

## Migration

1. If a deployment of `flowleap-web` needs network access in confined commands, add a `--patch` overlay with this row:

   ```yaml
   - id: sandbox
     config:
       network: inherit
   ```

2. Do not add `seccomp=unconfined`, `apparmor=unconfined`, or `--privileged` to the runtime container; the Landlock launcher and its network filter need none of them.
3. Confirm with a `bash` call such as `curl -sS https://example.com`: under `deny` it fails with a connection error and no approval card appears, and under `inherit` it succeeds.
