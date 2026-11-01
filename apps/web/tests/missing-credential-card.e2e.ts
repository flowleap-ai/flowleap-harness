/** A Turn that failed because no model credential is set shows setup copy in Chat, not the provider's developer text. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/missing-credential-card', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: missing model credential card', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, await readFile(join(SNAPSHOT_DIR, 'session.v4.jsonl'), 'utf8'), 'missing-credential-card')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('states that no model is set up, without the provider message or the failure code', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-missing-credential-card'))
    const row = page.getByRole('status').filter({ hasText: 'No model is set up' })
    await row.waitFor({ timeout: 15_000 })
    const text = await row.textContent()
    expect(text).not.toContain('DEEPSEEK_API_KEY')
    expect(text).not.toContain('MISSING_CREDENTIAL')
    await compareOrRefreshGolden(join(SNAPSHOT_DIR, 'row.expected.md'), await row.ariaSnapshot(), MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.v4.jsonl', 'row.expected.md'])
  })
})
