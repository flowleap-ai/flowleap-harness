/**
 * FlowLeap brand plugin, browser half: reads the brand record the Host
 * injected into the boot page, occupies the sidebar mark and name slots and
 * the blank-session hero mark with it, and layers the product name over the
 * upstream copy that still names the harness. Without an injected record
 * (a page the Host did not render) it registers nothing and the shell keeps
 * its own fallbacks.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the ctx.slots service merge and the slot declarations this plugin occupies.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: the ctx.locale service merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BRAND_GLOBAL, parseBrandRecord, type BrandRecord } from '../brand.ts'
import { HeroBrandMark, SidebarBrandMark, SidebarBrandName, type BrandInjected } from './Brand.tsx'
import { brandCopy } from './locales.ts'

export type { BrandInjected, BrandMarkProps } from './Brand.tsx'
export type { CopyOverride } from './locales.ts'

/** Required services: the UI slot registry and the locale registry. */
export const inject = ['slots', 'locale']

/** Locales the copy overrides cover: both shipped dictionaries read the brand's English text. */
const OVERRIDDEN_LOCALES = ['en', 'zh'] as const

/**
 * Read the record the Host injected, if this page carries one.
 * @param ctx - client root context, for the diagnostic.
 * @returns the validated record, or undefined when the page has none.
 */
function injectedBrand(ctx: ClientContext): BrandRecord | undefined {
  const value: unknown = Reflect.get(globalThis, BRAND_GLOBAL)
  if (value === undefined) return undefined
  try {
    return parseBrandRecord(value, BRAND_GLOBAL)
  } catch (error) {
    ctx.logger.error(error)
    return undefined
  }
}

/**
 * Occupy the brand slots and override the product copy with the injected brand.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const brand = injectedBrand(ctx)
  if (brand === undefined) return
  const injected = (): BrandInjected => ({ brand })
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark', inject: injected }, SidebarBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', inject: injected }, SidebarBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark', inject: injected }, HeroBrandMark))
  for (const { ns, dict } of brandCopy(brand)) {
    for (const locale of OVERRIDDEN_LOCALES) {
      ctx.effect(() => ctx.locale.override(ns, locale, dict), `ui-brand-flowleap: ${ns} copy`)
    }
  }
}
