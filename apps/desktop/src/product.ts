/**
 * Desktop product identity: which product this shell is, read once at startup.
 *
 * A product file under `config/product.<name>.json` names the application
 * (product name, bundle identifier, deep-link scheme, icons), selects the
 * dsh profile it runs (`$DSH_HOME/profiles/<directory>` initialized from a
 * shipped template), and switches the vendor-specific behaviours on or off:
 * the account sign-in and its welcome window, the embedded Platform pages,
 * analytics, the update feed and the mandatory-update policy. The packaging
 * configuration embeds the selected record into the application manifest as
 * `dshDesktopProduct`; an unpackaged launch reads the file named by
 * `DSH_DESKTOP_PRODUCT`. Without either, the shell is the upstream product.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { UPSTREAM_PRODUCT_NAME } from './locale.ts'

export { UPSTREAM_PRODUCT_NAME } from './locale.ts'

/** Environment variable that selects the product file of an unpackaged launch or a packaging run. */
export const DESKTOP_PRODUCT_ENV = 'DSH_DESKTOP_PRODUCT'

/** Manifest field that carries the packaged product record. */
export const DESKTOP_PRODUCT_MANIFEST_KEY = 'dshDesktopProduct'

/** One desktop product: identity, profile, and the vendor behaviours it keeps. */
export interface DesktopProduct {
  /** File name stem; `[a-z][a-z0-9-]*`. */
  readonly name: string
  /** Human-readable application name: window title base, About panel, menus. */
  readonly productName: string
  /** Short name for narrow surfaces. */
  readonly shortName: string
  /** Reverse-DNS bundle identifier; null leaves it to the packaging environment. */
  readonly appId: string | null
  /** Artifact filename prefix, such as `deepseek-harness`. */
  readonly artifactSlug: string
  /** Operating-system deep-link scheme (`<scheme>://open` focuses the window). */
  readonly protocolScheme: string
  /** The dsh profile this product runs. */
  readonly profile: {
    /** Directory under `$DSH_HOME/profiles`. */
    readonly directory: string
    /** Shipped profile template whose bundles initialize the directory. */
    readonly template: string
  }
  /** About panel credits text; empty for none. */
  readonly about: string
  /** Icon directory relative to the application package; holds `icon-macos.png`, `icon-windows.png`, `tray-windows.ico`. */
  readonly icons: string
  /** macOS microphone usage description. */
  readonly microphoneUsage: string
  /** `CFBundleLocalizations` entries. */
  readonly locales: readonly string[]
  /** Whether the vendor account sign-in exists in this product. */
  readonly account: boolean
  /** Whether the embedded Platform (usage, top-up) pages exist. */
  readonly platform: boolean
  /** Whether the native welcome window gates startup on a sign-in or an API key. */
  readonly welcome: boolean
  /** Whether the shell reports its own analytics events through the Host. */
  readonly telemetry: boolean
  /** Update feed: `''` disables the updater, `'deployment'` uses the packaging deployment settings, an HTTPS URL is a generic feed. */
  readonly updates: { readonly feedUrl: string }
  /** `'deployment'` reads the packaging policy settings; `'off'` ships no policy. */
  readonly mandatoryUpdatePolicy: 'deployment' | 'off'
}

/** The upstream product, used when no product is selected or embedded. */
export const DEFAULT_DESKTOP_PRODUCT: DesktopProduct = {
  name: 'deepseek',
  productName: UPSTREAM_PRODUCT_NAME,
  shortName: UPSTREAM_PRODUCT_NAME,
  appId: null,
  artifactSlug: 'deepseek-harness',
  protocolScheme: 'dsh',
  profile: { directory: 'desktop', template: 'web' },
  about: '',
  icons: 'resources',
  microphoneUsage: 'DeepSeek Harness uses your microphone to transcribe speech into message drafts.',
  locales: ['en', 'zh_CN', 'ja', 'es', 'fr', 'de', 'ru', 'pt'],
  account: true,
  platform: true,
  welcome: true,
  telemetry: true,
  updates: { feedUrl: 'deployment' },
  mandatoryUpdatePolicy: 'deployment',
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/u
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/u
const APP_ID_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/u
const PROFILE_DIRECTORY_PATTERN = /^[a-z][a-z0-9-]*$/u
const LOCALE_PATTERN = /^[a-z]{2}(?:_[A-Z]{2})?$/u

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(fields: Record<string, unknown>, key: string, label: string, pattern?: RegExp, allowEmpty = false): string {
  const value = fields[key]
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    throw new Error(`desktop product: ${label}.${key} must be a non-empty string`)
  }
  if (pattern !== undefined && !pattern.test(value)) throw new Error(`desktop product: ${label}.${key} has an invalid form`)
  return value
}

function flag(fields: Record<string, unknown>, key: string, label: string): boolean {
  const value = fields[key]
  if (typeof value !== 'boolean') throw new Error(`desktop product: ${label}.${key} must be a boolean`)
  return value
}

/**
 * Validate a product record read from a file or a packaged manifest.
 * @param value - parsed JSON.
 * @param label - where the record came from, for diagnostics.
 * @returns the validated, frozen record.
 */
