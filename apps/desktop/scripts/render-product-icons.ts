/**
 * Render a product's application icons from one monochrome mark.
 *
 * The mark (a black SVG such as `packages/bundle/flowleap-web/brand/flowleap-mark.svg`)
 * is centred on a white rounded tile at the geometry the upstream icons use: the
 * Windows tile fills the 1024-pixel canvas; the macOS tile is inset to the
 * legacy ICNS proportions (the rounded square covers about 80 % of the canvas).
 * Output, in the product's icon directory: `icon-macos.svg`, `icon-macos.png`,
 * `icon-windows.svg`, `icon-windows.png` (1024 × 1024 RGBA) and
 * `tray-windows.ico`, packed by the tray renderer from the Windows source.
 *
 * Usage: `pnpm run render:product-icons -- --mark <mark.svg> --out <directory>`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { packIco, renderTrayIconEntries } from './render-tray-icon.ts'

/** Canvas edge of every rendered icon source and PNG. */
export const ICON_EDGE = 1024

/** Tile geometry of one platform icon. */
export interface IconTile {
  /** Tile edge in canvas units. */
  readonly size: number
  /** Corner radius in canvas units. */
  readonly radius: number
  /** Fraction of the tile edge the mark spans. */
  readonly markScale: number
}

/** Upstream geometry: the full tile the Windows icon uses, and the inset macOS tile. */
export const ICON_TILES = {
  windows: { size: 1024, radius: 230, markScale: 0.56 },
  macos: { size: 824, radius: 185, markScale: 0.56 },
} as const satisfies Record<string, IconTile>

function markViewBox(source: string): { x: number; y: number; width: number; height: number } {
  const match = /viewBox="(?<x>-?[\d.]+)\s+(?<y>-?[\d.]+)\s+(?<width>[\d.]+)\s+(?<height>[\d.]+)"/u.exec(source)
  if (match?.groups === undefined) throw new Error('product icons: the mark needs a viewBox')
  return { x: Number(match.groups.x), y: Number(match.groups.y), width: Number(match.groups.width), height: Number(match.groups.height) }
}

function markBody(source: string): string {
  const open = source.indexOf('>', source.indexOf('<svg'))
  const close = source.lastIndexOf('</svg>')
  if (open === -1 || close === -1) throw new Error('product icons: the mark is not an SVG document')
  return source.slice(open + 1, close)
}

/**
 * Compose one icon source: a white rounded tile with the mark centred on it.
 * @param mark - the mark SVG document.
 * @param tile - platform tile geometry.
 * @param fill - tile colour.
 * @returns an SVG document on the 1024-unit canvas whose mark sits in a `tray-glyph` group.
 */
export function composeIconSvg(mark: string, tile: IconTile, fill = '#FFFFFF'): string {
  const box = markViewBox(mark)
  const span = tile.size * tile.markScale
  const scale = span / Math.max(box.width, box.height)
  const offset = (ICON_EDGE - tile.size) / 2
  const markX = (ICON_EDGE - box.width * scale) / 2 - box.x * scale
  const markY = (ICON_EDGE - box.height * scale) / 2 - box.y * scale
  return [
    `<svg width="${String(ICON_EDGE)}" height="${String(ICON_EDGE)}" viewBox="0 0 ${String(ICON_EDGE)} ${String(ICON_EDGE)}" fill="none" xmlns="http://www.w3.org/2000/svg">`,
    // A hairline keeps the white tile visible on a light Dock or desktop.
    `<rect x="${String(offset + 1)}" y="${String(offset + 1)}" width="${String(tile.size - 2)}" height="${String(tile.size - 2)}" rx="${String(tile.radius)}" fill="${fill}" stroke="#D4D7DD" stroke-width="2"/>`,
    // The tray renderer adds its own transform to the glyph group, so the placement sits one level inside it.
    `<g id="tray-glyph"><g transform="translate(${markX.toFixed(3)} ${markY.toFixed(3)}) scale(${scale.toFixed(5)})">${markBody(mark).trim()}</g></g>`,
    '</svg>',
    '',
  ].join('\n')
}

/**
 * Render every icon file of one product into a directory.
 * @param markPath - the mark SVG.
 * @param outDir - the product's icon directory.
 * @returns the written file paths.
 */
export async function renderProductIcons(markPath: string, outDir: string): Promise<string[]> {
  const mark = await readFile(markPath, 'utf8')
  await mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const [platform, tile] of Object.entries(ICON_TILES)) {
    const svg = composeIconSvg(mark, tile)
    const svgPath = join(outDir, `icon-${platform}.svg`)
    const pngPath = join(outDir, `icon-${platform}.png`)
    await writeFile(svgPath, svg)
    await writeFile(pngPath, await sharp(Buffer.from(svg), { density: 72 }).resize(ICON_EDGE, ICON_EDGE).png().toBuffer())
    written.push(svgPath, pngPath)
  }
  const tray = join(outDir, 'tray-windows.ico')
  await writeFile(tray, packIco(await renderTrayIconEntries(Buffer.from(composeIconSvg(mark, ICON_TILES.windows)))))
  written.push(tray)
  return written
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { mark: { type: 'string' }, out: { type: 'string' } }, allowPositionals: false })
  if (values.mark === undefined || values.out === undefined) throw new Error('usage: render-product-icons --mark <mark.svg> --out <directory>')
  const written = await renderProductIcons(resolve(values.mark), resolve(values.out))
  console.info(`product icons: wrote ${written.join(', ')}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
