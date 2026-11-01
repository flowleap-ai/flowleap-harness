/**
 * The skill pack a packaged application carries in `<resources>/skill-pack`: the `skills` folder and
 * `pack.json`, which `scripts/prepare-skill-pack.mjs` writes from the commit the product record pins.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DesktopSkillPackSpec } from './product.ts'

/** Resource directory, relative to the application resources, that holds the packaged skill pack. */
export const DESKTOP_SKILL_PACK_RESOURCE = 'skill-pack'

/** The packaged skill pack as the shell reports it and hands it to the Host. */
export interface DesktopSkillPack {
  /** Absolute folder of `<name>/SKILL.md` bundles. */
  readonly skills: string
  /** The `version` of the pack manifest at the pinned commit. */
  readonly version: string
  /** The pinned 40-digit commit SHA. */
  readonly commit: string
  /** Host environment variable that receives {@link DesktopSkillPack.skills}. */
  readonly environment: string
}

/**
 * Read the packaged skill pack and check that it is the commit the product pins.
 * @param resourcesDir - the application resources directory (`process.resourcesPath`).
 * @param spec - the product's skill pack record.
 * @returns the packaged skill pack.
 * @throws Error when `pack.json` is missing or malformed, or names another commit.
 */
export function readPackagedSkillPack(resourcesDir: string, spec: DesktopSkillPackSpec): DesktopSkillPack {
  const directory = join(resourcesDir, DESKTOP_SKILL_PACK_RESOURCE)
  const path = join(directory, 'pack.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`desktop skill pack: cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const fields = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  if (fields.commit !== spec.commit) {
    throw new Error(`desktop skill pack: ${path} names commit ${JSON.stringify(fields.commit)}, not the pinned ${spec.commit}`)
  }
  if (typeof fields.version !== 'string' || fields.version === '') throw new Error(`desktop skill pack: ${path} has no version`)
  return { skills: join(directory, 'skills'), version: fields.version, commit: spec.commit, environment: spec.environment }
}

/**
 * The Host environment with the packaged skill pack. The packaged pack replaces a value the login shell supplies,
 * so the About panel names the skills the Host loads.
 * @param environment - the environment the Host would inherit.
 * @param pack - the packaged skill pack; undefined leaves `environment` unchanged.
 * @returns `environment`, or a copy whose `pack.environment` names `pack.skills`.
 */
export function skillPackHostEnvironment(environment: NodeJS.ProcessEnv, pack: DesktopSkillPack | undefined): NodeJS.ProcessEnv {
  return pack === undefined ? environment : { ...environment, [pack.environment]: pack.skills }
}

/**
 * The short About label values of a skill pack.
 * @param pack - the packaged skill pack.
 * @returns the pack version and the 7-digit commit.
 */
export function skillPackAboutValues(pack: DesktopSkillPack): { version: string; commit: string } {
  return { version: pack.version, commit: pack.commit.slice(0, 7) }
}
