/**
 * The office action board of the flowleap-web composition, end to end: an `office-action-scaffold` save writes the work
 * page, the board in the browser shows one card for each objection, the attorney's state, owner and note reach the
 * file and survive a reload, and "Write response plan" queues one message in the chat whose next model read of the
 * file sees them in the Session log.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it, onTestFailed, onTestFinished } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { WorkPageFile } from '@deepseek-ai/dsh-flowleap-deliverables'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  acknowledgeReloadConnectionLoss, fixtureUserPrompts, launchWebScaffold, readPersistedEvents, selectedSessionFixture, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/flowleap-office-action-board', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const MODE = webSnapshotMode()
const WORK_PAGE = 'office-actions/EP4814394/2026-09-30-analysis.md.work.json'

it.skipIf(MODE === 'record')('fills the office action board from a save and sends the attorney review into the next model read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-office-action-board-'))
  const skills = join(root, 'skills')
  await mkdir(skills)
  const previousSkills = process.env.FLOWLEAP_SKILLS_DIR
  // The bundle's skill row reads this directory; an empty one keeps a developer's skill pack out of the requests.
  process.env.FLOWLEAP_SKILLS_DIR = skills
  const resources: { scaffold?: WebScaffold; browser?: Browser } = {}
  onTestFinished(async () => {
    try {
      await resources.browser?.close()
      await resources.scaffold?.close()
    } finally {
      if (previousSkills === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
      else process.env.FLOWLEAP_SKILLS_DIR = previousSkills
      await rm(root, { recursive: true, force: true })
    }
  })
  // The shipped flowleap-web rows stay; the office connectors, the paid MCP server and the model route are external inputs.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-office-action-board-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: flowleap-connectors',
    '  disabled: true',
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  disabled: true',
    '- id: agent-default-model',
    '  config:',
    '    provider: deepseek-official',
    '    model: deepseek-v4-pro',
    '',
  ].join('\n'))
  const fixture = await selectedSessionFixture(join(DIR, 'session.v4.jsonl'))
  const [analyse, plan] = fixtureUserPrompts(await readFile(fixture, 'utf8'))
  if (analyse === undefined || plan === undefined) throw new Error('the fixture has not the two user prompts')
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    replayFixture: fixture, agentPresets: { default: 'patent' },
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold

  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error('created chat has no Agent')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: analyse }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const saved = agent.session.snapshotEvents().find(event => event.type === 'tool/result')
  expect(JSON.stringify(saved)).toContain(`Work page: ${WORK_PAGE} holds the 2 objections of this analysis`)
  const filePath = join(scaffold.workspaceCwd, WORK_PAGE)
  const file = async (): Promise<WorkPageFile> => JSON.parse(await readFile(filePath, 'utf8')) as WorkPageFile

  const browser = await chromium.launch()
  resources.browser = browser
  const page = await newEnglishPage(browser)
  const tripwire = watchConsole(page)
  onTestFailed(() => saveFailureShot(page, 'flowleap-office-action-board'))
  await page.goto(scaffold.authenticatedUrl)
  await page.getByRole('button', { name: 'Office actions', exact: true }).click()
  const board = page.getByRole('region', { name: 'Office action board' })
  await board.getByRole('heading', { level: 1, name: 'EP4814394 · EPO, European search report' }).waitFor()
  await board.getByText('Needs review: 2').waitFor()
  const cards = board.getByRole('list', { name: 'Objections in the office action' }).locator(':scope > li')
  await expect.poll(() => cards.count()).toBe(2)
  const first = cards.nth(0)
  await first.getByText('Claims 1, 2, 3, 4, 5, 6, 7').waitFor()
  await first.getByText('D1 US2016107508A1 claim 1').waitFor()
  await board.getByText('US2016107508 (A1)').waitFor()

  await first.getByRole('button', { name: 'Review state of objection 1: Needs review' }).click()
  await page.getByRole('menuitem', { name: 'Relevant', exact: true }).click()
  await board.getByText('Needs review: 1').waitFor()
  const owner = first.getByRole('textbox', { name: 'Owner of objection 1' })
  await owner.fill('M. Keller')
  await owner.press('Enter')
  const note = first.getByRole('textbox', { name: 'Note on objection 1' })
  await note.fill('Argue first; keep claim 8 as the fallback.')
  await note.blur()
  const second = cards.nth(1)
  await second.getByRole('button', { name: 'Review state of objection 2: Needs review' }).click()
  await page.getByRole('menuitem', { name: 'Not relevant', exact: true }).click()
  await expect.poll(async () => (await file()).review).toEqual({
    '1': { state: 'relevant', owner: 'M. Keller', note: 'Argue first; keep claim 8 as the fallback.' },
    '2': { state: 'not_relevant', owner: '', note: '' },
  })
  expect((await file()).findings.objections.map(objection => objection.title))
    .toEqual(['Claims 1-7 lack novelty over D1 US2016107508', 'Clarity of claims 3 and 9'])

  const warningsBeforeReload = tripwire.warnings.length
  await page.reload()
  acknowledgeReloadConnectionLoss(tripwire, warningsBeforeReload)
  await page.getByRole('button', { name: 'Office actions', exact: true }).click()
  await board.getByText('Needs review: 0').waitFor()
  await expect.poll(() => first.getByRole('textbox', { name: 'Owner of objection 1' }).inputValue()).toBe('M. Keller')
  await board.getByRole('button', { name: 'Review state of objection 2: Not relevant' }).waitFor()

  await board.getByRole('button', { name: 'Write response plan' }).click()
  await expect.poll(() => agent.session.snapshotEvents().filter(event => event.type === 'turn/end').length, { timeout: 30_000 }).toBe(2)
  await agent.whenIdle()
  const events = agent.session.snapshotEvents()
  const sent = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
  expect(JSON.stringify(sent.at(-1))).toContain(JSON.stringify(plan).slice(1, -1))
  const read = events.filter(event => event.type === 'tool/result').at(-1)
  expect(JSON.stringify(read)).toContain('\\"state\\": \\"not_relevant\\"')
  expect(JSON.stringify(read)).toContain('Argue first; keep claim 8 as the fallback.')
  expect(await readPersistedEvents(scaffold, sessionId)).toEqual(events)
  expect(tripwire.pageErrors).toEqual([])
}, 120_000)
