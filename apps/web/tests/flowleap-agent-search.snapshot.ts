/**
 * A FlowLeap agent from the agent builder runs in the flowleap-web composition: its folder registers an agent preset,
 * a Session of that preset follows the agent's instructions, has only the chosen connectors, and cites a page of the
 * agent's PDF that `search_agent_files` found.
 */
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type { AgentId } from '@deepseek-ai/dsh-flowleap-agent-builder'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  fixtureUserPrompts, launchWebScaffold, readPersistedEvents, selectedSessionFixture, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/flowleap-agent-search', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const MODE = webSnapshotMode()
const AGENT = 'office-action-responder-a1b2c3' as AgentId

it.skipIf(MODE === 'record')('runs an agent preset that searches its own PDF with only the chosen connectors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-agent-search-'))
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
  // The agent folder as the agent form leaves it, below $DSH_HOME/agents of the scaffold.
  const harnessHome = join(root, 'home')
  const folder = join(harnessHome, 'agents', AGENT)
  await mkdir(join(folder, 'files'), { recursive: true })
  await writeFile(join(folder, 'agent.yaml'), 'name: Office action responder\ndescription: Drafts responses to office actions.\nconnectors:\n  - epo-ops\n')
  await writeFile(join(folder, 'instructions.md'), 'Answer from the firm playbook. Cite each passage with the file name and the page.\n')
  await copyFile(join(DIR, 'Playbook.pdf'), join(folder, 'files', 'Playbook.pdf'))
  // The shipped flowleap-web rows stay; the paid MCP server and the model route are external inputs, and a small
  // context limit puts the agent in the search mode.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-agent-search-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
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
    '- id: flowleap-agent-builder',
    '  config:',
    '    contextLimitTokens: 10',
    '    maxFileBytes: 52428800',
    '    basePreset: patent',
    '    presetOrder: 100',
    '    maxSearchResults: 8',
    '    maxReadLocations: 10',
    '',
  ].join('\n'))
  const parentPath = await selectedSessionFixture(join(DIR, 'session.v4.jsonl'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    replayFixture: parentPath, agentPresets: { default: AGENT }, harnessHome,
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold
  await ctx.flowleapAgentCatalog.settled()
  expect(ctx.flowleapAgentCatalog.read(AGENT)).toMatchObject({
    mode: 'search', files: [{ name: 'Playbook.pdf', state: { kind: 'indexed' }, locations: 2, unit: 'page' }],
  })
  expect((await ctx.agentPresets.list()).find(row => row.id === AGENT)).toEqual({
    id: AGENT, name: 'Office action responder', description: 'Drafts responses to office actions.', order: 100,
  })

  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error('created chat has no Agent')
  expect(agent.session.header.agentPreset).toBe(AGENT)
  const names = ctx.tools.schemas(agent).map(schema => schema.name)
  expect(names).toEqual(expect.arrayContaining(['search_agent_files', 'read_agent_file', 'get_bibliography']))
  expect(names).not.toContain('get_us_application')
  expect(names).not.toContain('search_academic')
  const prompt = fixtureUserPrompts(await readFile(parentPath, 'utf8'))[0]
  if (prompt === undefined) throw new Error('fixture has no user prompt')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const result = agent.session.snapshotEvents().find(event => event.type === 'tool/result')
  expect(JSON.stringify(result)).toContain('<<<agent-files>>>\\n=== Playbook.pdf | page 2 ===')
  expect(await readPersistedEvents(scaffold, sessionId)).toEqual(agent.session.snapshotEvents())
}, 90_000)
