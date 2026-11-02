# @flowleap/connectors (vendored)

The FlowLeap patent-data office clients — EPO OPS, USPTO ODP, the academic search (Semantic Scholar, arXiv) and the Mistral OCR client — behind the `ConnectorHost` interface (ADR 0019). The source of truth is `flowleap-backend/packages/connectors`; it is not on npm, so this directory is a pinned copy the way `vendor/cordis` is, and [`@deepseek-ai/dsh-flowleap-connectors`](../../packages/host/flowleap-connectors/README.md) is the harness host that runs it in the attorney's own process with the firm's keys.

## Layout

| Path | Owner | Role |
|---|---|---|
| `src/` | upstream, verbatim | the library, with its tests and recorded fixtures; nothing in it is edited here |
| `upstream/package.json`, `upstream/tsconfig*.json` | upstream, verbatim | the backend's manifests, kept for reference and for the drift check |
| `package.json`, `tsconfig.json`, `tsdown.config.ts` | harness | the workspace manifest (`main: lib/index.js`), the strict-base build with the upstream relaxations, the bundle |
| `SYNC.json` | generated | the backend commit, the content hash, and the sync time |

## Syncing

```sh
scripts/flowleap/sync-connectors.sh            # copy from ../flowleap-backend (or $FLOWLEAP_BACKEND_DIR)
scripts/flowleap/sync-connectors.sh --check    # fail when the copy drifts from the checkout or was edited
```

The hash covers every upstream file under `src/` and the three upstream manifests. `--check` fails on an edited vendored file, on a backend checkout that differs from the copy, and on a runtime dependency the backend added without `package.json` here mirroring it. After a sync that changes the dependencies, mirror them in `package.json`, run `pnpm install`, and update the row in [`vendor/README.md`](../README.md).

## Figure rendering

`src/ops/rasterize.ts` renders a PDF drawing page with PDFium compiled to WebAssembly (`@hyzyla/pdfium`, MIT; PDFium itself BSD-3-Clause and Apache-2.0) and encodes it with `pngjs` (MIT) and `jpeg-js` (BSD-3-Clause). Every runtime dependency is permissive, so `package.json` mirrors the upstream dependencies one for one and `--check` enforces that.

## Not run here

The library's own `*.test.ts` suites and `__fixtures__` are copied for the drift check but excluded from the compilation and not part of `pnpm run test`; they run in the backend repository. The harness host's specs under `packages/host/flowleap-connectors/tests` cover the integration.
