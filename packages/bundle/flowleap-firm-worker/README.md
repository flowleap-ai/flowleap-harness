---
description: "The standalone profile bundle of the FlowLeap firm worker: one row that reads the firm's MyEPO Mailbox into the Firm Record, with no model, no tool, no chat store and no listening port."
kind: "package-bundle"
---

# @deepseek-ai/dsh-flowleap-firm-worker

## Summary

`dsh-flowleap-firm-worker` is the complete Cordis tree of the `flowleap-firm-worker` profile: the firm worker of [ADR 0003](../../../flowleap/docs/adr/0003-firm-state-rule.md), in its first, small form. It mounts one row, [`flowleap-myepo-worker`](../../host/flowleap-connectors/README.md#the-firm-workers-myepo-job), which tests the firm's MyEPO pair for the Firm admin console, reads the firm's Mailbox and sends each new letter to the intake of the Firm Record. The tree does not layer over `dsh-base`: it has no model provider, no tool, no agent loop, no chat store, no Web server and no listening port.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Run the firm worker

The shipped `flowleap-firm-worker` template lists this bundle alone. The firm OS starts it from the runtime image with its own patch file, which sets the worker's folders, the Firm Record and the MyEPO endpoint:

```text
dsh --profile flowleap-firm-worker --patch worker.patch.yml
```

On flowleap-os, `install.sh` writes the patch and runs the profile as the Compose service `myepo-worker`: read-only, as its own user, with no capability and no published port, on a network that only the Firm Record shares and on its own route to the EPO. The development loop runs the same profile from source with `flowleap/dev-loop.sh up --myepo-double`.

The worker runs until SIGTERM and stops within a few seconds. `--help` prints its help and exits.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`cordis.patch.yml` holds one insert, the `flowleap-myepo-worker` row, with the folder and Firm Record defaults of a flowleap-os firm. The MyEPO endpoint defaults to the EPO's production services in the row's own `Config`; a host overrides the row's whole `config` with its patch file.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The complete tree: the one worker row |
| [`src/index.ts`](src/index.ts) | Bundle package entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [The firm worker's MyEPO job](../../host/flowleap-connectors/README.md#the-firm-workers-myepo-job) — the folders, the schedule and the link states of the row.
- [Process atlas sheet 6](../../../flowleap/docs/process-atlas/06-firm-myepo-link.md) — the firm's MyEPO link.
- [Shipped profile templates](../../util/official-bundles/src/bundles.ts) — `flowleap-firm-worker`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the profile has no model and no agent.

#### KV Cache effect

None: the profile sends no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The worker runs one firm job.** Migration step 6 of the [firm organisation design](../../../flowleap/docs/2026-11-10-firm-organisation-design.md#9-the-migration) moves the docket, the opponent index and the register watches here, splits `flowleap-connectors` into a firm half and a person half, and gives the worker its own sender kind `worker` in the Firm Record; today it sends letters with the intake token.
- **No nightly reconcile.** The worker reads the unhandled list only; the reconcile of sheet 6 is not built.
- **A single-user install has no worker.** The desktop app has no Firm Record yet (decision D5 of the firm organisation design), so its MyEPO card keeps the link in the app's own credential store.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
