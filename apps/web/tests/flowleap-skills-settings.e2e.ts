/**
 * Settings > Skills (flowleap-harness#190) in the REAL flowleap-web composition: a skill of the pack shows as a
 * FlowLeap methods skill, a user skill with a pack skill's name replaces it on both cards, a pack file with a frontmatter
 * fault shows with its reason, and Show full text loads the skill body.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { saveFailureShot } from './support.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))

async function writeSkill(root: string, folder: string, frontmatter: string, body: string): Promise<void> {
  await mkdir(join(root, folder), { recursive: true })
  await writeFile(join(root, folder, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`)
}

/** Dismiss the first-run steps (the Preview notice, the connector key wizard) that block the page after it loads. */
async function dismissFirstRun(page: Page): Promise<void> {
  const step = page.getByRole('button', { name: /^(Continue|Skip for now)$/u }).first()
  for (let index = 0; index < 4; index += 1) {
    try {
      await step.click({ timeout: 5_000 })
    } catch {
      // No further first-run step appeared within the wait.
      return
    }
  }
}

it('shows each skill with its source, the replace note, the fault reason, and the full text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-skills-settings-'))
  const resources: { scaffold?: WebScaffold; browser?: Browser } = {}
  onTestFinished(async () => {
    try {
      await resources.browser?.close()
      await resources.scaffold?.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  const pack = join(root, 'pack')
  await writeSkill(pack, 'claims-check', 'name: claims-check\ndescription: Check each claim against the description.', '# Claims check\n\nRead every claim first.')
  await writeSkill(pack, 'prior-art', 'name: prior-art\ndescription: Pack prior-art method.', 'Search the offices.')
  await writeSkill(pack, 'broken-method', 'name: broken-method', 'No description.')
  const home = join(root, 'home')
  await writeSkill(join(home, 'skills'), 'prior-art', 'name: prior-art\ndescription: My own prior-art method.', 'Search my way.')

  const previous = process.env.FLOWLEAP_SKILLS_DIR
  process.env.FLOWLEAP_SKILLS_DIR = pack
  onTestFinished(() => {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
    else process.env.FLOWLEAP_SKILLS_DIR = previous
  })
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-skills-settings-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  // No hosted FlowLeap MCP server in a test.
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), '- id: mcp-flowleap\n  disabled: true\n')
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: home,
    keepBundleSkillRow: true,
  })
  resources.scaffold = scaffold
  const browser = await chromium.launch()
  resources.browser = browser
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' })
  watchConsole(page)
  onTestFailed(() => saveFailureShot(page, 'flowleap-skills-settings'))

  await page.goto(scaffold.authenticatedUrl)
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true })
  await settingsButton.waitFor()
  await dismissFirstRun(page)
  await settingsButton.click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.waitFor()
  await settings.getByRole('button', { name: 'Skills', exact: true }).click()
  await settings.getByRole('heading', { name: 'Skills', exact: true }).waitFor()
  await settings.getByText('A skill is a method that your agent follows for one type of task.', { exact: true }).waitFor()

  const claims = settings.locator('[data-skill="claims-check"]')
  await claims.waitFor()
  expect(await claims.getByText('FlowLeap methods', { exact: true }).count()).toBe(1)
  expect(await claims.getByText('Check each claim against the description.', { exact: true }).count()).toBe(1)

  const priorArt = settings.locator('[data-skill="prior-art"]')
  await expect.poll(() => priorArt.count()).toBe(2)
  const mine = priorArt.nth(0)
  expect(await mine.getByText('Mine', { exact: true }).count()).toBe(1)
  expect(await mine.getByText('Replaces the FlowLeap methods skill with the same name.', { exact: true }).count()).toBe(1)
  const replaced = priorArt.nth(1)
  expect(await replaced.getAttribute('data-replaced')).toBe('')
  expect(await replaced.getByText('Replaced by the Mine skill with the same name.', { exact: true }).count()).toBe(1)

  const faults = settings.getByRole('region', { name: 'Skills with faults', exact: true })
  const fault = faults.locator('[data-skill-fault="missing-field"]')
  await fault.waitFor()
  expect(await fault.getByText('The frontmatter has no description field.', { exact: true }).count()).toBe(1)
  expect(await fault.textContent()).toContain('SKILL.md')
  expect(await settings.locator('[data-skill="broken-method"]').count()).toBe(0)

  await claims.getByRole('button', { name: 'Show full text', exact: true }).click()
  const text = claims.getByRole('region', { name: 'Full text of claims-check', exact: true })
  await text.getByText('Read every claim first.', { exact: true }).waitFor()
  await replaced.getByRole('button', { name: 'Show full text', exact: true }).click()
  await replaced.getByRole('region', { name: 'Full text of prior-art', exact: true }).getByText('Search the offices.', { exact: true }).waitFor()
  expect(await settings.getByRole('textbox').count()).toBe(0)
}, 120_000)
