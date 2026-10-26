// Web e2e scenario: the first message of a new session whose default names a
// declared pi-ai route but a model that route does not serve. Admission refuses
// the prompt, so the composer reports the refusal, keeps the draft, and the
// Session log records no user message. Zero model calls: there is no fixture.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot, writeComposerDraft } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./default-model-unlisted.overlay.yml', import.meta.url))
const DRAFT = 'Summarize the open office actions.'

describe('web e2e: a first message to a model its route does not serve', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    await scaffold.ctx.settings.update('llm-pi-ai', {
      providers: {
        'origin-gateway': {
          displayName: 'Origin Gateway',
          api: 'openai-completions',
          baseURL: 'https://gateway.origin.example/v1',
          models: [{ id: 'origin-large', name: 'Origin Large' }],
        },
      },
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('refuses the prompt, keeps the draft, and logs no user message', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-default-model-unlisted'))
    const agent = scaffold.ctx.agents.list()[0]
    if (agent === undefined) throw new Error('Connecting the workspace did not create a Session')
    await page.getByRole('button', { name: 'Select model', exact: true }).waitFor({ timeout: 15_000 })

    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, DRAFT)
    const [response] = await Promise.all([
      page.waitForResponse('**/api/session/prompt'),
      page.keyboard.press('Enter'),
    ])
    expect(await response.json()).toMatchObject({
      result: {
        ok: false,
        error: {
          code: 'session/model-unavailable',
          details: { provider: 'origin-gateway', model: 'origin-missing' },
        },
      },
    })
    await page.getByText(/Select an available model before sending a message\. \(session\/model-unavailable\)/)
      .waitFor({ timeout: 10_000 })
    await expect.poll(async () => (await input.innerText()).trim(), { timeout: 10_000 }).toBe(DRAFT)
    expect(agent.session.snapshotEvents().filter(event =>
      event.type === 'user/message' || event.type === 'agent/inbox/spliced' || event.type === 'turn/start',
    )).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
