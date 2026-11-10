---
kind: upgrade-guide
description: "The ui-flowleap-folder setting maxRegisterRows is gone: findSampleRows (at most 2,000) sets the register sample of Add client, and findNameLimit sets how many names it counts."
---

# Add client uses `findSampleRows` and `findNameLimit`

## Change

Before this release, `maxRegisterRows` of the `ui-flowleap-folder` plugin (1 to 10,000, default 500) capped each EP Register read of Add client: the name search and the read of the group's applications. Now the firm's matters come from the firm docket, and the setting is gone. `findSampleRows` (1 to 2,000, default 500) sets the rows of the register sample that the Company step of Add client finds names in; the EPO reads no row after row 2,000 of one query. `findNameLimit` (1 to 100, default 20) sets how many names the Company step shows and counts, with one register count query for each name.

This affects each firm whose `cordis.yml`, patch or overlay sets `maxRegisterRows` for `ui-flowleap-folder`.

## Migration

1. In the `ui-flowleap-folder` config of your `cordis.yml`, patch or overlay, rename `maxRegisterRows` to `findSampleRows`. Set a value of 2,000 or less.
2. Optional: set `findNameLimit` when a firm wants fewer or more names counted than 20. Each counted name is one EP Register request on the firm's EPO account.
3. Confirm the migration: start the app and open **Add client**. The plugin loads with no config error, and the Company step shows each name with **At your firm** and **Matching EP applications**.
