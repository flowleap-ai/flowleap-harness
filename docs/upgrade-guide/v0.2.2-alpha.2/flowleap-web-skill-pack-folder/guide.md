---
kind: upgrade-guide
description: "The flowleap-web skill pack row defaults to the release image's folder and fails at load when its folder does not exist."
---
# flowleap-web skill pack folder

## Change

The `flowleap-web` profile scans `FLOWLEAP_SKILLS_DIR` for the FlowLeap skill pack, else `/opt/flowleap/skills`, the folder of the release image. It no longer falls back to a developer's checkout path. The `skill-filesystem` row sets the new `requireCustomSkillDirs: true`, so a folder that does not exist fails the row at load: the startup warning names the folder, and the harness runs without FlowLeap skills.

## Migration

1. In the release image, change nothing: the image sets `FLOWLEAP_SKILLS_DIR=/opt/flowleap/skills`.
2. Outside the image, set `FLOWLEAP_SKILLS_DIR` to a flowleap-plugins checkout's `plugins/flowleap/skills` before you start `dsh --profile flowleap-web`, or to an empty folder for no FlowLeap skill.
3. Start the profile and confirm that the startup output has no `skill-filesystem` warning.
