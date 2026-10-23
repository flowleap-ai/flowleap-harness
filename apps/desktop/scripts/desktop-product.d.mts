/** Environment variable that selects the product file. */
export const DESKTOP_PRODUCT_ENV: 'DSH_DESKTOP_PRODUCT'

/** Manifest field that carries the packaged product record. */
export const DESKTOP_PRODUCT_MANIFEST_KEY: 'dshDesktopProduct'

/** The upstream product file stem. */
export const DEFAULT_DESKTOP_PRODUCT_NAME: 'deepseek'

/** One `config/product.<name>.json` record as the build reads it; `src/product.ts` owns the strict schema. */
export interface DesktopProductRecord {
  name: string
  productName: string
  shortName: string
  appId: string | null
  artifactSlug: string
  protocolScheme: string
  profile: { directory: string; template: string }
  about: string
  icons: string
  microphoneUsage: string
  locales: string[]
  account: boolean
  platform: boolean
  welcome: boolean
  telemetry: boolean
  updates: { feedUrl: string }
  mandatoryUpdatePolicy: 'deployment' | 'off'
}

/**
 * Validate the product name a packaging environment selects.
 * @param env Packaging environment.
 * @returns The product file stem; blank selects the upstream product.
 */
export function resolveDesktopProductName(env?: NodeJS.ProcessEnv): string

/**
 * Path of one product file.
 * @param name Product file stem.
 * @param appRoot Desktop application directory.
 * @returns Absolute path of `config/product.<name>.json`.
 */
export function desktopProductFile(name: string, appRoot?: string): string

/**
 * Read one product file with the checks the build depends on.
 * @param name Product file stem.
 * @param appRoot Desktop application directory.
 * @returns The product record.
 */
export function readDesktopProduct(name?: string, appRoot?: string): DesktopProductRecord

/**
 * Absolute path of one icon file of a product.
 * @param product The product record.
 * @param file Icon file name inside the product's icon directory.
 * @param appRoot Desktop application directory.
 * @returns The absolute icon path.
 */
export function desktopProductIconPath(product: DesktopProductRecord, file: string, appRoot?: string): string

/**
 * The application bundle or executable name electron-builder derives from the product name.
 * @param product The product record.
 * @returns The `productName` as electron-builder files it.
 */
export function desktopProductFilename(product: DesktopProductRecord): string
