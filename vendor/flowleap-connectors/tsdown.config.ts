import { resolve } from 'node:path'
import { defineConfig } from 'tsdown'

/**
 * The library imports `mupdf` (AGPL-3.0) for figure rasterization. The harness
 * does not install it: the bundle resolves that import to the harness-owned
 * stand-in, which throws on use (vendor/flowleap-connectors/README.md).
 */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  alias: {
    mupdf: resolve(import.meta.dirname, 'lib/types/harness/mupdf.js'),
  },
})
