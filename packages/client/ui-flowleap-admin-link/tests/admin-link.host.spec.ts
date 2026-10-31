import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import {
  ADMIN_LINK_PATH, AdminLinkKeyError, answerAdminLink, apply, checkConfig, Config, MAX_HEADER_LIFETIME_SECONDS, readAdminKey,
  verifyAdminHeader, type AdminHeaderCheck,
} from '../src/index.ts'

const NOW = 1_800_000_000
const starter = generateKeyPairSync('ed25519')
const other = generateKeyPairSync('ed25519')
const dir = mkdtempSync(join(tmpdir(), 'flowleap-admin-link-'))
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

/** A header as the starter makes it: `v1.<expiry>.<base64url Ed25519 signature>`. */
function header(expiry: number | string, privateKey: KeyObject = starter.privateKey): string {
  const signature = sign(null, Buffer.from(`flowleap-admin-link.v1.${String(expiry)}`, 'ascii'), privateKey).toString('base64url')
  return `v1.${String(expiry)}.${signature}`
}

function file(name: string, text: string): string {
  const path = join(dir, name)
  writeFileSync(path, text)
  return path
}

const publicPem = (key: KeyObject) => key.export({ type: 'spki', format: 'pem' }).toString()
const refused = (reason: Extract<AdminHeaderCheck, { admin: false }>['reason']): AdminHeaderCheck => ({ admin: false, reason })

describe('verifyAdminHeader', () => {
  const check = (value: string | undefined) => verifyAdminHeader(value, starter.publicKey, NOW)

  it('accepts one header that the starter signed and that expires within the lifetime', () => {
    expect(check(header(NOW + 60))).toEqual({ admin: true })
    expect(check(header(NOW + MAX_HEADER_LIFETIME_SECONDS))).toEqual({ admin: true })
  })

  it('refuses a missing or empty header', () => {
    expect(check(undefined)).toEqual(refused('missing'))
    expect(check('')).toEqual(refused('missing'))
  })

  it('refuses a header signed by another key, and a changed signature', () => {
    expect(check(header(NOW + 60, other.privateKey))).toEqual(refused('signature'))
    const valid = header(NOW + 60)
    const flipped = `${valid.slice(0, -2)}${valid.at(-2) === 'A' ? 'B' : 'A'}${valid.at(-1)!}`
    expect(check(flipped)).toEqual(refused('signature'))
  })

  it('refuses a header whose signature covers another expiry', () => {
    const [, , signature] = header(NOW + 60).split('.')
    expect(check(`v1.${String(NOW + 61)}.${signature!}`)).toEqual(refused('signature'))
  })

  it('refuses an expired header and one that expires now', () => {
    expect(check(header(NOW - 1))).toEqual(refused('expired'))
    expect(check(header(NOW))).toEqual(refused('expired'))
  })

  it('refuses a header that expires later than now plus the lifetime', () => {
    expect(check(header(NOW + MAX_HEADER_LIFETIME_SECONDS + 1))).toEqual(refused('lifetime'))
    expect(check(header('9'.repeat(40)))).toEqual(refused('lifetime'))
  })

  it('refuses an expiry that is not digits, another version, and a signature that is not canonical base64url', () => {
    expect(check(header(`${String(NOW + 60)}.5`))).toEqual(refused('malformed'))
    expect(check(header('+1800000060'))).toEqual(refused('malformed'))
    expect(check(header(NOW + 60).replace(/^v1\./u, 'v2.'))).toEqual(refused('malformed'))
    expect(check(header(NOW + 60).replace(/^v1\./u, 'V1.'))).toEqual(refused('malformed'))
    expect(check(`${header(NOW + 60)}==`)).toEqual(refused('malformed'))
    expect(check(`v1.${String(NOW + 60)}.AAAA`)).toEqual(refused('malformed'))
  })

  it('refuses two values joined with ", ", as Node joins a repeated header', () => {
    expect(check(`${header(NOW + 60)}, ${header(NOW + 60)}`)).toEqual(refused('malformed'))
    expect(check(`${header(NOW + 60)}, forged`)).toEqual(refused('malformed'))
  })
})

