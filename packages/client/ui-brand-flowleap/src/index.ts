/**
 * FlowLeap brand plugin, Host half: reads one `brand.json` from a configured
 * absolute path, resolves its mark image to a data URL, and publishes the
 * record to the browser as the `__FLOWLEAP_BRAND__` boot global on every
 * served index page. It also rewrites the served page's `<title>` to the
 * product name so the tab is branded before the client mounts. The browser
 * half (`exports["./client"]`) occupies the brand slots and overrides the
 * product copy. A missing or invalid file rejects at load: a deployment that
 * mounts this row owns its brand.
 *
 * See packages/client/ui-brand-flowleap/README.md.
 * @module @deepseek-ai/dsh-client-ui-brand-flowleap
 */

import { readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BRAND_GLOBAL, parseBrandRecord, type BrandRecord } from './brand.ts'

export { BRAND_GLOBAL, parseBrandRecord } from './brand.ts'
export type { BrandMarkStyle, BrandRecord } from './brand.ts'

/** Cordis plugin name. */
export const name = 'ui-brand-flowleap'

/** The index renderer this row injects the brand record into. */
export const inject = ['webServer']

/** Plugin config: where the brand file lives. */
export interface Config {
  /** Absolute path of the `brand.json` file; its `mark` path resolves against the file's directory. */
  path: string
}

/** Runtime schema for the brand row. */
export const Config: z<Config> = z.object({
  path: z.string().required(),
})

/** Largest mark image accepted, matching the plugin icon limit. */
const MAX_MARK_BYTES = 256 * 1024

const MARK_MEDIA_TYPES = new Map([
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
])

/** Escape text before placing it between HTML tags. */
function escapeHtmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/**
 * Read the mark file named by `brand.json` and encode it as a data URL.
 * @param file - absolute path of the image.
 * @param label - the `brand.json` path, for diagnostics.
 * @returns the `data:` URL.
 * @throws when the file is missing, not an image type the browser draws, or too large.
 */
function readMark(file: string, label: string): string {
  const mediaType = MARK_MEDIA_TYPES.get(extname(file).toLowerCase())
  if (mediaType === undefined) throw new Error(`${label}: mark must be an SVG, PNG, JPEG, or WebP file, got ${file}`)
  const stat = statSync(file)
  if (!stat.isFile()) throw new Error(`${label}: mark ${file} is not a regular file`)
  if (stat.size > MAX_MARK_BYTES) throw new Error(`${label}: mark ${file} exceeds 256 KiB`)
  return `data:${mediaType};base64,${readFileSync(file).toString('base64')}`
}

/**
 * Read and validate a `brand.json` file into the record the browser receives.
 * @param path - absolute path of the file.
 * @returns the validated record, with `mark` resolved to a data URL.
 * @throws when the path is relative, the file is unreadable or invalid JSON, or a field has the wrong form.
 */
export function readBrandFile(path: string): BrandRecord {
  if (!isAbsolute(path)) throw new Error(`ui-brand-flowleap: path must be absolute, got ${JSON.stringify(path)}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`ui-brand-flowleap: cannot read ${path}: ${String(error)}`, { cause: error })
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${path} must be a JSON object`)
  const file = parsed as Record<string, unknown>
  const markPath = file.mark
  if (markPath !== undefined && typeof markPath !== 'string') throw new Error(`${path}: mark must be a non-empty string`)
  const mark = markPath === undefined ? undefined : readMark(resolve(dirname(path), markPath), path)
  return parseBrandRecord({ ...file, ...(mark === undefined ? {} : { mark }) }, path)
}

/**
 * Read the brand file and publish it to every served page.
 * @param ctx - the mounting context, carrying `webServer`.
 * @param config - the absolute path of `brand.json`.
 * @throws when the file is missing or invalid; the row fails to load.
 */
export function apply(ctx: Context, config: Config): void {
  const brand = readBrandFile(config.path)
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: BRAND_GLOBAL, value: brand })
  })
  ctx.effect(() => ctx.webServer.tapIndex(html => rewriteIndexHead(html, brand)), 'ui-brand-flowleap: document head')
  const mark = brand.mark === undefined ? undefined : decodeDataUrl(brand.mark)
  if (mark !== undefined) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: MARK_ROUTE,
      handler: (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { 'content-type': mark.mediaType, 'content-length': String(mark.bytes.byteLength), 'cache-control': 'public, max-age=3600' })
        res.end(mark.bytes)
      },
    }), 'ui-brand-flowleap: mark route')
  }
  const manifest = Buffer.from(brandManifest(brand), 'utf8')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: MANIFEST_ROUTE,
    handler: (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/manifest+json', 'content-length': String(manifest.byteLength), 'cache-control': 'public, max-age=3600' })
      res.end(manifest)
    },
  }), 'ui-brand-flowleap: web manifest route')
}

/** Where the served page finds the brand mark; an exact route beats the static shell's prefix route. */
export const MARK_ROUTE = '/brand/mark'
/** The web manifest path the shell's `<link rel="manifest">` already points at. */
export const MANIFEST_ROUTE = '/manifest.webmanifest'

/**
 * Split a `data:` URL into its media type and bytes.
 * @param url - a `data:<type>;base64,<payload>` URL as `readMark` produces.
 * @returns the media type and the decoded bytes.
 * @throws when the URL is not a base64 data URL.
 */
export function decodeDataUrl(url: string): { mediaType: string; bytes: Buffer } {
  const match = /^data:(?<mediaType>[^;,]+);base64,(?<payload>.*)$/su.exec(url)
  const mediaType = match?.groups?.mediaType
  const payload = match?.groups?.payload
  if (mediaType === undefined || payload === undefined) throw new Error('ui-brand-flowleap: mark is not a base64 data URL')
  return { mediaType, bytes: Buffer.from(payload, 'base64') }
}

/**
 * Render the web app manifest for the brand: product name, short name, and the mark as the icon.
 * @param brand - the validated brand record.
 * @returns the manifest JSON text.
 */
export function brandManifest(brand: BrandRecord): string {
  const mark = brand.mark === undefined ? undefined : decodeDataUrl(brand.mark)
  return JSON.stringify({
    name: brand.productName,
    short_name: brand.shortName,
    start_url: './',
    scope: './',
    display: 'fullscreen',
    icons: mark === undefined ? [] : [{ src: MARK_ROUTE, sizes: 'any', type: mark.mediaType, purpose: 'any' }],
  }, null, 2)
}

/**
 * Rewrite the served index head: the document title, and the icon links to the brand mark.
 * @param html - the shell's index document.
 * @param brand - the validated brand record.
 * @returns the document with the title replaced and, when the brand has a mark, one icon link in place of the shell's two.
 */
export function rewriteIndexHead(html: string, brand: BrandRecord): string {
  let out = html.replace(/<title>[^<]*<\/title>/u, `<title>${escapeHtmlText(brand.productName)}</title>`)
  if (brand.mark !== undefined) {
    const { mediaType } = decodeDataUrl(brand.mark)
    const icon = `<link rel="icon" type="${mediaType}" href="${MARK_ROUTE}" />\n    `
    let first = true
    out = out.replace(/<link rel="icon"[^>]*>\s*/gu, () => {
      if (!first) return ''
      first = false
      return icon
    })
  }
  return out
}
