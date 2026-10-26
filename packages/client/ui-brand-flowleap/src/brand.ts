/**
 * The brand record both halves of this package share: what the Host reads
 * from `brand.json` and what the browser renders. The record crosses the
 * process boundary as one JSON value on the boot page, so every field is
 * JSON-compatible and the browser re-validates it before use.
 * @module
 */

/** `globalThis` property the Host's index injection assigns the brand record to. */
export const BRAND_GLOBAL = '__FLOWLEAP_BRAND__'

/** The shipped UI languages; the brand copy carries a translation for each. */
export const BRAND_LOCALES = ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt'] as const

/** One shipped UI language. */
export type BrandLocale = typeof BRAND_LOCALES[number]

/** Text per UI language; English is required and stands in for a language the brand does not translate. */
export type BrandText = { readonly en: string } & Readonly<Partial<Record<BrandLocale, string>>>

/** How the browser draws the mark image. */
export type BrandMarkStyle =
  /** A monochrome mark: drawn as a mask filled with the surrounding text colour, or the accent when set. */
  | 'mono'
  /** A full-colour mark: drawn as the image itself. */
  | 'color'

/** The brand as the browser receives it. */
export interface BrandRecord {
  /** Full product name: the document title base and the sidebar name. */
  readonly productName: string
  /** Short name for narrow surfaces and copy that names the product in passing. */
  readonly shortName: string
  /** One line under the mark on a blank session, per UI language; absent keeps the shell's own headline. */
  readonly tagline?: BrandText
  /** The mark as a `data:` URL; absent keeps the shell's fallback mark. */
  readonly mark?: string
  /** How {@link mark} is drawn. */
  readonly markStyle: BrandMarkStyle
  /** CSS colour applied to a monochrome mark; absent follows the surrounding text colour. */
  readonly accent?: string
}

const MARK_STYLES: readonly BrandMarkStyle[] = ['mono', 'color']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`)
  return value
}

function optionalText(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : text(value, path)
}

/** A string is the English text; an object maps shipped locales to text and must carry `en`. */
function optionalBrandText(value: unknown, path: string): BrandText | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return { en: text(value, path) }
  if (!isObject(value)) throw new Error(`${path} must be a non-empty string or an object of locale texts`)
  for (const key of Object.keys(value)) {
    if (!(BRAND_LOCALES as readonly string[]).includes(key)) throw new Error(`${path}: unknown locale ${key}; expected ${BRAND_LOCALES.join(', ')}`)
  }
  const translated = Object.fromEntries(BRAND_LOCALES.flatMap(locale => value[locale] === undefined ? [] : [[locale, text(value[locale], `${path}.${locale}`)]]))
  return { ...translated, en: text(value.en, `${path}.en`) }
}

/**
 * Pick the brand text for one UI language.
 * @param value - the validated text.
 * @param locale - the UI language.
 * @returns the translation, or the English text when the brand has none for that language.
 */
export function brandText(value: BrandText, locale: BrandLocale): string {
  return value[locale] ?? value.en
}

/**
 * Validate a brand record read from an untrusted carrier: the parsed
 * `brand.json` with its mark already resolved to a data URL, or the injected
 * boot global.
 * @param value - the candidate record.
 * @param label - where the value came from, for the diagnostic.
 * @returns the validated record with only known fields.
 * @throws when a required field is missing or any field has the wrong form.
 */
export function parseBrandRecord(value: unknown, label: string): BrandRecord {
  if (!isObject(value)) throw new Error(`${label} must be a JSON object`)
  const markStyle = value.markStyle === undefined ? 'mono' : value.markStyle
  if (typeof markStyle !== 'string' || !MARK_STYLES.includes(markStyle as BrandMarkStyle)) {
    throw new Error(`${label}: markStyle must be one of ${MARK_STYLES.join(', ')}`)
  }
  const mark = optionalText(value.mark, `${label}: mark`)
  if (mark !== undefined && !mark.startsWith('data:image/')) throw new Error(`${label}: mark must be an image data URL`)
  const accent = optionalText(value.accent, `${label}: accent`)
  if (accent !== undefined && /[;{}<>"'\\]/u.test(accent)) throw new Error(`${label}: accent must be one CSS colour value`)
  const tagline = optionalBrandText(value.tagline, `${label}: tagline`)
  return {
    productName: text(value.productName, `${label}: productName`),
    shortName: text(value.shortName, `${label}: shortName`),
    ...(tagline === undefined ? {} : { tagline }),
    ...(mark === undefined ? {} : { mark }),
    markStyle: markStyle as BrandMarkStyle,
    ...(accent === undefined ? {} : { accent }),
  }
}
