/** MCP resource and server-manager ownership across the resolved shipped profile templates. */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadProfile } from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const resourcePackage = '@deepseek-ai/dsh-mcp-resources'
// The FlowLeap firm worker has no agent and no tool (packages/bundle/flowleap-firm-worker), so it has no MCP consumer.
const withoutAgent = new Set(['flowleap-firm-worker'])
const agentProfiles = Object.keys(PROFILE_TEMPLATES).filter(name => !withoutAgent.has(name))

describe('shipped MCP resource composition', () => {
  it.each(agentProfiles)('%s carries one shared resource consumer without a server', (name) => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-profile-mcp-'))
    try {
      const profile = loadProfile('dsh', name, installAnchor, home)
      const warnings: string[] = []
      const rows = composeEntries([
        ...profile.layers.map(layer => layer.patches),
        profile.patches,
      ], message => warnings.push(message))

      expect(rows.filter(row => row.name === resourcePackage)).toEqual([
        { id: 'mcp-resources', name: resourcePackage },
      ])
      // The FlowLeap profiles are the shipped templates that compose an MCP server.
      expect(rows.filter(row => row.name === '@deepseek-ai/dsh-mcp-client').map(row => row.id))
        .toEqual(name.startsWith('flowleap-') ? ['mcp-flowleap'] : [])
      expect(warnings).toEqual([])

      const owners = profile.layers.filter((layer) => {
        const manifest = JSON.parse(readFileSync(join(layer.packageDir, 'package.json'), 'utf8')) as {
          dependencies?: Record<string, string>
        }
        return manifest.dependencies?.[resourcePackage] !== undefined
      })
      expect(owners.map(owner => owner.packageName)).toEqual([
        name === 'sdk-minimal' ? '@deepseek-ai/dsh-sdk-minimal' : '@deepseek-ai/dsh-base',
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it.each([...withoutAgent])('%s composes no MCP row', (name) => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-profile-mcp-'))
    try {
      const profile = loadProfile('dsh', name, installAnchor, home)
      const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches], () => {})
      expect(rows.filter(row => row.name.startsWith('@deepseek-ai/dsh-mcp-'))).toEqual([])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it.each(Object.keys(PROFILE_TEMPLATES))('%s mounts the server manager only with the Web application', (name) => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-profile-mcp-'))
    try {
      const profile = loadProfile('dsh', name, installAnchor, home)
      const rows = composeEntries([...profile.layers.map(layer => layer.patches), profile.patches])
      expect(rows.filter(row => row.name === '@deepseek-ai/dsh-mcp-manager' && row.disabled !== true)).toEqual(name === 'web'
        ? [{ id: 'mcp-manager', name: '@deepseek-ai/dsh-mcp-manager', inject: ['credentials'] }]
        : [])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
