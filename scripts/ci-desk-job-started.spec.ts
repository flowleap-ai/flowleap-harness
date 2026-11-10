import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const hook = resolve(import.meta.dirname, '../.github/ci-desk/job-started.sh')
const repository = 'flowleap-ai/flowleap-harness'
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function runHook(env: Record<string, string>, event?: unknown): { status: number | null; stderr: string } {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-desk-hook-'))
  directories.push(directory)
  const eventPath = join(directory, 'event.json')
  if (event !== undefined) writeFileSync(eventPath, JSON.stringify(event))
  const result = spawnSync('bash', [hook], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', GITHUB_REPOSITORY: repository, GITHUB_EVENT_PATH: eventPath, ...env },
  })
  return { status: result.status, stderr: result.stderr }
}

function pullRequest(head: string, login = 'maintainer'): unknown {
  return { pull_request: { head: { repo: { full_name: head } }, user: { login } } }
}

describe('desk runner image', () => {
  it('installs the job-started hook at a path the runner accepts', () => {
    const dockerfile = readFileSync(resolve(import.meta.dirname, '../.github/ci-desk/Dockerfile'), 'utf8')
    const hookPath = /^ENV ACTIONS_RUNNER_HOOK_JOB_STARTED=(\S+)$/m.exec(dockerfile)?.[1]
    // The runner rejects a hook whose path does not end in .sh, .ps1, or .js.
    expect(hookPath).toMatch(/\.(sh|ps1|js)$/)
    expect(dockerfile).toContain(`COPY job-started.sh ${String(hookPath)}`)
  })
})

describe.skipIf(process.platform === 'win32')('desk job-started hook', () => {
  it('accepts a push to flowleap and a pull request from this repository', () => {
    expect(runHook({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/flowleap', GITHUB_ACTOR: 'maintainer' }, {}).status).toBe(0)
    expect(runHook({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_ACTOR: 'maintainer' }, pullRequest(repository)).status).toBe(0)
  })

  it.each([
    ['a fork pull request', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_ACTOR: 'outsider' }, pullRequest('outsider/flowleap-harness', 'outsider'), 'pull request from outsider/flowleap-harness'],
    ['a Dependabot pull request', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_ACTOR: 'dependabot[bot]' }, pullRequest(repository, 'dependabot[bot]'), 'Dependabot pull request'],
    ['a push to another branch', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/topic', GITHUB_ACTOR: 'maintainer' }, {}, 'push to refs/heads/topic'],
    ['pull_request_target', { GITHUB_EVENT_NAME: 'pull_request_target', GITHUB_ACTOR: 'outsider' }, pullRequest(repository), 'event pull_request_target'],
    ['workflow_run', { GITHUB_EVENT_NAME: 'workflow_run', GITHUB_ACTOR: 'maintainer' }, {}, 'event workflow_run'],
    ['another repository', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/flowleap', GITHUB_REPOSITORY: 'outsider/flowleap-harness' }, {}, 'repository outsider/flowleap-harness'],
    ['a missing event payload', { GITHUB_EVENT_NAME: 'pull_request' }, undefined, 'no event payload'],
  ])('refuses %s before the first step', (_, env, event, reason) => {
    const result = runHook(env, event)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`desk refuses this job: ${reason}`)
  })
})
