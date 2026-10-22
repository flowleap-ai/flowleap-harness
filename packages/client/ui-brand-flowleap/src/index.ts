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
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`ui-brand-flowleap: cannot read ${path}: ${detail}`)
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
  const titleMarkup = `<title>${escapeHtmlText(brand.productName)}</title>`
  ctx.effect(() => ctx.webServer.tapIndex(html => html.replace(/<title>[^<]*<\/title>/u, titleMarkup)), 'ui-brand-flowleap: document title')
}
