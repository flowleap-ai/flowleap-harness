---
kind: upgrade-guide
description: "The firm image switches on the two office rows, which need a working sandbox with network deny and a templates mount."
---

# The firm image switches on the office tools

## Change

Before this release, the firm image (`deploy/Dockerfile`) had no OfficeCLI binary, and the `flowleap-office-officecli` and `flowleap-office` rows of `dsh-flowleap-web` stayed off. Now the image holds OfficeCLI 1.0.160 and applies its own overlay `/opt/flowleap/patches/office.patch.yml` through the new `IMAGE_PATCH_FILES` variable, before `PATCH_FILES`. The overlay switches on both rows and sets the `sandbox` row to `network: deny`. At load the provider row runs OfficeCLI and a network probe through `ctx.sandbox`; it fails when the host has no sandbox backend or when a confined process reaches the network. Each firm that runs the image gets the five office tools, or a failed office row in the log.

## Migration

1. Make a templates folder beside the compose file and mount it read-only at `/opt/flowleap/templates` in each harness service, as [`deploy/docker-compose.yml`](../../../../deploy/docker-compose.yml) does: `./templates:/opt/flowleap/templates:ro`. An empty folder is valid.
2. Run the host on a Linux kernel with Landlock (or with bubblewrap usable in the container). Docker Desktop's kernel has no Landlock, so the office row fails there.
3. If a firm overlay in `PATCH_FILES` sets the `sandbox` row to `network: inherit`, remove that setting; the office row fails with it.
4. Start the container and confirm that no office row is listed under `dsh: warning: … entries did not activate`: `docker compose logs harness-alice | grep '^flowleap-office'` prints nothing.
