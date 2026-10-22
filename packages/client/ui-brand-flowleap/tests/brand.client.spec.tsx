// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { BRAND_GLOBAL, parseBrandRecord, type BrandRecord } from '../src/brand.ts'
import { BrandMark, HeroBrandMark, SidebarBrandMark, SidebarBrandName } from '../src/client/Brand.tsx'
import { brandCopy } from '../src/client/locales.ts'

const MARK = 'data:image/svg+xml;base64,PHN2Zy8+'
const BRAND: BrandRecord = { productName: 'Acme Patents', shortName: 'Acme', tagline: 'Search first.', mark: MARK, markStyle: 'mono', accent: '#123456' }

const HOLES = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, BRAND_GLOBAL)
})

async function bench() {
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  ctx.provide('locale', new LocaleRuntime(ctx))
  const locale = ctx.get('locale') as LocaleRuntime
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declareHoles()
  return { ctx, slots, locale, declareHoles, disposeHoles }
}

describe('the ui-brand-flowleap browser half', () => {
  it('declares the slot and locale services', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers nothing on a page without the injected record or with an invalid one', async () => {
    const subject = await bench()
    await subject.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect(subject.locale.bind('common')('brand.localBuild')).toBe('brand.localBuild')

    const invalid = await bench()
    const error = vi.spyOn(invalid.ctx.logger, 'error').mockImplementation(() => {})
    vi.stubGlobal(BRAND_GLOBAL, { shortName: 'only' })
    await invalid.ctx.plugin({ inject: [...inject], apply }).await()
    for (const hole of HOLES) expect(invalid.slots.entries(hole)).toHaveLength(0)
    expect(error).toHaveBeenCalledOnce()
  })

  it('fills the three brand slots, overrides the product copy in both locales, and unwinds on teardown', async () => {
    const subject = await bench()
    subject.locale.register('common', 'en', { 'brand.localBuild': 'DSH Local Build' })
    subject.locale.register('common', 'zh', { 'brand.localBuild': 'DSH 本地构建' })
    subject.locale.register('conversation', 'en', { 'hero.headline': 'Into the Unknown' })
    subject.locale.register('conversation', 'zh', { 'hero.headline': '探索未至之境' })
    vi.stubGlobal(BRAND_GLOBAL, BRAND)
    const fiber = subject.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)
    const common = subject.locale.bind('common')
    const conversation = subject.locale.bind('conversation')
    expect([common('brand.localBuild'), conversation('hero.headline')]).toEqual(['Acme Patents', 'Search first.'])
    subject.locale.setLocale('zh')
    expect([common('brand.localBuild'), conversation('hero.headline')]).toEqual(['Acme Patents', 'Search first.'])

    subject.disposeHoles()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    subject.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(subject.slots.entries(hole)).toHaveLength(0)
    expect([common('brand.localBuild'), conversation('hero.headline')]).toEqual(['DSH 本地构建', '探索未至之境'])
  })

  it('leaves the headline alone without a tagline and names the product in every other override', () => {
    const { tagline: _tagline, ...untagged } = BRAND
    const namespaces = brandCopy(untagged).map(entry => entry.ns)
    expect(namespaces).toEqual(['common', 'settings.models', 'model', 'pluginManager', 'sidebarOffice', 'chat'])
    expect(brandCopy(BRAND).map(entry => entry.ns)).toContain('conversation')
    const texts = brandCopy(BRAND).flatMap(entry => Object.values(entry.dict))
    expect(texts.some(text => /DeepSeek|DSH/u.test(text))).toBe(false)
  })

  it('draws a mono mark as a mask in the accent colour, a colour mark as an image, and nothing without a mark', () => {
    const mono = render(<SidebarBrandMark size={24} brand={BRAND} />)
    const mask = mono.container.firstElementChild as HTMLElement
    expect([mask.tagName, mask.style.width, mask.style.color, mask.style.maskImage]).toEqual(['SPAN', '24px', 'rgb(18, 52, 86)', `url("${MARK}")`])
    mono.unmount()

    const { accent: _accent, ...unaccentedBrand } = BRAND
    const unaccented = render(<HeroBrandMark size={34} className="host" brand={unaccentedBrand} />)
    const plain = unaccented.container.firstElementChild as HTMLElement
    expect([plain.style.height, plain.style.color, plain.classList.contains('host')]).toEqual(['34px', '', true])
    unaccented.unmount()

    const colour = render(<BrandMark size={16} brand={{ ...BRAND, markStyle: 'color' }} />)
    const image = colour.container.querySelector('img')
    expect([image?.getAttribute('src'), image?.getAttribute('width')]).toEqual([MARK, '16'])
    colour.unmount()

    const { mark: _mark, ...markless } = BRAND
    const none = render(<BrandMark size={16} brand={markless} />)
    expect(none.container.childElementCount).toBe(0)
    none.unmount()

    const name = render(<SidebarBrandName brand={BRAND} />)
    expect(name.container.textContent).toBe('Acme Patents')
  })

  it('validates the injected record field by field', () => {
    expect(parseBrandRecord({ productName: 'P', shortName: 'S' }, 'x')).toEqual({ productName: 'P', shortName: 'S', markStyle: 'mono' })
    expect(() => parseBrandRecord('text', 'x')).toThrow('x must be a JSON object')
    expect(() => parseBrandRecord({ productName: 'P', shortName: ' ' }, 'x')).toThrow('shortName must be a non-empty string')
    expect(() => parseBrandRecord({ productName: 'P', shortName: 'S', tagline: 3 }, 'x')).toThrow('tagline must be a non-empty string')
    expect(() => parseBrandRecord({ productName: 'P', shortName: 'S', markStyle: 1 }, 'x')).toThrow('markStyle must be one of')
  })
})
