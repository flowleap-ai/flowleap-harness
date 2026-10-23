/** The product record selects the brand, the profile, and which vendor behaviours exist. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  DEFAULT_DESKTOP_PRODUCT,
  DESKTOP_PRODUCT_MANIFEST_KEY,
  parseDesktopProduct,
  readDesktopProductFile,
  resolveDesktopProduct,
  resolveDesktopProductName,
} from '../src/product.ts'
import { brandDesktopLocale, en, resolveDesktopLocale } from '../src/locale.ts'
import { resolveDesktopPaths } from '../src/paths.ts'
import { desktopProfileBundles } from '../src/project-manager.ts'
import { localMacOSPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { readDesktopProduct } from '../scripts/desktop-product.mjs'
import { composeIconSvg, ICON_TILES } from '../scripts/render-product-icons.ts'

const APP_ROOT = resolve(import.meta.dirname, '..')

describe('desktop product files', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('ships the upstream default and a FlowLeap product that both pass the runtime schema', () => {
    expect(readDesktopProductFile(APP_ROOT, 'deepseek')).toEqual(DEFAULT_DESKTOP_PRODUCT)
    const flowleap = readDesktopProductFile(APP_ROOT, 'flowleap')
    expect(flowleap).toMatchObject({
      productName: 'FlowLeap Patent AI', appId: 'co.flowleap.patent-ai', protocolScheme: 'flowleap-patent-ai',
      profile: { directory: 'flowleap-desktop', template: 'flowleap-web' },
      account: false, platform: false, welcome: false, telemetry: false,
      updates: { feedUrl: '' }, mandatoryUpdatePolicy: 'off',
    })
    // The build reader and the runtime parser read the same file the same way.
    expect(readDesktopProduct('flowleap')).toEqual(JSON.parse(readFileSync(join(APP_ROOT, 'config', 'product.flowleap.json'), 'utf8')))
    expect(desktopProfileBundles(flowleap.profile.template)).toEqual([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-flowleap-web',
    ])
    expect(resolveDesktopPaths('/home/.dsh', flowleap.profile.directory).profile).toBe(join('/home/.dsh', 'profiles', 'flowleap-desktop'))
  })

  it('rejects malformed records and names', () => {
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, appId: 'no-dots' })).toThrow('appId')
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, updates: { feedUrl: 'http://insecure.example' } })).toThrow('HTTPS')
    expect(() => parseDesktopProduct({ ...DEFAULT_DESKTOP_PRODUCT, mandatoryUpdatePolicy: 'maybe' })).toThrow('mandatoryUpdatePolicy')
    expect(() => resolveDesktopProductName('Flow Leap')).toThrow('DSH_DESKTOP_PRODUCT')
    expect(resolveDesktopProductName('  ')).toBe('deepseek')
  })

  it('reads the packaged record from the manifest and the development selection from the environment', () => {
    const flowleap = readDesktopProductFile(APP_ROOT, 'flowleap')
    expect(resolveDesktopProduct({ [DESKTOP_PRODUCT_MANIFEST_KEY]: flowleap }, { packaged: true, env: {}, appRoot: APP_ROOT }))
      .toEqual(flowleap)
    const packagedUpstream = { dshDesktopAppId: 'com.deepseek.dsh' }
    expect(resolveDesktopProduct(packagedUpstream, { packaged: true, env: { DSH_DESKTOP_PRODUCT: 'flowleap' }, appRoot: APP_ROOT }))
      .toBe(DEFAULT_DESKTOP_PRODUCT)
    expect(resolveDesktopProduct({}, { packaged: false, env: { DSH_DESKTOP_PRODUCT: 'flowleap' }, appRoot: APP_ROOT })).toEqual(flowleap)
    expect(resolveDesktopProduct({}, { packaged: false, env: {}, appRoot: APP_ROOT })).toBe(DEFAULT_DESKTOP_PRODUCT)
  })

  it('rebrands every shell string that names the upstream product', () => {
    const branded = brandDesktopLocale(resolveDesktopLocale('en-US'), 'FlowLeap Patent AI')
    expect(branded.messages).toMatchObject({
      aboutMenu: 'About FlowLeap Patent AI', aboutProduct: 'FlowLeap Patent AI', quitTitle: 'Quit FlowLeap Patent AI?',
    })
    expect(Object.values(branded.messages).some(message => message.includes('DeepSeek Harness'))).toBe(false)
    expect(brandDesktopLocale(resolveDesktopLocale('en-US'), 'DeepSeek Harness').messages).toBe(en)
  })

  it('selects the product identifier for a local unsigned macOS build and the builder identity', async () => {
    vi.stubEnv('DSH_DESKTOP_PRODUCT', 'flowleap')
    const local = localMacOSPackageEnvironment({ PATH: 'tools', DSH_DESKTOP_PRODUCT: 'flowleap' })
    expect(local).toEqual({ PATH: 'tools', DSH_DESKTOP_PRODUCT: 'flowleap', DSH_DESKTOP_APP_ID: 'co.flowleap.patent-ai', DSH_DESKTOP_UNSIGNED: '1' })
    const { createElectronBuilderConfig } = await import('../scripts/electron-builder-config.mjs')
    const config = createElectronBuilderConfig({ ...local, DSH_DESKTOP_TARGET_PLATFORM: 'darwin', DSH_DESKTOP_TARGET_ARCH: 'arm64' }, 'darwin', 'arm64')
    expect(config).toMatchObject({
      appId: 'co.flowleap.patent-ai',
      productName: 'FlowLeap Patent AI',
      protocols: [{ name: 'FlowLeap Patent AI', schemes: ['flowleap-patent-ai'] }],
      artifactName: 'flowleap-patent-ai-${version}-${os}-${arch}-unsigned.${ext}',
      publish: null,
      mac: { extendInfo: { CFBundleLocalizations: ['en'] } },
    })
    expect(config.extraMetadata).toMatchObject({ [DESKTOP_PRODUCT_MANIFEST_KEY]: { name: 'flowleap' } })
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    expect(config.mac).toMatchObject({ icon: expect.stringMatching(/resources[\\/]flowleap[\\/]icon-macos\.png$/u) as string })
    expect(() => createElectronBuilderConfig({ ...local, DSH_DESKTOP_APP_ID: 'com.other.app' }, 'darwin', 'arm64')).toThrow('does not match product')
  })

  it('composes a tile with the mark centred inside the tray glyph group', () => {
    const mark = readFileSync(resolve(APP_ROOT, '..', '..', 'packages', 'bundle', 'flowleap-web', 'brand', 'flowleap-mark.svg'), 'utf8')
    const svg = composeIconSvg(mark, ICON_TILES.macos)
    expect(svg).toContain('<g id="tray-glyph"><g transform="translate(')
    expect(svg).toContain(`rx="${String(ICON_TILES.macos.radius)}"`)
    expect(svg.match(/<path /gu)).toHaveLength(3)
  })
})
