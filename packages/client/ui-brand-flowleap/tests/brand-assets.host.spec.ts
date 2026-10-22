import { describe, expect, it } from 'vitest'
import { brandManifest, decodeDataUrl, MARK_ROUTE, rewriteIndexHead } from '../src/index.ts'
import type { BrandRecord } from '../src/brand.ts'

const MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><path d="M0 0h2v2z"/></svg>'
const MARK_URL = `data:image/svg+xml;base64,${Buffer.from(MARK).toString('base64')}`
const BRAND: BrandRecord = { productName: 'Acme Patent AI', shortName: 'Acme', mark: MARK_URL, markStyle: 'mono' }

const INDEX = [
  '<!doctype html>',
  '<html><head>',
  '    <title>DSH Local Build</title>',
  '    <link rel="manifest" href="/manifest.webmanifest" />',
  '    <link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)" />',
  '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" media="(prefers-color-scheme: light)" />',
  '</head><body></body></html>',
].join('\n')

describe('the brand assets the Host serves', () => {
  it('decodes the mark data URL into its media type and bytes', () => {
    const mark = decodeDataUrl(MARK_URL)
    expect(mark.mediaType).toBe('image/svg+xml')
    expect(mark.bytes.toString('utf8')).toBe(MARK)
    expect(() => decodeDataUrl('https://example.test/mark.svg')).toThrow('not a base64 data URL')
  })

  it('renders the web manifest from the brand with the mark as its icon', () => {
    expect(JSON.parse(brandManifest(BRAND))).toEqual({
      name: 'Acme Patent AI',
      short_name: 'Acme',
      start_url: './',
      scope: './',
      display: 'fullscreen',
      icons: [{ src: MARK_ROUTE, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    })
    const bare = JSON.parse(brandManifest({ productName: 'Acme Patent AI', shortName: 'Acme', markStyle: 'mono' })) as { icons: unknown[] }
    expect(bare.icons).toEqual([])
  })

  it('rewrites the title and replaces the two shell icon links with one brand mark link', () => {
    const out = rewriteIndexHead(INDEX, BRAND)
    expect(out).toContain('<title>Acme Patent AI</title>')
    expect(out).not.toContain('favicon.svg')
    expect(out).not.toContain('favicon-dark.svg')
    expect(out.match(/<link rel="icon"/gu)).toHaveLength(1)
    expect(out).toContain(`<link rel="icon" type="image/svg+xml" href="${MARK_ROUTE}" />`)
    expect(out).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
  })

  it('leaves the shell icon links alone when the brand has no mark', () => {
    const out = rewriteIndexHead(INDEX, { productName: 'Acme Patent AI', shortName: 'Acme', markStyle: 'mono' })
    expect(out).toContain('<title>Acme Patent AI</title>')
    expect(out.match(/<link rel="icon"/gu)).toHaveLength(2)
  })
})
