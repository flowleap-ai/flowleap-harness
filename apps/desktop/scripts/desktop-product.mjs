/**
 * Build-side reader of the desktop product files under `config/`.
 *
 * The runtime shell validates the same record in `src/product.ts`; this module
 * runs under plain Node inside electron-builder and the packaging scripts, so it
 * carries its own light checks and leaves the strict schema to the runtime
 * module, which the packaging `beforePack` hook also applies to the embedded
 * record.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Environment variable that selects the product file. */
export const DESKTOP_PRODUCT_ENV = 'DSH_DESKTOP_PRODUCT'

/** Manifest field that carries the packaged product record. */
export const DESKTOP_PRODUCT_MANIFEST_KEY = 'dshDesktopProduct'

/** The upstream product file stem. */
export const DEFAULT_DESKTOP_PRODUCT_NAME = 'deepseek'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/u

/**
 * Validate the product name a packaging environment selects.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @returns {string} The product file stem; blank selects the upstream product.
 */
export function resolveDesktopProductName(env = process.env) {
  const name = env[DESKTOP_PRODUCT_ENV]?.trim() ?? ''
  if (name === '') return DEFAULT_DESKTOP_PRODUCT_NAME
  if (!NAME_PATTERN.test(name)) throw new Error(`desktop product: ${DESKTOP_PRODUCT_ENV} must match ${NAME_PATTERN.source}`)
  return name
}

/**
 * Path of one product file.
 * @param {string} name - Product file stem.
 * @param {string} appRoot - Desktop application directory.
 * @returns {string} Absolute path of `config/product.<name>.json`.
 */
export function desktopProductFile(name, appRoot = APP_ROOT) {
  return join(appRoot, 'config', `product.${name}.json`)
}

function requireText(product, key, path) {
  const value = product[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`desktop product: ${path} needs a non-empty ${key}`)
  return value
}

/**
 * Read one product file with the checks the build depends on.
 * @param {string} name - Product file stem.
 * @param {string} appRoot - Desktop application directory.
 * @returns {import('./desktop-product.d.mts').DesktopProductRecord} The product record.
 */
export function readDesktopProduct(name = resolveDesktopProductName(), appRoot = APP_ROOT) {
  const path = desktopProductFile(name, appRoot)
  let product
  try { product = JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`desktop product: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`) }
  if (typeof product !== 'object' || product === null || Array.isArray(product)) throw new Error(`desktop product: ${path} must be a JSON object`)
  if (product.name !== name) throw new Error(`desktop product: ${path} declares name ${JSON.stringify(product.name)}`)
  for (const key of ['productName', 'shortName', 'artifactSlug', 'protocolScheme', 'icons', 'microphoneUsage']) requireText(product, key, path)
  if (product.appId !== null && (typeof product.appId !== 'string' || product.appId.trim() === '')) {
    throw new Error(`desktop product: ${path} appId must be null or a reverse-DNS identifier`)
  }
  if (typeof product.updates !== 'object' || product.updates === null || typeof product.updates.feedUrl !== 'string') {
    throw new Error(`desktop product: ${path} needs updates.feedUrl`)
  }
  if (product.mandatoryUpdatePolicy !== 'deployment' && product.mandatoryUpdatePolicy !== 'off') {
    throw new Error(`desktop product: ${path} mandatoryUpdatePolicy must be "deployment" or "off"`)
  }
  if (!Array.isArray(product.locales) || product.locales.length === 0) throw new Error(`desktop product: ${path} needs locales`)
  return product
}

/**
 * Absolute path of one icon file of a product.
 * @param {import('./desktop-product.d.mts').DesktopProductRecord} product - The product record.
 * @param {string} file - Icon file name inside the product's icon directory.
 * @param {string} appRoot - Desktop application directory.
 * @returns {string} The absolute icon path.
 */
export function desktopProductIconPath(product, file, appRoot = APP_ROOT) {
  return resolve(appRoot, product.icons, file)
}

/**
 * The application bundle or executable name electron-builder derives from the product name.
 * @param {import('./desktop-product.d.mts').DesktopProductRecord} product - The product record.
 * @returns {string} The `productName` as electron-builder files it.
 */
export function desktopProductFilename(product) {
  return product.productName
}
