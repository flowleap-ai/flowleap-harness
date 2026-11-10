/**
 * Process-spawning cases set Vitest's case timeout to 90 seconds, including
 * plain local runs without a CI override. Configuration-only cases keep the default.
 * Cases that write probe files write them into a private checkout view, never
 * into the checkout that other tests list and compile.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flattenDiagnosticMessageText, parseConfigFileTextToJson, parseJsonConfigFileContent, readConfigFile, sys } from 'typescript'
import { describe, expect, it, onTestFinished } from 'vitest'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const oxlintCli = fileURLToPath(new URL('../node_modules/oxlint/bin/oxlint', import.meta.url))
const tsxCli = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function runRepositoryOxlint(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [tsxCli, 'scripts/run-oxlint.ts', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
}

function runOxlint(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [oxlintCli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
}

function normalizedOutput(result: ReturnType<typeof runOxlint>): string {
  return `${result.stdout}${result.stderr}`.replaceAll('\\', '/')
}

/**
 * Creates a checkout view under the system temporary directory and removes it when the case finishes.
 * The writable directories and their ancestors are real directories whose files are copies;
 * every other directory links to the checkout. Files are copied because Windows requires a
 * privilege for file symbolic links but not for directory junctions.
 * @param writableDirectories - checkout-relative directories, with `/` separators, that receive probe files.
 * @returns the absolute view root, with symbolic links in its own path resolved.
 */
async function createCheckoutView(writableDirectories: readonly string[]): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'oxlint-contract-')))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await mirrorCheckout(repositoryRoot, root, writableDirectories.map(directory => directory.split('/')))
  await Promise.all(writableDirectories.map(directory => mkdir(join(root, directory), { recursive: true })))
  return root
}

async function mirrorCheckout(source: string, target: string, writable: ReadonlyArray<readonly string[]>): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    const below = writable.filter(segments => segments[0] === entry.name).map(segments => segments.slice(1))
    if (entry.isDirectory() && below.length > 0) {
      await mkdir(to)
      await mirrorCheckout(from, to, below.filter(segments => segments.length > 0))
    } else if (entry.isDirectory()) {
      await symlink(from, to, 'junction')
    } else if (entry.isFile()) {
      await copyFile(from, to)
    } else {
      await symlink(from, to)
    }
  }))
}

function projectFileNames(tsconfigPath: string): string[] {
  const read = readConfigFile(tsconfigPath, path => sys.readFile(path))
  if (read.error !== undefined) throw new Error(flattenDiagnosticMessageText(read.error.messageText, '\n'))
  return parseJsonConfigFileContent(read.config, sys, dirname(tsconfigPath), undefined, tsconfigPath).fileNames
}

