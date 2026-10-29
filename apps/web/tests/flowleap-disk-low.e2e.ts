/**
 * While the firm host's disk low flag exists, the flowleap-web composition refuses an agent-builder upload and a chat
 * attachment with STORAGE_LOW, and keeps reads and agent edits working; without the flag both uploads work
 * (flowleap-harness#62).
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-flowleap-agent-builder'
import type {} from '@deepseek-ai/dsh-workspace'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/flowleap-web', import.meta.url))
const MESSAGE = 'The firm server is low on disk space. Ask your administrator.'
/** The generic attachment store's refusal text; the client localizes by `reason`. */
const STORE_MESSAGE = 'Uploads are refused while the host is low on storage.'

it('refuses agent-builder uploads and chat attachments while the disk low flag exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-flowleap-disk-low-'))
  const resources: { scaffold?: WebScaffold } = {}
  onTestFinished(async () => {
    try { await resources.scaffold?.close() } finally { await rm(root, { recursive: true, force: true }) }
  })
  // The host's flag, as the firm host would mount it; the bundle's own path is /run/flowleap/host/disk-low.
  const flag = join(root, 'host', 'disk-low')
  await mkdir(join(root, 'host'))
  const fixtureBundle = join(root, 'fixture-bundle')
  await mkdir(fixtureBundle)
  await writeFile(join(fixtureBundle, 'package.json'), JSON.stringify({
    name: 'flowleap-disk-low-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
  }))
  await writeFile(join(fixtureBundle, 'cordis.patch.yml'), [
    '- id: mcp-flowleap',
    '  disabled: true',
    '- id: attachment-local',
    '  config:',
    `    storageLowFlagPath: ${flag}`,
    '- id: flowleap-agent-builder',
    '  config:',
    '    contextLimitTokens: 50000',
    '    maxFileBytes: 52428800',
    '    basePreset: patent',
    '    presetOrder: 100',
    '    maxSearchResults: 8',
    '    maxReadLocations: 10',
    `    storageLowFlagPath: ${flag}`,
    '',
  ].join('\n'))
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: BUNDLE, enabled: true }, { dir: fixtureBundle, enabled: true }] },
    harnessHome: join(root, 'home'),
  })
  resources.scaffold = scaffold
  const { ctx } = scaffold
  const agent = await ctx.flowleapAgents.save({ name: 'Responder', description: 'Drafts.', instructions: 'Work.', connectors: [] })
  const workspace = await ctx.workspaceRegistry.create(scaffold.workspaceCwd)
  const { sessionId } = await ctx.sessionController.create({ workspaceId: workspace.id })

  const upload = async (path: string): Promise<unknown> => {
    const response = await scaffold.hostFetch(path, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: 'Office action text.',
    })
    return await response.json()
  }
  const agentUpload = (): Promise<unknown> => upload(`/api/flowleap-agents/upload?agent=${agent.id}&name=action.txt`)
  const chatUpload = (): Promise<unknown> => upload(`/api/session/uploadFileBinary?sessionId=${sessionId}&name=action.txt`)

  await writeFile(flag, '')
  expect(await agentUpload()).toEqual({
    ok: false, error: { code: 'flowleap-agents/invalid', message: MESSAGE, details: { field: 'file', reason: 'storage low' } },
  })
  expect(await chatUpload()).toEqual({
    ok: false, error: { code: 'session/attachment-invalid', message: STORE_MESSAGE, details: { reason: 'STORAGE_LOW' } },
  })
  // Reads and agent edits go on while the flag exists.
  expect(await ctx.flowleapAgents.list()).toEqual([{ id: agent.id, name: 'Responder', description: 'Drafts.', readOnly: false }])
  expect(await ctx.flowleapAgents.save({ name: 'Renamed', description: 'Drafts.', instructions: 'Work.', connectors: [], id: agent.id }))
    .toMatchObject({ name: 'Renamed', files: [] })

  await rm(flag)
  expect(await agentUpload()).toMatchObject({ ok: true, value: { name: 'action.txt' } })
  expect(await chatUpload()).toMatchObject({ ok: true, value: { file: { name: 'action.txt' } } })
  await ctx.flowleapAgentCatalog.settled()
}, 120_000)
