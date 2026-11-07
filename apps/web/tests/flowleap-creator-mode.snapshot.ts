/**
 * Creator mode in the flowleap-web composition: a Session of the `cordis` preset has the runtime inspection tools and
 * no web tool, and its `cordis_inspect_list` call returns the live inspection providers.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  fixtureUserPrompts, launchWebScaffold, readPersistedEvents, selectedSessionFixture, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/flowleap-creator-mode', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const MODE = webSnapshotMode()

it.skipIf(MODE === 'record')('runs Creator mode with runtime inspection and no web tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-creator-mode-'))
  const skills = join(root, 'skills')
  await mkdir(skills)
  const previousSkills = process.env.FLOWLEAP_SKILLS_DIR
  // The bundle's skill row reads this directory; an empty one keeps a developer's skill pack out of the requests.
  process.env.FLOWLEAP_SKILLS_DIR = skills
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally {
      if (previousSkills === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
      else process.env.FLOWLEAP_SKILLS_DIR = previousSkills
      await rm(root, { recursive: true, force: true })
    }
  })
  // The shipped flowleap-web rows stay; the paid MCP server and the model route are external inputs.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-creator-mode-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
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
  const parentPath = await selectedSessionFixture(join(DIR, 'session.v4.jsonl'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    replayFixture: parentPath, agentPresets: { default: 'cordis' }, harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold

  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error('created chat has no Agent')
  expect(agent.session.header.agentPreset).toBe('cordis')
  const names = ctx.tools.schemas(agent).map(schema => schema.name)
  expect(names).toEqual(expect.arrayContaining(['cordis_inspect_list', 'cordis_inspect_query', 'skill', 'get_bibliography']))
  expect(names).not.toContain('web_search')
  expect(names).not.toContain('web_fetch')
  const prompt = fixtureUserPrompts(await readFile(parentPath, 'utf8'))[0]
  if (prompt === undefined) throw new Error('fixture has no user prompt')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const result = agent.session.snapshotEvents().find(event => event.type === 'tool/result')
  if (result?.type !== 'tool/result') throw new Error('Creator mode made no tool call')
  const text = result.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
  const providers = (JSON.parse(text) as { providers: { id: string }[] }).providers.map(provider => provider.id)
  expect(providers).toEqual(expect.arrayContaining(['Service', 'Event', 'Config', 'Tool']))
  expect(await readPersistedEvents(scaffold, sessionId)).toEqual(agent.session.snapshotEvents())
}, 90_000)
