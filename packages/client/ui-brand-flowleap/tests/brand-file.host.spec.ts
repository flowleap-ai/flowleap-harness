import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import * as Brand from '../src/index.ts'

const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2z"/></svg>'
const MARK_URL = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`

describe('the ui-brand-flowleap Host half', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ui-brand-flowleap-'))
  const contexts: Context[] = []

  afterEach(async () => {
    for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function brandFile(name: string, body: unknown): string {
    const path = join(dir, name)
    writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body))
    return path
  }

  it('reads brand.json, resolves the mark against the file directory, and keeps only known fields', () => {
    writeFileSync(join(dir, 'mark.svg'), MARK)
    const path = brandFile('brand.json', {
      productName: 'Acme Patents', shortName: 'Acme', tagline: 'Search.', mark: './mark.svg', accent: '#123456', extra: true,
    })
    expect(Brand.readBrandFile(path)).toEqual({
      productName: 'Acme Patents', shortName: 'Acme', tagline: 'Search.', mark: MARK_URL, markStyle: 'mono', accent: '#123456',
    })
    expect(Brand.readBrandFile(brandFile('minimal.json', { productName: 'P', shortName: 'S', markStyle: 'color' })))
      .toEqual({ productName: 'P', shortName: 'S', markStyle: 'color' })
  })

  it('rejects a relative path, an unreadable or malformed file, and invalid fields', () => {
    expect(() => Brand.readBrandFile('brand/brand.json')).toThrow('path must be absolute')
    expect(() => Brand.readBrandFile(join(dir, 'missing.json'))).toThrow('cannot read')
    expect(() => Brand.readBrandFile(brandFile('bad.json', '{'))).toThrow('cannot read')
    expect(() => Brand.readBrandFile(brandFile('list.json', []))).toThrow('must be a JSON object')
    expect(() => Brand.readBrandFile(brandFile('no-name.json', { shortName: 'S' }))).toThrow('productName must be a non-empty string')
    expect(() => Brand.readBrandFile(brandFile('style.json', { productName: 'P', shortName: 'S', markStyle: 'neon' }))).toThrow('markStyle must be one of mono, color')
    expect(() => Brand.readBrandFile(brandFile('accent.json', { productName: 'P', shortName: 'S', accent: 'red; }' }))).toThrow('accent must be one CSS colour value')
    writeFileSync(join(dir, 'mark.txt'), MARK)
    expect(() => Brand.readBrandFile(brandFile('text-mark.json', { productName: 'P', shortName: 'S', mark: './mark.txt' }))).toThrow('mark must be an SVG, PNG, JPEG, or WebP file')
    expect(() => Brand.readBrandFile(brandFile('lost-mark.json', { productName: 'P', shortName: 'S', mark: './lost.svg' }))).toThrow('ENOENT')
    mkdirSync(join(dir, 'dir.svg'))
    expect(() => Brand.readBrandFile(brandFile('dir-mark.json', { productName: 'P', shortName: 'S', mark: './dir.svg' }))).toThrow('is not a regular file')
    expect(() => Brand.readBrandFile(brandFile('object-mark.json', { productName: 'P', shortName: 'S', mark: { path: 'x' } }))).toThrow('mark must be a non-empty string')
    expect(() => Brand.parseBrandRecord({ productName: 'P', shortName: 'S', mark: 'https://x/y.svg' }, 'x')).toThrow('mark must be an image data URL')
  })

  it('publishes the record as the boot global and rewrites the served title; both unwind on disposal', async () => {
    writeFileSync(join(dir, 'mark.svg'), MARK)
    const path = brandFile('brand.json', { productName: 'Acme <Patents> & Co', shortName: 'Acme', mark: './mark.svg' })
    const ctx = new Context()
    contexts.push(ctx)
    const taps: ((html: string) => string)[] = []
    const routes: string[] = []
    const webServer: Pick<Context['webServer'], 'tapIndex' | 'register'> = {
      tapIndex(transform) {
        taps.push(transform)
        return () => { taps.splice(taps.indexOf(transform), 1) }
      },
      register(route) {
        routes.push(route.path)
        return () => { routes.splice(routes.indexOf(route.path), 1) }
      },
    }
    ctx.provide('webServer', webServer as Context['webServer'])
    const fiber = await ctx.plugin(Brand, { path })
    const table: IndexInjection[] = []
    ctx.emit('webserver/index-inject', table)
    expect(table).toEqual([{ kind: 'global', name: Brand.BRAND_GLOBAL, value: {
      productName: 'Acme <Patents> & Co', shortName: 'Acme', mark: MARK_URL, markStyle: 'mono',
    } }])
    const html = '<html><head><title>DSH Local Build</title></head><body></body></html>'
    expect(taps.map(tap => tap(html))).toEqual(['<html><head><title>Acme &lt;Patents&gt; &amp; Co</title></head><body></body></html>'])
    await fiber.dispose()
    const after: IndexInjection[] = []
    ctx.emit('webserver/index-inject', after)
    expect(after).toEqual([])
    expect(taps).toEqual([])
  })

  it('fails to load on a missing file instead of booting unbranded', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    ctx.provide('webServer', {} as Context['webServer'])
    await expect(ctx.plugin(Brand, { path: join(dir, 'absent.json') }).await()).rejects.toThrow('cannot read')
  })
})
