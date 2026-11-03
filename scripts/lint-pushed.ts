/**
 * Run the CI type-aware Oxlint profile on the files a `git push` sends.
 *
 * The pre-commit lint uses `.oxlintrc.staged.json`, which turns type-aware
 * rules off for speed; CI `lint` runs them. The lefthook pre-push job runs this
 * script after `pnpm run typecheck`, so the type information is current.
 * Usage: `tsx scripts/lint-pushed.ts <remote>` with git's pre-push lines on stdin.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LINTED_FILE = /\.(?:ts|tsx|mts|cts)$/u
const DELETED_REF = /^0+$/u

/**
 * Read the local commits of git's pre-push input.
 * @param input - git pre-push stdin: one `<local ref> <local sha> <remote ref> <remote sha>` line per pushed ref.
 * @returns the local commit of each pushed ref; deleted refs are omitted.
 */
export function pushedCommits(input: string): string[] {
  return input.split('\n').flatMap((line) => {
    const localSha = line.trim().split(/\s+/u)[1]
    return localSha === undefined || DELETED_REF.test(localSha) ? [] : [localSha]
  })
}

/**
 * Select the files that type-aware lint checks.
 * @param paths - repository-relative paths changed by the pushed commits.
 * @param exists - whether a path exists in the worktree.
 * @returns sorted, distinct TypeScript paths that still exist.
 */
export function lintedFiles(paths: readonly string[], exists: (path: string) => boolean): string[] {
  return [...new Set(paths)].filter(path => LINTED_FILE.test(path) && exists(path)).sort()
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`lint-pushed: git ${args.join(' ')} failed: ${result.stderr.trim()}`)
  return result.stdout
}

if (import.meta.main) {
  const remote = process.argv[2]
  if (remote === undefined || remote === '') throw new Error('lint-pushed: expected the remote name as the first argument.')
  const commits = pushedCommits(readFileSync(0, 'utf8'))
  // Commits that the remote already has were linted by CI; merge commits only combine linted commits.
  const changed = commits.length === 0
    ? []
    : git(['log', '--no-merges', '--name-only', '--format=', ...commits, '--not', `--remotes=${remote}`]).split('\n')
  const files = lintedFiles(changed, path => existsSync(resolve(path)))
  if (files.length === 0) {
    console.log('lint-pushed: no pushed TypeScript files.')
  } else {
    console.log(`lint-pushed: type-aware lint of ${String(files.length)} pushed file(s).`)
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', 'scripts/run-oxlint.ts', '--no-error-on-unmatched-pattern', ...files], { stdio: 'inherit' })
    if (result.status !== 0) {
      console.error('lint-pushed: fix the errors above, or run `pnpm run lint` for the full CI lint.')
      process.exitCode = 1
    }
  }
}