describe('Oxlint executable contract', () => {
  it('keeps probe files out of the checkout that concurrent tests list', async () => {
    const project = 'packages/fs/fs-observation-policy'
    const probe = `${project}/src/oxlint-contract-probe.ts`
    const root = await createCheckoutView([`${project}/src`])
    await writeFile(join(root, probe), 'export {}\n')

    expect(projectFileNames(join(root, project, 'tsconfig.json'))).toContain(join(root, probe).replaceAll('\\', '/'))
    expect(projectFileNames(join(repositoryRoot, project, 'tsconfig.json')).filter(path => path.includes('oxlint-contract')))
      .toEqual([])
  })

  it('discovers the owning TypeScript project for every file class', async () => {
    const probes = [
      ['host package source', 'packages/fs/fs-observation-policy/src', 'packages/fs/fs-observation-policy/tsconfig.json'],
      ['host package test', 'packages/fs/fs-observation-policy/tests', 'tsconfig.host.json'],
      ['client package source', 'packages/client/ui-primitives/src', 'packages/client/ui-primitives/tsconfig.json'],
      // A test under packages/client states its face in the filename, so the
      // probe carries the Client suffix to reach the Client aggregate.
      ['client package test', 'packages/client/ui-trajectory/tests', 'tsconfig.client.json', '.client.ts'],
      ['CLI profile test', 'apps/cli/tests/profiles/headless/tests', 'tsconfig.host.json'],
      ['website', 'website', 'tsconfig.host.json'],
    ] as const
    const source = `export function probePromise(): Promise<void> {
  return Promise.resolve()
}

probePromise()
`
    const root = await createCheckoutView(probes.map(([, parent]) => parent))
    const paths = probes.map(([label, parent, tsconfig, extension = '.ts']) =>
      [label, `${parent}/oxlint-contract-probe${extension}`, tsconfig] as const)
    await Promise.all(paths.map(([, path]) => writeFile(join(root, path), source)))
    const clientScript = 'scripts/client-bundle-purity.spec.ts'

    const result = runOxlint(root, [
      '--format',
      'unix',
      ...paths.map(([, path]) => path),
      clientScript,
    ], { OXC_LOG: 'debug' })
    const output = normalizedOutput(result)

    expect(result.error).toBeUndefined()
    expect(result.status, output).toBe(1)
    for (const [label, path, tsconfig] of paths) {
      expect(output, label).toContain(`${path}:5:1: Promises must be awaited`)
      expect(output, `${label} project`).toContain(
        `Got tsconfig for file ${join(root, path).replaceAll('\\', '/')}: ${join(root, tsconfig).replaceAll('\\', '/')}`,
      )
    }
    expect(output.match(/typescript\(no-floating-promises\)/g)).toHaveLength(probes.length)
    expect(output, 'client aggregate script project').toContain(
      `Got tsconfig for file ${join(root, clientScript).replaceAll('\\', '/')}: ${join(root, 'tsconfig.client.json').replaceAll('\\', '/')}`,
    )
    expect(output).not.toContain('Unmatched file:')
  }, 90_000)

  it('runs JavaScript compatibility and nursery rules', async () => {
    const root = await createCheckoutView(['scripts'])
    const path = 'scripts/oxlint-contract-probe.ts'
    const source = `export function firstProbe(): number {
  const first = 1
  const second = 2
  return first + second
}

export function secondProbe(): number {
  const first = 1
  const second = 2
  return first + second
}

export function hasValue(value: string): boolean {
  return value !== undefined
}

export const longProbe = 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1
`

    await writeFile(join(root, path), source)
    const result = runOxlint(root, ['--format', 'unix', path])
    const output = normalizedOutput(result)

    expect(result.error).toBeUndefined()
    expect(result.status, output).toBe(1)
    expect(output).toContain('@stylistic(max-len)')
    expect(output).toContain('sonarjs(no-identical-functions)')
    expect(output).toContain('typescript(no-unnecessary-condition)')
  }, 90_000)

  it('keeps the complete stylistic contract in Oxlint', async () => {
    const oxlintPath = join(repositoryRoot, '.oxlintrc.json')
    const result = parseConfigFileTextToJson(oxlintPath, await readFile(oxlintPath, 'utf8'))
    if (result.error !== undefined) {
      throw new Error(flattenDiagnosticMessageText(result.error.messageText, '\n'))
    }
    const parsed: unknown = result.config
    if (!isRecord(parsed) || !isUnknownArray(parsed.overrides)) {
      throw new Error('.oxlintrc.json must contain an overrides array')
    }
    expect(parsed.ignorePatterns).toEqual(expect.arrayContaining([
      'packages/typert/generator/tests/fixtures/type-model/**',
    ]))
    const stylisticOverride = parsed.overrides.find((value: unknown) =>
      isRecord(value) && isRecord(value.rules) && '@stylistic/max-len' in value.rules)
    if (!isRecord(stylisticOverride) || !isRecord(stylisticOverride.rules)) {
      throw new Error('.oxlintrc.json must contain the @stylistic validator override')
    }
    expect(stylisticOverride.rules).toMatchObject({
      '@stylistic/indent': ['error', 2],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'none' },
        singleline: { delimiter: 'semi', requireLast: false },
      }],
      '@stylistic/max-len': ['error', { code: 140, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true }],
    })
    const typeGraphOverride = parsed.overrides.find((value: unknown) =>
      isRecord(value)
      && isUnknownArray(value.files)
      && value.files.includes('packages/typert/generator/tests/fixtures/type-model/packages/host/src/models.ts'))
    expect(typeGraphOverride).toMatchObject({
      rules: { '@stylistic/quotes': 'off' },
    })
  })

  it('checks preserved TypeGraph syntax without type-aware analysis', () => {
    const result = runOxlint(repositoryRoot, [
      '--config',
      '.oxlintrc.staged.json',
      'packages/typert/generator/tests/fixtures/type-model',
    ])

    expect(result.error).toBeUndefined()
    expect(result.status, normalizedOutput(result)).toBe(0)
  }, 90_000)

  it('keeps repository lint workflows Oxlint-only', async () => {
    const packageJson: unknown = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
    if (!isRecord(packageJson) || !isRecord(packageJson.scripts) || !isRecord(packageJson.devDependencies)) {
      throw new Error('package.json must contain scripts and devDependencies objects')
    }

    expect(packageJson.scripts['lint:contracts-ready']).toBe('tsx scripts/run-oxlint.ts .')
    expect(packageJson.scripts['lint:fix:contracts-ready']).toBe(
      'tsx scripts/run-oxlint.ts --config .oxlintrc.staged.json packages/typert/generator/tests/fixtures/type-model --fix && tsx scripts/run-oxlint.ts . --fix',
    )
    expect(packageJson.devDependencies).not.toHaveProperty('eslint')
    expect(packageJson.devDependencies).not.toHaveProperty('@typescript-eslint/parser')
    expect(existsSync(join(repositoryRoot, 'eslint.format.config.mjs'))).toBe(false)

    const lefthook = await readFile(join(repositoryRoot, 'lefthook.yml'), 'utf8')
    expect(lefthook).toContain('scripts/run-oxlint.ts --config .oxlintrc.staged.json --fix')
    expect(lefthook).not.toContain('node_modules/.bin/eslint')
    expect(lefthook).not.toContain('eslint.format.config.mjs')
  })

  it('reports an unused suppression', async () => {
    const root = await createCheckoutView(['scripts'])
    const path = 'scripts/oxlint-contract-probe.ts'

    await writeFile(join(root, path), '// oxlint-disable-next-line no-console\nexport const value = 1\n')
    const result = runOxlint(root, ['--format', 'unix', path])
    const output = normalizedOutput(result)

    expect(result.error).toBeUndefined()
    expect(result.status, output).toBe(0)
    expect(output).toContain('Unused oxlint-disable directive')
  }, 90_000)

  it('allows Session history reads only in tests or with existing-call waivers', async () => {
    const exampleRoot = 'examples/oxlint-contract-probe'
    const testPaths = [
      'packages/core/session/tests/oxlint-contract-probe.ts',
      'apps/cli/tests/oxlint-contract-probe.ts',
      `${exampleRoot}/tests/reads.ts`,
      'scripts/oxlint-contract-probe.spec.ts',
    ]
    const productionPaths = [
      'packages/core/session/src/oxlint-contract-probe.ts',
      'scripts/oxlint-contract-probe.ts',
    ]
    const paths = [...testPaths, ...productionPaths]
    const reads = `import { Session, SessionSeq } from '@deepseek-ai/dsh-session'

export function reads(session: Session): void {
  session.snapshotEvents()
  session.eventAt(SessionSeq(0))
  session.ownEvents()
}
`
    const existing = `import { Session, SessionSeq } from '@deepseek-ai/dsh-session'

export function reads(session: Session): void {
  // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
  session.snapshotEvents()
  // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
  session.eventAt(SessionSeq(0))
  // oxlint-disable-next-line typescript/no-deprecated -- Existing Session history read; migration deferred.
  session.ownEvents()
}
`
    const unrelated = `
/** @deprecated Use the replacement API. */
function oldApi(): void {}

export function unrelatedRead(): void {
  oldApi()
}
`
    const root = await createCheckoutView([
      'packages/core/session/tests',
      'packages/core/session/src',
      'apps/cli/tests',
      `${exampleRoot}/tests`,
      'scripts',
    ])

    await writeFile(join(root, exampleRoot, 'tsconfig.json'), JSON.stringify({
      extends: '../../tsconfig.base.json',
      include: ['tests/**/*.ts'],
    }))
    await Promise.all([
      ...testPaths.map(path => writeFile(join(root, path), reads)),
      ...productionPaths.map(path => writeFile(join(root, path), existing)),
    ])
    const args = ['--format', 'unix', ...paths]
    const allowed = runRepositoryOxlint(root, args)
    expect(allowed.error).toBeUndefined()
    expect(allowed.signal).toBeNull()
    expect(allowed.status, normalizedOutput(allowed)).toBe(0)

    await Promise.all([
      ...testPaths.map(path => writeFile(join(root, path), reads + unrelated)),
      ...productionPaths.map(path => writeFile(join(root, path), reads)),
    ])
    const rejected = runRepositoryOxlint(root, args)
    const output = normalizedOutput(rejected)
    expect(rejected.error).toBeUndefined()
    expect(rejected.signal).toBeNull()
    expect(rejected.status, output).toBe(1)
    const diagnostics = output.split('\n').filter(line => /:\d+:\d+: `\w+` is deprecated\./.test(line))
    for (const path of testPaths) {
      const reported = diagnostics.filter(line => line.startsWith(`${path}:`))
      expect(reported, output).toHaveLength(1)
      expect(reported[0]).toContain('`oldApi` is deprecated')
    }
    for (const path of productionPaths) {
      expect(diagnostics.filter(line => line.startsWith(`${path}:`)), output).toHaveLength(3)
    }
    for (const method of ['snapshotEvents', 'eventAt', 'ownEvents', 'oldApi']) {
      expect(output).toContain(`\`${method}\` is deprecated`)
    }
    expect(output).toContain(
      'See the [Agent Note](../../../../.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md).',
    )
  }, 90_000)

  it('accepts an ignored-only staged selection', () => {
    const result = runOxlint(repositoryRoot, [
      '--fix',
      '--no-error-on-unmatched-pattern',
      'scripts/install-lefthook.mjs',
    ])

    expect(result.error).toBeUndefined()
    expect(result.status, normalizedOutput(result)).toBe(0)
  }, 90_000)

  it('keeps staged validation project-free while preserving source rules', async () => {
    const configPath = join(repositoryRoot, '.oxlintrc.staged.json')
    const result = parseConfigFileTextToJson(configPath, await readFile(configPath, 'utf8'))
    if (result.error !== undefined) {
      throw new Error(flattenDiagnosticMessageText(result.error.messageText, '\n'))
    }
    const stagedConfig: unknown = result.config
    if (!isRecord(stagedConfig)) throw new Error('.oxlintrc.staged.json must contain a config object')
    expect(stagedConfig).toMatchObject({
      extends: ['./.oxlintrc.json'],
      options: { typeAware: false },
    })
    expect(stagedConfig.ignorePatterns).not.toContain('packages/typert/generator/tests/fixtures/type-model/**')

    const root = await createCheckoutView(['scripts'])
    const path = 'scripts/staged-lint-probe.ts'
    await writeFile(join(root, path), 'export const value={answer:1};\n')
    const lint = runOxlint(root, ['--config', '.oxlintrc.staged.json', '--format', 'unix', path])
    const output = normalizedOutput(lint)

    expect(lint.error).toBeUndefined()
    expect(lint.status, output).toBe(1)
    expect(output).toContain('@stylistic')
    expect(output).not.toContain('typescript(')
  }, 90_000)

  it('preserves successful fix output channels', async () => {
    const root = await createCheckoutView(['scripts'])
    const path = 'scripts/staged-lint-probe.ts'
    await writeFile(join(root, path), '// oxlint-disable-next-line no-console\nexport const value = 1\n')
    const result = runRepositoryOxlint(root, ['--config', '.oxlintrc.staged.json', '--format', 'unix', '--fix', path])

    expect(result.error).toBeUndefined()
    expect(result.status, normalizedOutput(result)).toBe(0)
    expect(result.stdout).toContain('Unused oxlint-disable directive')
    expect(result.stderr).toBe('')
  }, 90_000)

  it('prints only the final diagnostics when a fix retry still fails', async () => {
    const root = await createCheckoutView(['scripts'])
    const path = 'scripts/staged-lint-probe.ts'
    await writeFile(join(root, path), `export const longProbe = ${'1 + '.repeat(80)}1\n`)
    const result = runRepositoryOxlint(root, ['--config', '.oxlintrc.staged.json', '--format', 'unix', '--fix', path])
    const output = normalizedOutput(result)

    expect(result.error).toBeUndefined()
    expect(result.status, output).toBe(1)
    expect(output.match(/@stylistic\(max-len\)/g)).toHaveLength(1)
  }, 90_000)

  it.each(['--fix', '--fix-suggestions', '--fix-dangerously'])(
    'converges overlapping staged stylistic fixes through Oxlint under %s',
    async (fixFlag) => {
      const root = await createCheckoutView(['scripts/.oxlint-contract-probe'])
      const path = 'scripts/.oxlint-contract-probe/fix.ts'
      await writeFile(join(root, path), 'const value={answer:1};  \nconsole.log(value)\n')

      const lintResult = runRepositoryOxlint(root, ['--config', '.oxlintrc.staged.json', fixFlag, path])

      expect(lintResult.error).toBeUndefined()
      expect(lintResult.status, normalizedOutput(lintResult)).toBe(0)
      expect(normalizedOutput(lintResult)).not.toContain('@stylistic')
      await expect(readFile(join(root, path), 'utf8')).resolves.toBe('const value={ answer:1 }\nconsole.log(value)\n')
    },
    90_000,
  )
})