describe('readAdminKey', () => {
  it('reads the public key, and reports a missing file as absent', async () => {
    const read = await readAdminKey(file('starter.pub', publicPem(starter.publicKey)))
    expect(read.state).toBe('present')
    expect(await readAdminKey(join(dir, 'none.pub'))).toEqual({ state: 'absent' })
  })

  it('refuses a private key, a key of another type, and text that is not a key', async () => {
    const privatePath = file('private.pem', starter.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey
    for (const path of [
      privatePath, file('rsa.pub', publicPem(rsa)), file('junk.pub', '-----BEGIN PUBLIC KEY-----\nnot a key\n-----END PUBLIC KEY-----\n'),
    ]) {
      await expect(readAdminKey(path)).rejects.toMatchObject({ name: 'AdminLinkKeyError', problem: 'malformed', path })
    }
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a file that cannot be read as unreadable', async () => {
    const path = file('locked.pub', publicPem(starter.publicKey))
    chmodSync(path, 0o000)
    await expect(readAdminKey(path)).rejects.toBeInstanceOf(AdminLinkKeyError)
    await expect(readAdminKey(path)).rejects.toMatchObject({ problem: 'unreadable' })
  })
})

describe('checkConfig', () => {
  it('accepts an absolute key file or none, and a document-relative console path', () => {
    expect(() => { checkConfig({ publicKeyFile: '', consoleHref: 'admin/' }) }).not.toThrow()
    expect(() => { checkConfig({ publicKeyFile: '/run/flowleap/host/admin-link.pub', consoleHref: '../admin/' }) }).not.toThrow()
  })

  it('refuses a relative key file and a console target that leaves the document origin or path', () => {
    expect(() => { checkConfig({ publicKeyFile: 'admin-link.pub', consoleHref: 'admin/' }) }).toThrow(/publicKeyFile/u)
    for (const consoleHref of ['', '/admin/', '//evil.example/', 'https://evil.example/', 'javascript:alert(1)', 'admin/?x', '\\\\evil']) {
      expect(() => { checkConfig({ publicKeyFile: '', consoleHref }) }).toThrow(/consoleHref/u)
    }
  })
})

describe('answerAdminLink', () => {
  const keyFile = file('route.pub', publicPem(starter.publicKey))

  async function ask(publicKeyFile: string, value?: string) {
    const log = { error: vi.fn(), warn: vi.fn() }
    const request = new Request(`http://runtime.test${ADMIN_LINK_PATH}`, value === undefined ? {} : { headers: { 'x-flowleap-admin': value } })
    const response = await answerAdminLink(request, { publicKeyFile, consoleHref: 'admin/' }, log, NOW)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body: unknown = await response.json()
    return { body, log }
  }

  it('answers the console path for a valid header', async () => {
    const { body, log } = await ask(keyFile, header(NOW + 60))
    expect(body).toEqual({ href: 'admin/' })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('answers null without a header, and logs nothing', async () => {
    const { body, log } = await ask(keyFile)
    expect(body).toEqual({ href: null })
    expect(log.warn).not.toHaveBeenCalled()
  })

  it('answers null for a refused header and logs the reason as a warning', async () => {
    const { body, log } = await ask(keyFile, header(NOW + 60, other.privateKey))
    expect(body).toEqual({ href: null })
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('(signature)'))
  })

  it('answers null when no key file is configured or the file does not exist, even for a valid header', async () => {
    for (const publicKeyFile of ['', join(dir, 'none.pub')]) {
      const { body, log } = await ask(publicKeyFile, header(NOW + 60))
      expect(body).toEqual({ href: null })
      expect(log.error).not.toHaveBeenCalled()
    }
  })

  it('answers null and logs an error when the key file is malformed', async () => {
    const { body, log } = await ask(file('bad.pub', 'not a key'), header(NOW + 60))
    expect(body).toEqual({ href: null })
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('malformed'))
  })

  it('reads the key file at each request, so a rotated key needs no restart', async () => {
    const rotating = file('rotating.pub', publicPem(other.publicKey))
    expect((await ask(rotating, header(NOW + 60))).body).toEqual({ href: null })
    writeFileSync(rotating, publicPem(starter.publicKey))
    expect((await ask(rotating, header(NOW + 60))).body).toEqual({ href: 'admin/' })
  })
})

describe('ui-flowleap-admin-link Host half', () => {
  it('registers the GET route on the connection, answers through it, and removes it on dispose', async () => {
    const routes = new Set<ConnectionFetchRoute>()
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: (route: ConnectionFetchRoute) => { routes.add(route); return async () => { routes.delete(route) } } } } as never)
    const publicKeyFile = file('apply.pub', publicPem(starter.publicKey))
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { publicKeyFile, consoleHref: 'admin/' })
    await fiber.await()
    const [route] = [...routes]
    expect(route).toMatchObject({ path: '/api/flowleap/admin-link', methods: ['GET'] })
    const expiry = Math.floor(Date.now() / 1000) + 60
    const response = await route!.fetch(new Request(`http://runtime.test${ADMIN_LINK_PATH}`, { headers: { 'x-flowleap-admin': header(expiry) } }))
    expect(await response.json()).toEqual({ href: 'admin/' })
    await fiber.dispose()
    expect(routes.size).toBe(0)
    await ctx.fiber.dispose()
  })

  it('fails to load with an invalid config', async () => {
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register: () => async () => {} } } as never)
    const fiber = ctx.plugin({ inject: ['connection'], Config, apply }, { publicKeyFile: 'relative.pub', consoleHref: 'admin/' })
    await expect(fiber.await()).rejects.toThrow(/publicKeyFile/u)
    await ctx.fiber.dispose()
  })
})
