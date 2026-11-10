/**
 * Test driver: boots the headless profile with the ui-flowleap-folder row, calls the Add client `settings` route and the
 * `client-folder` route twice through the routes that the row registers, and writes the answers to outcome.json. The
 * client folder on disk and the workspace registry are the proof. Only the HTTP connection is a test double: it keeps the
 * registered routes so the driver can call them.
 */

import { writeFile } from 'node:fs/promises'
import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { ADD_CLIENT_ROUTES } from '@deepseek-ai/dsh-client-ui-flowleap-folder'
import { bootProductionProfile } from '../../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('client folder driver requires a config path')

const routes = new Map<string, ConnectionFetchRoute>()
const ctx = await bootProductionProfile({
  binName: 'client-folder-e2e',
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
  prepare: (root) => {
    root.provide('connection', {
      fetch: {
        register: (route: ConnectionFetchRoute) => {
          routes.set(route.path, route)
          return () => { routes.delete(route.path) }
        },
      },
    } as never)
  },
})
try {
  const call = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const route = routes.get(path)
    if (route === undefined) throw new Error(`no route ${path}`)
    const response = await route.fetch(new Request(`http://runtime.test${path}`, init))
    const body: unknown = await response.json()
    return { status: response.status, body }
  }
  const request = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: '0b7c3c3e-0000-4000-8000-000000000001', name: 'Novo Nordisk A/S', names: ['NOVO NORDISK AS'] }) }
  const settings = await call(ADD_CLIENT_ROUTES.settings)
  const first = await call(ADD_CLIENT_ROUTES.clientFolder, request)
  const second = await call(ADD_CLIENT_ROUTES.clientFolder, request)
  const workspaces = ctx.workspaceRegistry.list().map(entity => ({ id: entity.id, title: entity.title }))
  await writeFile('outcome.json', JSON.stringify({ settings, first, second, workspaces }))
} finally {
  await ctx.fiber.dispose()
}
