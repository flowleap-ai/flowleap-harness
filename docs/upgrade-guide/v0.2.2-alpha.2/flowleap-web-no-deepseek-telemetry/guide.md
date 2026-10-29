---
kind: upgrade-guide
description: "The flowleap-web profile turns off and locks the Session-log telemetry and the product analytics rows; DSH_TELEMETRY_MODE and DSH_TELEMETRY_OTLP_URL have no effect in it."
---
# flowleap-web telemetry off

## Change

The `flowleap-web` profile disables the rows `session-telemetry-otel`, `desktop-product-telemetry`, and `product-analytics`, and its bundle locks them (`dsh.bundle.lockedRows`). Before, `session-telemetry-otel` sent part of the Session log to `https://dsh-otel-collector.deepseeksvc.com/v1/logs` after a feedback click unless `DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_DISABLED`, or `DSH_TELEMETRY_OTLP_URL` said otherwise. Now no telemetry leaves the process, and these variables have no effect in this profile. A profile or home `cordis.patch.yml` row that names one of these rows is dropped at load with a warning.

## Migration

1. In the release image, change nothing: the image already set `DSH_TELEMETRY_MODE=DISABLED`, and you can remove that variable.
2. If you sent feedback telemetry to your own collector through `DSH_TELEMETRY_OTLP_URL`, restate the `session-telemetry-otel` row with `disabled: false` and its full config in a firm overlay (`--patch`), which is not a user patch.
3. Remove `session-telemetry-otel`, `desktop-product-telemetry`, and `product-analytics` rows from a profile or home `cordis.patch.yml`, so the startup output has no locked-row warning.
