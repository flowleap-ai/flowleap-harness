# @flowleap/connectors (vendored)

The FlowLeap patent-data office clients — EPO OPS, USPTO ODP, the academic search (Semantic Scholar, arXiv) and the Mistral OCR client — behind the `ConnectorHost` interface (ADR 0019). The source of truth is `flowleap-backend/packages/connectors`; it is not on npm, so this directory is a pinned copy the way `vendor/cordis` is, and [`@deepseek-ai/dsh-flowleap-connectors`](../../packages/host/flowleap-connectors/README.md) is the harness host that runs it in the attorney's own process with the firm's keys.

## Layout

| Path | Owner | Role |
|---|---|---|
| `src/` (except `src/harness/`) | upstream, verbatim | the library, with its tests and recorded fixtures; nothing in it is edited here |
| `src/harness/mupdf.ts` | harness | stand-in for the `mupdf` dependency (see below) |
| `upstream/package.json`, `upstream/tsconfig*.json` | upstream, verbatim | the backend's manifests, kept for reference and for the drift check |
| `package.json`, `tsconfig.json`, `tsdown.config.ts` | harness | the workspace manifest (`main: lib/index.js`), the strict-base build with the upstream relaxations, the bundle |
| `SYNC.json` | generated | the backend commit, the content hash, and the sync time |

## Syncing

```sh
scripts/flowleap/sync-connectors.sh            # copy from ../flowleap-backend (or $FLOWLEAP_BACKEND_DIR)
scripts/flowleap/sync-connectors.sh --check    # fail when the copy drifts from the checkout or was edited
```

The hash covers every upstream file under `src/` and the three upstream manifests. `--check` fails on an edited vendored file, on a backend checkout that differs from the copy, and on a runtime dependency the backend added without `package.json` here mirroring it. After a sync that changes the dependencies, mirror them in `package.json`, run `pnpm install`, and update the row in [`vendor/README.md`](../README.md).

## mupdf is not installed

`src/ops/rasterize.ts` imports `mupdf` (AGPL-3.0-or-later) to rasterize patent figures. The harness is MIT and its notices gate (`gen-third-party-notices`) rejects a non-permissive runtime dependency without an owner authorization, so `mupdf` is left out of `package.json`: `tsconfig.base.json` maps the specifier to `src/harness/mupdf.ts` for type checks, `tsdown.config.ts` aliases it there for the bundle, and the upstream ambient shim `src/types/mupdf.d.ts` is excluded from the compilation. Every member of the stand-in throws `MupdfUnavailableError`, so `ops.getFigurePage*` fails with a clear message and nothing else is affected; the interim tools do not reach it. Installing the real dependency is a licensing decision for the project owner: it means an owner authorization in `scripts/gen-third-party-notices.ts`, `mupdf` back in `package.json`, and dropping the alias and the path mapping.

## Not run here

The library's own `*.test.ts` suites and `__fixtures__` are copied for the drift check but excluded from the compilation and not part of `pnpm run test`; they run in the backend repository. The harness host's specs under `packages/host/flowleap-connectors/tests` cover the integration.
