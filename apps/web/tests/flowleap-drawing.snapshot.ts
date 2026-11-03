/**
 * A drawing request in the flowleap-web composition without the paid data plugin: `get_patent_image` reads the
 * drawing metadata and page 6 of EP4831432A1 from EPO OPS on the stored key, and the page reaches an image-input model
 * route as an image block.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-workspace'
import {
  fixtureUserPrompts, launchWebScaffold, readPersistedEvents, selectedSessionFixture, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/flowleap-drawing', import.meta.url))
const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const PAGE_6 = fileURLToPath(new URL('../../../vendor/flowleap-connectors/src/ops/__fixtures__/ep4831432a1-page6.pdf', import.meta.url))
const MODE = webSnapshotMode()
const LINK = 'published-data/images/EP/4831432/A1/fullimage'
/** The OPS image inquiry of EP4831432A1: 14 pages, drawings from page 6. */
const INQUIRY = '<?xml version="1.0" encoding="UTF-8"?><ops:world-patent-data xmlns="http://www.epo.org/exchange" xmlns:ops="http://ops.epo.org">'
  + '<ops:document-inquiry><ops:inquiry-result>'
  + `<ops:document-instance system="ops.epo.org" number-of-pages="14" desc="FullDocument" link="${LINK}">`
  + '<ops:document-format-options><ops:document-format>application/pdf</ops:document-format></ops:document-format-options>'
  + '<ops:document-section name="DRAWINGS" start-page="6"/><ops:document-section name="SEARCH_REPORT" start-page="13"/>'
  + '</ops:document-instance></ops:inquiry-result></ops:document-inquiry></ops:world-patent-data>'
const THROTTLE = { 'x-throttling-control': 'idle (images=green:200, retrieval=green:1200)' }

it.skipIf(MODE === 'record')('shows a drawing page from EPO OPS as an image block without the data plugin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-drawing-'))
  const skills = join(root, 'skills')
  await mkdir(skills)
  const previousSkills = process.env.FLOWLEAP_SKILLS_DIR
  // The bundle's skill row reads this directory; an empty one keeps a developer's skill pack out of the requests.
  process.env.FLOWLEAP_SKILLS_DIR = skills
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    vi.restoreAllMocks()
    try { await resources.scaffold?.close() } finally {
      if (previousSkills === undefined) Reflect.deleteProperty(process.env, 'FLOWLEAP_SKILLS_DIR')
      else process.env.FLOWLEAP_SKILLS_DIR = previousSkills
      await rm(root, { recursive: true, force: true })
    }
  })
  // The attorney's EPO OPS key as the settings card stores it, in the managed credentials document of the harness home.
  const harnessHome = join(root, 'home')
  await mkdir(harnessHome, { mode: 0o700 })
  await writeFile(join(harnessHome, '.credentials.yaml'), [
    'version: 1',
    'records:',
    '  flowleap-connectors/epo-ops:',
    '    kind: grant',
    '    payload: { consumerKey: ck, consumerSecret: cs }',
    '',
  ].join('\n'), { mode: 0o600 })
  // The shipped flowleap-web rows stay; the paid MCP server is off and the model route is the replay's image-input route.
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-drawing-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: llm-pi-ai',
    '  disabled: true',
    '',
  ].join('\n'))
  // The scaffold pins its text-only replay route above every bundle layer; an overlay comes after that pin.
  const route = join(root, 'route.patch.yml')
  await writeFile(route, [
    '- id: agent-default-model',
    '  config:',
    '    provider: deepseek-official',
    '    model: deepseek-v4-flash-vision-exp',
    '',
  ].join('\n'))
  const parentPath = await selectedSessionFixture(join(DIR, 'session.v4.jsonl'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    replayFixture: parentPath, agentPresets: { default: 'patent' }, harnessHome, extraOverlayPath: route,
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold

  const page6 = await readFile(PAGE_6)
  const hosts = new Set<string>()
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = input instanceof Request ? input.url : String(input)
    hosts.add(new URL(url).host)
    if (url === 'https://ops.epo.org/3.2/auth/accesstoken') return Promise.resolve(Response.json({ access_token: 'token', expires_in: 1200 }))
    if (url.endsWith('/images')) return Promise.resolve(new Response(INQUIRY, { headers: THROTTLE }))
    if (url.endsWith(`/${LINK}?Range=6`)) return Promise.resolve(new Response(page6, { headers: { ...THROTTLE, 'content-type': 'application/pdf' } }))
    return Promise.resolve(new Response('not recorded', { status: 404, headers: THROTTLE }))
  })

  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined) throw new Error('created chat has no Agent')
  const names = ctx.tools.schemas(agent).map(schema => schema.name)
  expect(names).toContain('get_patent_image')
  expect(names).not.toContain('flowleap__get_patent_image')
  const prompt = fixtureUserPrompts(await readFile(parentPath, 'utf8'))[0]
  if (prompt === undefined) throw new Error('fixture has no user prompt')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const results = agent.session.snapshotEvents().flatMap(event => event.type === 'tool/result' ? [event.data.message] : [])
  expect(results.map(result => result.isError)).toEqual([false, false])
  expect(results[1]?.content.slice(1)).toEqual([
    { type: 'text', text: 'Page 6 of EP4831432' },
    { type: 'image', attachment: expect.objectContaining({ mediaType: expect.stringMatching(/^image\/(png|jpeg)$/) as string }) as object },
  ])
  expect([...hosts]).toEqual(['ops.epo.org'])
  expect(await readPersistedEvents(scaffold, sessionId)).toEqual(agent.session.snapshotEvents())
}, 90_000)
