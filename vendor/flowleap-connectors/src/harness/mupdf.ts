/**
 * Harness-owned stand-in for the `mupdf` package (AGPL-3.0-or-later), which
 * `src/ops/rasterize.ts` imports for figure rasterization. The harness does not
 * install mupdf: `tsconfig.base.json` maps the `mupdf` specifier here for type
 * checks and `tsdown.config.ts` aliases it here for the bundle. The types mirror
 * the members the rasterizer uses; every call throws {@link MupdfUnavailableError},
 * so a figure read fails with a clear message while every other connector call
 * is unaffected. Replacing this file with the real dependency is a licensing
 * decision recorded in vendor/flowleap-connectors/README.md.
 * @module
 */

/** Thrown when a connector reaches for mupdf inside the harness. */
export class MupdfUnavailableError extends Error {
  override readonly name = 'MupdfUnavailableError'

  constructor() {
    super('mupdf is not installed in this harness (AGPL-3.0); patent figure rasterization is unavailable. See vendor/flowleap-connectors/README.md.')
  }
}

function unavailable(): never {
  throw new MupdfUnavailableError()
}

/** A rendered page bitmap. */
export interface Pixmap {
  getWidth(): number
  getHeight(): number
  asPNG(): Uint8Array
  asJPEG(quality: number, invertCMYK: boolean): Uint8Array
  destroy(): void
}

/** One document page. */
export interface Page {
  /** `[x0, y0, x1, y1]` in points. */
  getBounds(): number[]
  toPixmap(matrix: Matrix, colorSpace: ColorSpace, alpha: boolean, showExtras: boolean): Pixmap
}

/** An opened document. */
export interface Document {
  countPages(): number
  loadPage(index: number): Page
  destroy(): void
}

/** A 2D transform. */
export type Matrix = [number, number, number, number, number, number]

/** A color space handle. */
export interface ColorSpace {
  readonly name: string
}

/** Stand-in for `mupdf.Document`: `openDocument` throws. */
export const Document = {
  openDocument(_data: Uint8Array, _mimeType: string): Document {
    return unavailable()
  },
}

/** Stand-in for `mupdf.Matrix`: `scale` throws. */
export const Matrix = {
  scale(_x: number, _y: number): Matrix {
    return unavailable()
  },
}

/** Stand-in for `mupdf.ColorSpace`: both color spaces throw on access. */
export const ColorSpace = {
  get DeviceGray(): ColorSpace {
    return unavailable()
  },
  get DeviceRGB(): ColorSpace {
    return unavailable()
  },
}
