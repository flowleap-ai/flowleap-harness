import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { describe, expect, it, vi } from 'vitest'
import {
  KEY_STATE_HEADING, KEY_STATE_SECTION_NAME, NO_KEYS, createCredentialStore, readKeyPresence, registerKeyStateSection,
  renderKeyStateSection,
} from '@deepseek-ai/dsh-flowleap-connectors'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import { MemoryCredentials } from './memory-credentials.ts'

async function bench() {
  const ctx = new Context()
  const credentials = new MemoryCredentials(ctx)
  await ctx.plugin(SystemPrompt)
  const store = createCredentialStore(credentials)
  await registerKeyStateSection(ctx, store)
  const sectionText = async () => {
    const assembly = await ctx.systemPrompt.assemble()
    return assembly.sections.find(section => section.name === KEY_STATE_SECTION_NAME)?.text
  }
  const settled = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  return { ctx, credentials, store, sectionText, settled }
}

describe('the patent-data key-state section', () => {
  it('renders key presence per connector under the heading the persona export names, with the missing-key rule', () => {
    const text = renderKeyStateSection({ ...NO_KEYS, 'epo-ops': true })
    expect(text).toMatchInlineSnapshot(`
      "Patent-data keys (this host):
      This host runs the patent offices on the firm's own keys, stored in Settings > Patent data connectors. Key presence this turn:
      - EPO OPS: key is set
      - USPTO ODP: key is not set
      - Semantic Scholar: key is not set
      - Mistral: key is not set

      Rules. A set key makes its office callable; whether a route answers is known only when the call returns. A missing key makes every tool of that office answer "not configured" with the settings path: name that gap as a MISSING-KEY gap, never as a data or coverage gap, and do not retry the call. Mistral is the OCR key, not a patent office. Text this host has no source for (US claims) is a paid FlowLeap service; the tool result names the route to take."
    `)
    expect(text.startsWith(`${KEY_STATE_HEADING}:`)).toBe(true)
  })

  it('registers the section at order 1, reads presence from the records, and follows record changes without exposing a value', async () => {
    const { store, sectionText, settled } = await bench()
    expect(await sectionText()).toContain('- EPO OPS: key is not set')

    await store.write('epo-ops', { consumerKey: 'ck-secret', consumerSecret: 'cs-secret' })
    await settled()
    const withKey = await sectionText()
    expect(withKey).toContain('- EPO OPS: key is set')
    expect(withKey).not.toContain('ck-secret')
    expect(withKey).not.toContain('cs-secret')
    expect(await readKeyPresence(store)).toEqual({ ...NO_KEYS, 'epo-ops': true })

    await store.remove('epo-ops')
    await settled()
    expect(await sectionText()).toContain('- EPO OPS: key is not set')
  })

  it('sits right after the persona slot in the assembled prompt', async () => {
    const { ctx, sectionText } = await bench()
    ctx.systemPrompt.section({ name: 'flowleap:patent-agent', order: 0, text: 'PERSONA', interpolate: false })
    const assembly = await ctx.systemPrompt.assemble()
    const names = assembly.sections.map(section => section.name)
    expect(names.indexOf('flowleap:patent-agent')).toBe(names.indexOf(KEY_STATE_SECTION_NAME) - 1)
    expect(await sectionText()).toBeDefined()
  })

  it('ignores record changes outside the connector scope and keeps the last presence when a read fails', async () => {
    const { ctx, credentials, store, sectionText, settled } = await bench()
    await store.write('mistral', { apiKey: 'mk' })
    await settled()
    expect(await sectionText()).toContain('- Mistral: key is set')

    const describeRecord = vi.spyOn(credentials, 'describeRecord')
    ctx.emit('credentials/record-updated', parseCredentialKey('other-plugin/token'))
    await settled()
    expect(describeRecord).not.toHaveBeenCalled()

    const warn = vi.spyOn(ctx.logger, 'warn')
    describeRecord.mockRejectedValue(new Error('keychain locked'))
    await store.remove('mistral')
    await settled()
    expect(warn).toHaveBeenCalledWith('flowleap-connectors: key state not read; the prompt keeps the last presence', expect.any(Error))
    expect(await sectionText()).toContain('- Mistral: key is set')
  })
})
