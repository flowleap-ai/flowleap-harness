/*---------------------------------------------------------------------------------------------
 *  Ambient shim for the `mupdf` package.
 *
 *  mupdf only exposes its entry via the package "exports" map (no "main"), which the project's
 *  classic `moduleResolution: "node"` setting cannot read. Node resolves the bare `mupdf` import
 *  correctly at runtime; this shim just points TypeScript at the bundled declarations so the
 *  bare import type-checks without changing project-wide module resolution.
 *--------------------------------------------------------------------------------------------*/

declare module 'mupdf' {
	export * from 'mupdf/dist/mupdf.js';
}