export function parseDesktopProduct(value: unknown, label = 'product'): DesktopProduct {
  const fields = record(value)
  if (fields === undefined) throw new Error(`desktop product: ${label} must be a JSON object`)
  const appId = fields.appId
  if (appId !== null && (typeof appId !== 'string' || !APP_ID_PATTERN.test(appId))) {
    throw new Error(`desktop product: ${label}.appId must be null or a reverse-DNS identifier`)
  }
  const profile = record(fields.profile)
  if (profile === undefined) throw new Error(`desktop product: ${label}.profile must be an object`)
  const locales = fields.locales
  if (!Array.isArray(locales) || locales.length === 0 || !locales.every(item => typeof item === 'string' && LOCALE_PATTERN.test(item))) {
    throw new Error(`desktop product: ${label}.locales must be a non-empty list of locale identifiers`)
  }
  const updates = record(fields.updates)
  if (updates === undefined) throw new Error(`desktop product: ${label}.updates must be an object`)
  const feedUrl = text(updates, 'feedUrl', `${label}.updates`, undefined, true)
  if (feedUrl !== '' && feedUrl !== 'deployment') {
    let url: URL
    try { url = new URL(feedUrl) } catch { throw new Error(`desktop product: ${label}.updates.feedUrl must be empty, "deployment", or an HTTPS URL`) }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
      throw new Error(`desktop product: ${label}.updates.feedUrl must be an HTTPS URL without credentials`)
    }
  }
  const policy = fields.mandatoryUpdatePolicy
  if (policy !== 'deployment' && policy !== 'off') throw new Error(`desktop product: ${label}.mandatoryUpdatePolicy must be "deployment" or "off"`)
  return Object.freeze({
    name: text(fields, 'name', label, NAME_PATTERN),
    productName: text(fields, 'productName', label),
    shortName: text(fields, 'shortName', label),
    appId,
    artifactSlug: text(fields, 'artifactSlug', label, SLUG_PATTERN),
    protocolScheme: text(fields, 'protocolScheme', label, SCHEME_PATTERN),
    profile: Object.freeze({
      directory: text(profile, 'directory', `${label}.profile`, PROFILE_DIRECTORY_PATTERN),
      template: text(profile, 'template', `${label}.profile`, NAME_PATTERN),
    }),
    about: text(fields, 'about', label, undefined, true),
    icons: text(fields, 'icons', label, /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/u),
    microphoneUsage: text(fields, 'microphoneUsage', label),
    locales: Object.freeze([...locales as string[]]),
    account: flag(fields, 'account', label),
    platform: flag(fields, 'platform', label),
    welcome: flag(fields, 'welcome', label),
    telemetry: flag(fields, 'telemetry', label),
    updates: Object.freeze({ feedUrl }),
    mandatoryUpdatePolicy: policy,
  })
}

/**
 * Validate a product name taken from the environment.
 * @param value - raw `DSH_DESKTOP_PRODUCT` value; undefined or blank selects the upstream product.
 * @returns the product file stem.
 */
export function resolveDesktopProductName(value: string | undefined): string {
  const name = value?.trim() ?? ''
  if (name === '') return DEFAULT_DESKTOP_PRODUCT.name
  if (!NAME_PATTERN.test(name)) throw new Error(`desktop product: ${DESKTOP_PRODUCT_ENV} must match ${NAME_PATTERN.source}`)
  return name
}

/**
 * Path of a product file inside the application package.
 * @param appRoot - the desktop application directory.
 * @param name - product file stem.
 * @returns the absolute path of `config/product.<name>.json`.
 */
export function desktopProductFile(appRoot: string, name: string): string {
  return join(appRoot, 'config', `product.${name}.json`)
}

/**
 * Read and validate one product file.
 * @param appRoot - the desktop application directory.
 * @param name - product file stem.
 * @returns the validated record.
 */
export function readDesktopProductFile(appRoot: string, name: string): DesktopProduct {
  const path = desktopProductFile(appRoot, name)
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`desktop product: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const product = parseDesktopProduct(parsed, path)
  if (product.name !== name) throw new Error(`desktop product: ${path} declares name ${JSON.stringify(product.name)}`)
  return product
}

/**
 * Resolve the product of this process: the packaged manifest record, the development
 * selection, or the upstream default.
 * @param manifest - parsed application `package.json`.
 * @param options - whether the application is packaged, its environment, and its root directory.
 * @returns the product this shell presents.
 */
export function resolveDesktopProduct(
  manifest: unknown,
  options: { readonly packaged: boolean; readonly env: NodeJS.ProcessEnv; readonly appRoot: string },
): DesktopProduct {
  const fields = record(manifest)
  if (options.packaged) {
    const embedded = fields?.[DESKTOP_PRODUCT_MANIFEST_KEY]
    return embedded === undefined ? DEFAULT_DESKTOP_PRODUCT : parseDesktopProduct(embedded, `package.json#${DESKTOP_PRODUCT_MANIFEST_KEY}`)
  }
  const name = resolveDesktopProductName(options.env[DESKTOP_PRODUCT_ENV])
  return name === DEFAULT_DESKTOP_PRODUCT.name ? DEFAULT_DESKTOP_PRODUCT : readDesktopProductFile(options.appRoot, name)
}
