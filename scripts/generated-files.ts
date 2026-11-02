/**
 * Regenerate or check every generated file in one command.
 *
 * The root `package.json` script pairs are the generator inventory: each
 * `gen-<name>` script has a `verify-<name>` script that runs the same command
 * with `--check`. `pnpm run gen` runs every generator, then checks them all;
 * `pnpm run verify-generated` (the lefthook pre-push job) only checks.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pnpmInvocation } from './pnpm-invocation.ts'

/** One generator and the check script that compares its output with the committed files. */
export interface GeneratorPair {
  /** Suffix shared by the pair, for example `doc-graphs`. */
  name: string
  generate: `gen-${string}`
  check: `verify-${string}`
}

/** The command that fixes a failed generated-file check, printed by every check failure. */
export const REGENERATE_COMMAND = 'pnpm run gen'

/**
 * Read the generator pairs from root package scripts.
 * @param scripts - the root `package.json` `scripts` object.
 * @returns every pair in script order.
 * @throws Error when a `gen-*` script has no `verify-*` script that runs it with `--check`, so a new generator cannot ship without a check.
 */
export function generatorPairs(scripts: Readonly<Record<string, string>>): GeneratorPair[] {
  const pairs: GeneratorPair[] = []
  for (const [script, command] of Object.entries(scripts)) {
    if (!script.startsWith('gen-')) continue
    const name = script.slice('gen-'.length)
    const check = `verify-${name}` as const
    if (scripts[check] !== `${command} --check`) {
      throw new Error(`generated-files: package.json script "${script}" needs "${check}": "${command} --check"; add it so pre-push and CI check the generator's output.`)
    }
    pairs.push({ name, generate: `gen-${name}`, check })
  }
  return pairs
}

/**
 * Read the generator pairs of this repository.
 * @returns the pairs from the root `package.json`.
 */
export function repositoryGeneratorPairs(): GeneratorPair[] {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  return generatorPairs(manifest.scripts)
}

function run(args: string[]): number {
  const invocation = pnpmInvocation(args)
  return spawnSync(invocation.command, invocation.args, { stdio: 'inherit' }).status ?? 1
}

if (import.meta.main) {
  // Generators run one at a time: some read files that an earlier generator writes.
  for (const pair of repositoryGeneratorPairs()) {
    console.log(`generated-files: pnpm run ${pair.generate}`)
    if (run(['run', pair.generate]) !== 0) {
      console.error(`generated-files: ${pair.generate} failed.`)
      process.exit(1)
    }
  }
  process.exitCode = run(['run', 'verify-generated'])
}
