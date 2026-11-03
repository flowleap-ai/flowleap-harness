---
kind: upgrade-guide
description: "The FlowLeap skill pack comes from flowleap-methods: the image build argument is FLOWLEAP_METHODS_REF and BUILD_INFO.json names methodsRef."
---
# FlowLeap skill pack source

## Change

The release image and the FlowLeap desktop app take the FlowLeap skill pack from the `skills/` folder of `flowleap-ai/flowleap-methods` (the 15 methods), not from `plugins/flowleap/skills` of `flowleap-ai/flowleap-plugins`. In [`deploy/Dockerfile`](../../../../deploy/Dockerfile) the build argument `FLOWLEAP_PLUGINS_REF` is now `FLOWLEAP_METHODS_REF`, and `/opt/harness/BUILD_INFO.json` names the pack commit as `methodsRef` instead of `pluginsRef`. The desktop record [`product.flowleap.json`](../../../../apps/desktop/config/product.flowleap.json) pins a flowleap-methods commit with `skills: "skills"` and `manifest: ".claude-plugin/plugin.json"`. A build that still passes `FLOWLEAP_PLUGINS_REF` gets the `main` branch of flowleap-methods, because Docker ignores an unknown build argument.

## Migration

1. In a script or CI job that builds the image, pass `--build-arg FLOWLEAP_METHODS_REF=<flowleap-methods commit>` instead of `FLOWLEAP_PLUGINS_REF`. A local pack folder is `--build-context skills=<flowleap-methods checkout>/skills`.
2. In a tool that reads `/opt/harness/BUILD_INFO.json`, read `methodsRef` instead of `pluginsRef`.
3. In a desktop product record of your own, set `skillPack.repository` to the flowleap-methods repository, `skillPack.skills` to `skills` and `skillPack.manifest` to `.claude-plugin/plugin.json`.
4. Confirm: in the built image, `/opt/flowleap/skills` holds only `recipe-*` folders, and `BUILD_INFO.json` has `methodsRef`.
